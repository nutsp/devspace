import { Badge } from "@plane/propel/badge";
import { WorkspaceSelect } from "@/components/common/workspace-select";
import { WikiGraph } from "./wiki-graph";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { Input, CustomMenu, AlertModalCore } from "@plane/ui";
import { IconButton, getIconButtonStyling } from "@plane/propel/icon-button";
import { Button } from "@plane/propel/button";
import { useTranslation } from "@plane/i18n";
import { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { FormEvent, SetStateAction } from "react";
import { usePlatformOS } from "@plane/hooks";
import { ResizableSidebar } from "@/components/sidebar/resizable-sidebar";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Outlet, useSearchParams as useRouterSearchParams } from "react-router";
import useDebounce from "@/hooks/use-debounce";
import { wikiSearchParts } from "@/helpers/wiki-search";
import useSWR from "swr";
import {
  BookOpen,
  Library,
  House,
  Plus,
  FileText,
  Search,
  ChevronDown,
  ChevronRight,
  Lock,
  Pencil,
  MoreHorizontal,
  Trash2,
  PanelLeft,
} from "lucide-react";
import { cn } from "@plane/utils";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { ProjectService } from "@/services/project/project.service";
import { wikiCollectionPermissions } from "@/helpers/wiki-permissions";
import { WikiService } from "@/services/wiki.service";
import type { WikiCollection, WikiDocument } from "@/services/wiki.service";
import { ProjectPageService } from "@/services/page";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { PageHead } from "@/components/core/page-title";
import { ProjectsAppPowerKProvider } from "@/components/power-k/projects-app-provider";

import { WorkspaceToolDialog } from "@/components/common/workspace-tool-dialog";
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { availableWikiParents } from "@/helpers/wiki-page-tree";
import { revealWikiSidebarPage, wikiSidebarStorageKey } from "@/helpers/wiki-sidebar-state";
import { useWikiSidebarState } from "@/hooks/use-wiki-sidebar-state";

import { WikiPageDragRow, WikiRootDropTarget } from "./wiki-page-dnd";
import type { WikiDropPosition } from "@/helpers/wiki-page-tree";

type PageDialogOptions = { page?: WikiDocument; collectionId?: string; parentId?: string };
const service = new WikiService();
const pageService = new ProjectPageService();
const projectService = new ProjectService();
const WikiContext = createContext<{
  collections: WikiCollection[];
  pages: WikiDocument[];
  refresh: () => Promise<void>;
  loading: boolean;
  error: boolean;
  moving: boolean;
  movePage: (page: WikiDocument, targetId: string | null, position: WikiDropPosition) => Promise<void>;
  openPageDialog: (options?: PageDialogOptions) => void;
  openCollectionDialog: (collection?: WikiCollection) => void;
  canEditCollections: boolean;
  canDeleteCollections: boolean;
  collapsedPages: Record<string, boolean>;
  setPageCollapsed: (id: string, collapsed: boolean) => void;
} | null>(null);
export function useWiki() {
  const context = useContext(WikiContext);
  if (!context) throw new Error("Wiki must be rendered within its layout");
  return context;
}
const inputStyle = "w-full text-primary disabled:cursor-not-allowed disabled:text-disabled";

export const WikiLayout = observer(function WikiLayout() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, pageId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const pathname = usePathname();
  const router = useAppRouter();
  const { fetchPartialProjects } = useProject();
  const { fetchUserProjectPermissions, getWorkspaceRoleByWorkspaceSlug } = useUserPermissions();
  const { canEdit: canEditCollections, canDelete: canDeleteCollections } = wikiCollectionPermissions(
    getWorkspaceRoleByWorkspaceSlug(slug)
  );
  const { sidebarCollapsed, toggleSidebar, toggleSidebarPeek } = useAppTheme();
  const { isMobile } = usePlatformOS();
  const [deletingCollection, requestDelete] = useState<WikiCollection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const collections = useSWR(`wiki-collections-${slug}`, () => service.collections(slug));
  const pages = useSWR(`wiki-pages-${slug}`, () => service.pages(slug), { refreshInterval: 15000 });
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = navigationRef.current;
    if (!element) return;
    return autoScrollForElements({ element, canScroll: ({ source }) => source.data.kind === "workspace-wiki-page" });
  }, []);
  const { data: currentUser } = useUser();
  const sidebarKey = wikiSidebarStorageKey(currentUser?.id, slug);
  const { state: sidebar, ready: sidebarReady, restored, update: updateSidebar } = useWikiSidebarState(sidebarKey);
  const { collectionsOpen, expandedCollections, collapsedPages } = sidebar;
  const setSidebarWidth = useCallback(
    (action: SetStateAction<number>) => {
      updateSidebar((previous) => ({
        ...previous,
        width: typeof action === "function" ? action(previous.width) : action,
      }));
    },
    [updateSidebar]
  );
  const setCollectionsOpen = (action: (open: boolean) => boolean) =>
    updateSidebar((previous) => ({ ...previous, collectionsOpen: action(previous.collectionsOpen) }));
  const setExpandedCollections = (action: (map: Record<string, boolean>) => Record<string, boolean>) =>
    updateSidebar((previous) => ({ ...previous, expandedCollections: action(previous.expandedCollections) }));
  const setPageCollapsed = useCallback(
    (id: string, collapsed: boolean) => {
      updateSidebar((previous) => ({ ...previous, collapsedPages: { ...previous.collapsedPages, [id]: collapsed } }));
    },
    [updateSidebar]
  );
  const previousRoute = useRef<{ key: string | null; route: string } | null>(null);
  useEffect(() => {
    if (!sidebarReady) return;
    const route = `${projectId || ""}/${pageId || ""}`;
    const previous = previousRoute.current;
    if (previous?.key === sidebarKey && previous.route === route) return;
    previousRoute.current = { key: sidebarKey, route };
    // Refresh/re-entry restores the user's exact state; only a new in-app selection reveals its path.
    if ((!previous || previous.key !== sidebarKey) && restored) return;
    if (projectId)
      updateSidebar((state) =>
        revealWikiSidebarPage(state, projectId.toString(), pageId?.toString(), pages.data ?? [])
      );
  }, [sidebarReady, sidebarKey, restored, projectId, pageId, pages.data, updateSidebar]);
  const [moving, setMoving] = useState(false);
  const [moveMessage, setMoveMessage] = useState("");
  const [moveError, setMoveError] = useState("");
  const moveInFlight = useRef(false);
  const [editingCollection, setEditingCollection] = useState<WikiCollection | null>(null);
  const [pageDialog, setPageDialog] = useState<PageDialogOptions | null>(null);
  const searchParams = useSearchParams();
  const requestedNew = searchParams.get("new");
  const requestedParent = searchParams.get("parent") || "";
  useEffect(() => {
    if (requestedNew === "1") setPageDialog({ collectionId: projectId?.toString(), parentId: requestedParent });
  }, [requestedNew, requestedParent, projectId]);
  const openPageDialog = useCallback(
    (options: PageDialogOptions = {}) => {
      setPageDialog(options);
      // Edit through the mounted original editor so title changes also update its shared Y.Doc.
      if (options.page && options.page.id !== pageId)
        router.push(`/${slug}/wiki/${options.page.collection_id}/pages/${options.page.id}/`);
    },
    [pageId, router, slug]
  );
  const openCollectionDialog = useCallback((collection?: WikiCollection) => {
    setEditingCollection(collection || null);
    setName(collection?.name || "");
    setError("");
    setAdding(true);
  }, []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { mutate: refreshCollections } = collections;
  const { mutate: refreshPages } = pages;
  const refresh = useCallback(async () => {
    await Promise.all([refreshCollections(), refreshPages()]);
  }, [refreshCollections, refreshPages]);
  const movePage = useCallback(
    async (page: WikiDocument, targetId: string | null, position: WikiDropPosition) => {
      if (moveInFlight.current) return;
      moveInFlight.current = true;
      setMoving(true);
      setMoveError("");
      setMoveMessage(t("workspace_tools.moving_page"));
      try {
        await service.movePage(slug, page, targetId, position);
        await refreshPages();
        setMoveMessage(t("workspace_tools.move_page_success"));
      } catch (moveFailure) {
        const data = (moveFailure as { response?: { data?: unknown } })?.response?.data;
        setMoveError(
          typeof data === "object" && data
            ? Object.values(data).flat().map(String).join(" · ")
            : t("workspace_tools.move_page_error")
        );
        setMoveMessage("");
        await refreshPages().catch(() => undefined);
      } finally {
        moveInFlight.current = false;
        setMoving(false);
        requestAnimationFrame(() =>
          document.querySelector<HTMLButtonElement>(`[data-wiki-drag-handle="${page.id}"]`)?.focus()
        );
      }
    },
    [slug, refreshPages, t]
  );
  const value = useMemo(
    () => ({
      collections: collections.data ?? [],
      pages: pages.data ?? [],
      refresh,
      loading: collections.isLoading || pages.isLoading,
      error: !!(collections.error || pages.error),
      openPageDialog,
      openCollectionDialog,
      canEditCollections,
      canDeleteCollections,
      collapsedPages,
      setPageCollapsed,
      moving,
      movePage,
    }),
    [
      collections.data,
      pages.data,
      refresh,
      collections.isLoading,
      pages.isLoading,
      collections.error,
      pages.error,
      openPageDialog,
      openCollectionDialog,
      canEditCollections,
      canDeleteCollections,
      collapsedPages,
      setPageCollapsed,
      moving,
      movePage,
    ]
  );
  async function addCollection(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const collection = editingCollection
        ? await service.updateCollection(slug, editingCollection.id, name.trim())
        : await service.createCollection(slug, name.trim());
      await Promise.all([refresh(), fetchPartialProjects(slug), fetchUserProjectPermissions(slug)]);
      setName("");
      setAdding(false);
      if (!editingCollection) router.push(`/${slug}/wiki/${collection.id}/`);
    } catch {
      setError(t("workspace_tools.collection_error"));
    } finally {
      setBusy(false);
    }
  }
  async function deleteCollection() {
    if (!deletingCollection || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await projectService.deleteProject(slug, deletingCollection.id);
      if (projectId === deletingCollection.id) router.replace(`/${slug}/wiki/`);
      requestDelete(null);
      await Promise.all([refresh(), fetchPartialProjects(slug), fetchUserProjectPermissions(slug)]);
    } catch {
      setDeleteError(t("wiki_collections.toasts.delete_error"));
    } finally {
      setDeleting(false);
    }
  }
  const navClass = (active: boolean) =>
    cn(
      "flex items-center gap-2 rounded-md px-3 py-2 text-13 text-secondary hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:outline-accent-strong",
      active && "bg-layer-transparent-active text-primary hover:bg-layer-transparent-active"
    );
  const navigation = (
    <aside
      ref={navigationRef}
      className={cn(
        "max-h-52 w-full shrink-0 flex-col overflow-y-auto border-b border-subtle p-3 md:h-full md:max-h-none md:border-b-0",
        sidebarCollapsed ? "hidden" : "flex"
      )}
      aria-label={t("workspace_tools.wiki_navigation")}
    >
      <div className="mb-4 flex items-center justify-between px-3 pt-2">
        <h2 className="text-18 font-semibold text-primary">{t("workspace_tools.wiki")}</h2>
        <IconButton
          variant="ghost"
          size="base"
          icon={PanelLeft}
          aria-label={t("aria_labels.projects_sidebar.collapse_sidebar")}
          onClick={() => toggleSidebar(true)}
        />
      </div>
      {collections.data?.length ? (
        <Button
          variant="secondary"
          size="lg"
          className="mb-4 justify-start"
          onClick={() => openPageDialog({ collectionId: projectId?.toString() || collections.data?.[0]?.id })}
          prependIcon={<Plus className="size-4" />}
        >
          {t("workspace_tools.new_page")}
        </Button>
      ) : null}
      <Link className={navClass(pathname === `/${slug}/wiki/` || pathname === `/${slug}/wiki`)} href={`/${slug}/wiki/`}>
        <House className="size-4" />
        {t("workspace_tools.home")}
      </Link>
      <Link className={navClass(pathname.includes("/wiki/library"))} href={`/${slug}/wiki/library/`}>
        <Library className="size-4" />
        {t("workspace_tools.library")}
      </Link>
      {canDeleteCollections && (
        <Link className={navClass(pathname.includes("/wiki/templates"))} href={`/${slug}/wiki/templates/`}>
          <FileText className="size-4" />
          {t("workspace_tools.templates")}
        </Link>
      )}
      <div className="group mt-5 mb-1 flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-placeholder hover:bg-layer-transparent-hover">
        <button
          type="button"
          className="min-w-0 flex-1 text-left text-13 font-semibold"
          aria-expanded={collectionsOpen}
          aria-controls="wiki-collections"
          onClick={() => setCollectionsOpen((open) => !open)}
        >
          {t("workspace_tools.collections")}
        </button>
        <div className="flex items-center gap-1">
          <IconButton
            variant="ghost"
            size="sm"
            icon={Plus}
            className="text-placeholder"
            aria-label={t("workspace_tools.create_collection")}
            onClick={() => openCollectionDialog()}
          />
          <IconButton
            variant="ghost"
            size="sm"
            icon={ChevronRight}
            className="text-placeholder"
            iconClassName={collectionsOpen ? "rotate-90" : ""}
            aria-label={t(
              collectionsOpen ? "workspace_tools.collapse_collections" : "workspace_tools.expand_collections"
            )}
            aria-expanded={collectionsOpen}
            aria-controls="wiki-collections"
            onClick={() => setCollectionsOpen((open) => !open)}
          />
        </div>
      </div>
      <p className="sr-only" id="wiki-drag-help">
        {t("workspace_tools.drag_page_help")}
      </p>
      {moveMessage && (
        <p role="status" className="mb-2 px-2 text-12 text-secondary">
          {moveMessage}
        </p>
      )}
      {moveError && (
        <p role="alert" className="mb-2 px-2 text-12 text-danger-primary">
          {moveError}
        </p>
      )}
      <div
        id="wiki-collections"
        hidden={!collectionsOpen}
        aria-describedby="wiki-drag-help"
        className={collectionsOpen ? "flex flex-col gap-0.5" : "hidden"}
      >
        {(collections.data ?? []).map((collection) => {
          const expanded = !!expandedCollections[collection.id];
          const toggle = () => setExpandedCollections((old) => ({ ...old, [collection.id]: !old[collection.id] }));
          return (
            <div key={collection.id}>
              <WikiRootDropTarget
                collectionId={collection.id}
                pages={pages.data ?? []}
                moving={moving}
                onMove={movePage}
              >
                <div className="group/collection flex w-full min-w-0 items-center rounded-md px-2 py-1.5 text-primary hover:bg-layer-transparent-hover">
                  <Link
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-13 font-medium text-secondary outline-none focus-visible:outline-2 focus-visible:outline-accent-strong"
                    aria-current={projectId === collection.id && !pageId ? "page" : undefined}
                    title={collection.name}
                    href={`/${slug}/wiki/${collection.id}/`}
                    onClick={() => setExpandedCollections((old) => ({ ...old, [collection.id]: true }))}
                  >
                    <span className="grid size-4 shrink-0 place-items-center rounded-sm bg-layer-1">
                      <BookOpen className="size-3 text-tertiary" />
                    </span>
                    <span className="truncate">{collection.name}</span>
                  </Link>
                  {canEditCollections && (
                    <CustomMenu
                      customButton={
                        <span className={cn(getIconButtonStyling("ghost", "sm"), "text-placeholder")}>
                          <MoreHorizontal className="size-3.5" />
                        </span>
                      }
                      className="opacity-0 group-focus-within/collection:opacity-100 group-hover/collection:opacity-100 data-[headlessui-state=open]:opacity-100 max-md:opacity-100"
                      placement="bottom-start"
                      ariaLabel={t("workspace_tools.collection_actions", { name: collection.name })}
                      closeOnSelect
                      useCaptureForOutsideClick
                    >
                      <CustomMenu.MenuItem onClick={() => openPageDialog({ collectionId: collection.id })}>
                        <span className="flex items-center gap-2">
                          <Plus className="size-3.5" />
                          <span>{t("workspace_tools.new_page")}</span>
                        </span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => openCollectionDialog(collection)}>
                        <span className="flex items-center gap-2">
                          <Pencil className="size-3.5" />
                          <span>{t("workspace_tools.edit_collection")}</span>
                        </span>
                      </CustomMenu.MenuItem>
                      {canDeleteCollections && (
                        <CustomMenu.MenuItem onClick={() => requestDelete(collection)}>
                          <span className="flex items-center gap-2">
                            <Trash2 className="size-3.5 text-danger-primary" />
                            <span className="text-danger-primary">{t("wiki_collections.delete_modal.title")}</span>
                          </span>
                        </CustomMenu.MenuItem>
                      )}
                    </CustomMenu>
                  )}
                  <IconButton
                    variant="ghost"
                    size="sm"
                    icon={ChevronRight}
                    className="text-placeholder"
                    iconClassName={expanded ? "rotate-90" : ""}
                    aria-label={t(
                      expanded ? "workspace_tools.collapse_collection_name" : "workspace_tools.expand_collection_name",
                      { name: collection.name }
                    )}
                    aria-expanded={expanded}
                    aria-controls={`wiki-collection-${collection.id}`}
                    onClick={toggle}
                  />
                </div>
              </WikiRootDropTarget>
              {expanded && (
                <div id={`wiki-collection-${collection.id}`} className="relative mt-1 mb-1.5 pl-6">
                  <div aria-hidden="true" className="absolute top-0 bottom-1 left-[15px] w-px bg-layer-3" />
                  <WikiTree
                    pages={(pages.data ?? []).filter((p) => p.collection_id === collection.id)}
                    slug={slug}
                    collectionId={collection.id}
                    activeId={pageId?.toString()}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
  return (
    <WikiContext.Provider value={value}>
      <ProjectsAppPowerKProvider />
      {deletingCollection && (
        <AlertModalCore
          isOpen
          isSubmitting={deleting}
          title={t("wiki_collections.delete_modal.title")}
          content={
            <>
              <p className="font-medium text-primary">{deletingCollection.name}</p>
              <p>{t("wiki_collections.delete_modal.delete_with_pages_description")}</p>
              {deleteError && (
                <p role="alert" className="text-danger-primary">
                  {deleteError}
                </p>
              )}
            </>
          }
          handleClose={() => {
            if (!deleting) {
              requestDelete(null);
              setDeleteError("");
            }
          }}
          handleSubmit={deleteCollection}
          primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
          secondaryButtonText={t("cancel")}
        />
      )}
      {adding && (
        <WorkspaceToolDialog
          title={t(editingCollection ? "workspace_tools.edit_collection" : "workspace_tools.create_collection")}
          onClose={() => setAdding(false)}
          onSubmit={addCollection}
          submitLabel={t(editingCollection ? "workspace_tools.save_changes" : "workspace_tools.create_collection")}
          busy={busy}
          disabled={!name.trim()}
          error={error}
        >
          <label className="block text-13 text-secondary" htmlFor="collection-name">
            {t("workspace_tools.collection_name")}
          </label>
          <Input
            id="collection-name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputStyle}
            required
          />
        </WorkspaceToolDialog>
      )}
      {pageDialog && (
        <WikiPageDialog
          key={pageDialog.page?.id || `${pageDialog.collectionId}-${pageDialog.parentId}`}
          options={pageDialog}
          onClose={() => {
            setPageDialog(null);
            if (requestedNew) router.replace(`/${slug}/wiki/${projectId || "library"}/`);
          }}
        />
      )}

      <div className="flex size-full min-w-0 flex-col overflow-hidden rounded-lg border border-subtle bg-surface-1 md:flex-row">
        {isMobile ? (
          navigation
        ) : (
          <ResizableSidebar
            width={sidebar.width}
            setWidth={setSidebarWidth}
            isCollapsed={sidebarCollapsed}
            toggleCollapsed={toggleSidebar}
            togglePeek={toggleSidebarPeek}
            enablePeek={false}
            className="shrink-0 [&>aside]:pt-0"
          >
            {navigation}
          </ResizableSidebar>
        )}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {sidebarCollapsed && (
            <div className="flex shrink-0 items-center border-b border-subtle px-3 py-2">
              <IconButton
                variant="ghost"
                size="base"
                icon={PanelLeft}
                aria-label={t("aria_labels.projects_sidebar.expand_sidebar")}
                onClick={() => toggleSidebar(false)}
              />
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </WikiContext.Provider>
  );
});

function WikiTree({
  pages,
  slug,
  collectionId,
  activeId,
  parentId = null,
  depth = 0,
}: {
  pages: WikiDocument[];
  slug: string;
  collectionId: string;
  activeId?: string;
  parentId?: string | null;
  depth?: number;
}) {
  const { t } = useTranslation();
  const {
    openPageDialog,
    canEditCollections,
    moving,
    movePage,
    collapsedPages: collapsed,
    setPageCollapsed,
  } = useWiki();
  if (depth > pages.length) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {pages
        .filter((p) => p.parent_id === parentId)
        .map((page) => {
          const children = pages.some((p) => p.parent_id === page.id);
          return (
            <div key={page.id}>
              <WikiPageDragRow
                page={page}
                pages={pages}
                moving={moving}
                onMove={movePage}
                onExpand={(id) => setPageCollapsed(id, false)}
                depth={depth}
                className={cn(
                  "group/page flex items-center rounded-md text-13 hover:bg-layer-transparent-hover",
                  activeId === page.id && "bg-layer-transparent-active hover:bg-layer-transparent-active"
                )}
              >
                <button
                  className={cn(getIconButtonStyling("ghost", "sm"), "shrink-0")}
                  aria-label={t(collapsed[page.id] ? "workspace_tools.expand_page" : "workspace_tools.collapse_page", {
                    name: page.name,
                  })}
                  disabled={!children}
                  aria-expanded={children ? !collapsed[page.id] : undefined}
                  onClick={() => setPageCollapsed(page.id, !collapsed[page.id])}
                >
                  {children ? (
                    collapsed[page.id] ? (
                      <ChevronRight className="size-3" />
                    ) : (
                      <ChevronDown className="size-3" />
                    )
                  ) : (
                    <FileText className="size-3 text-tertiary" />
                  )}
                </button>
                <Link
                  className={cn(
                    "min-w-0 flex-1 truncate py-1.5",
                    activeId === page.id ? "text-primary" : "text-secondary"
                  )}
                  title={page.name}
                  draggable={false}
                  aria-current={activeId === page.id ? "page" : undefined}
                  href={`/${slug}/wiki/${collectionId}/pages/${page.id}/`}
                >
                  {page.name || t("workspace_tools.untitled")}
                </Link>
                {canEditCollections && (
                  <CustomMenu
                    customButton={
                      <span className={cn(getIconButtonStyling("ghost", "sm"), "text-placeholder")}>
                        <MoreHorizontal className="size-3.5" />
                      </span>
                    }
                    className="opacity-0 group-focus-within/page:opacity-100 group-hover/page:opacity-100 max-md:opacity-100"
                    placement="bottom-start"
                    ariaLabel={t("workspace_tools.page_actions", { name: page.name })}
                    closeOnSelect
                    useCaptureForOutsideClick
                  >
                    <CustomMenu.MenuItem onClick={() => openPageDialog({ collectionId, parentId: page.id })}>
                      <span className="flex items-center gap-2">
                        <Plus className="size-3.5" />
                        <span>{t("workspace_tools.add_subpage_to", { name: page.name })}</span>
                      </span>
                    </CustomMenu.MenuItem>
                    <CustomMenu.MenuItem onClick={() => openPageDialog({ page })}>
                      <span className="flex items-center gap-2">
                        <Pencil className="size-3.5" />
                        <span>{t("workspace_tools.edit_page")}</span>
                      </span>
                    </CustomMenu.MenuItem>
                  </CustomMenu>
                )}
              </WikiPageDragRow>
              {children && !collapsed[page.id] && (
                <WikiTree
                  pages={pages}
                  slug={slug}
                  collectionId={collectionId}
                  activeId={activeId}
                  parentId={page.id}
                  depth={depth + 1}
                />
              )}
            </div>
          );
        })}
    </div>
  );
}

export function WikiDocumentList() {
  const { t, currentLocale } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { collections, pages, refresh, loading, error } = useWiki();
  const pathname = usePathname();
  const { openPageDialog, openCollectionDialog } = useWiki();
  const [searchParams, setSearchParams] = useRouterSearchParams();
  const query = searchParams.get("q") ?? "";
  const searchQuery = useDebounce(query.trim(), 300);
  const selectedCollection = projectId?.toString() || searchParams.get("collection") || "";
  const requestedPage = Number(searchParams.get("page") || 1);
  const searchPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { data: searchUser } = useUser();
  function updateSearch(name: string, value: string) {
    setSearchParams(
      (previous) => {
        const params = new URLSearchParams(previous);
        if (value) params.set(name, value);
        else params.delete(name);
        if (name !== "page") params.delete("page");
        return params;
      },
      { replace: true }
    );
  }
  const [view, setView] = useState("list");
  const [reviewFilter, setReviewFilter] = useState("attention");
  const searching = !!query.trim();
  const queryReady = searchQuery === query.trim() && !!searchUser?.id;
  const search = useSWR(
    searching && queryReady && view !== "graph"
      ? [
          "wiki-search",
          slug,
          searchUser?.id,
          searchQuery,
          selectedCollection,
          searchPage,
          view === "review" ? reviewFilter : "all",
        ]
      : null,
    () => service.search(slug, searchQuery, selectedCollection, searchPage, view === "review" ? reviewFilter : "all"),
    {
      refreshInterval: 5000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      dedupingInterval: 500,
      shouldRetryOnError: (failure) => ![403, 404].includes(failure?.response?.status),
    }
  );
  const collection = collections.find((c) => c.id === projectId);
  const title =
    collection?.name ??
    (pathname.replace(/\/$/, "").endsWith("/wiki") ? t("workspace_tools.wiki_home") : t("workspace_tools.library"));
  const documents = searching
    ? (search.data?.results ?? [])
    : pages.filter(
        (p) =>
          (!selectedCollection || p.collection_id === selectedCollection) &&
          (view !== "review" ||
            reviewFilter === "all" ||
            (reviewFilter === "attention"
              ? ["overdue", "due_soon", "changed"].includes(p.review?.status)
              : ["unassigned", "unscheduled"].includes(p.review?.status)))
      );
  return (
    <>
      <PageHead title={`Wiki — ${title}`} />
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-14 text-primary">
          <BookOpen className="size-4 shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="lg"
            aria-pressed={view === "list"}
            onClick={() => {
              setView("list");
              updateSearch("page", "");
            }}
          >
            {t("workspace_tools.list_view")}
          </Button>
          <Button
            variant={view === "graph" ? "secondary" : "ghost"}
            size="lg"
            aria-pressed={view === "graph"}
            onClick={() => {
              setView("graph");
              updateSearch("page", "");
            }}
          >
            {t("workspace_tools.graph_view")}
          </Button>
          <Button
            variant={view === "review" ? "secondary" : "ghost"}
            size="lg"
            aria-pressed={view === "review"}
            onClick={() => {
              setView("review");
              updateSearch("page", "");
            }}
          >
            {t("workspace_tools.wiki_reviews")}
          </Button>
          {collection && (
            <Button
              variant="secondary"
              size="lg"
              onClick={() => openCollectionDialog(collection)}
              prependIcon={<Pencil className="size-3.5" />}
            >
              {t("workspace_tools.edit_collection")}
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            disabled={!collections.length}
            onClick={() => openPageDialog({ collectionId: projectId?.toString() })}
            prependIcon={<Plus className="size-4" />}
          >
            {t("workspace_tools.new_page")}
          </Button>
        </div>
      </header>
      <div className={view === "graph" ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "overflow-y-auto p-5 md:p-8"}>
        {view !== "graph" && (
          <>
            <h1 className="text-24 font-semibold text-primary">{title}</h1>
            <p className="mt-2 text-14 text-secondary" lang={currentLocale}>
              {collection ? t("workspace_tools.collection_description") : t("workspace_tools.library_description")}
            </p>
          </>
        )}
        {view === "graph" ? (
          <WikiGraph collectionId={projectId?.toString()} />
        ) : (
          <>
            <div className="mt-7 mb-4 flex flex-wrap items-start gap-3">
              <div className="relative w-full max-w-md">
                <Search className="absolute top-2.5 left-3 size-4 text-tertiary" />
                <Input
                  type="search"
                  maxLength={200}
                  aria-label={t("workspace_tools.search_wiki_content")}
                  placeholder={t("workspace_tools.search_wiki_content")}
                  className={cn(inputStyle, "pl-9")}
                  value={query}
                  onChange={(event) => updateSearch("q", event.target.value)}
                />
              </div>
              {!projectId && (
                <div className="w-full max-w-xs">
                  <WorkspaceSelect
                    label={t("workspace_tools.collection_filter")}
                    value={selectedCollection}
                    onChange={(value) => updateSearch("collection", value)}
                    options={[
                      { value: "", label: t("workspace_tools.all_collections") },
                      ...collections.map((item) => ({ value: item.id, label: item.name })),
                    ]}
                  />
                </div>
              )}
            </div>
            <p className="mb-4 text-12 text-tertiary">{t("workspace_tools.wiki_search_help")}</p>
            {searching && queryReady && search.data && !search.error && (
              <p role="status" className="mb-3 text-13 text-secondary">
                {t("workspace_tools.wiki_search_count", { count: search.data.count })}
              </p>
            )}
            {view === "review" && (
              <div className="mb-4 max-w-sm">
                <WorkspaceSelect
                  label={t("workspace_tools.review_filter")}
                  value={reviewFilter}
                  onChange={(value) => {
                    setReviewFilter(value);
                    updateSearch("page", "");
                  }}
                  options={[
                    { value: "attention", label: t("workspace_tools.review_attention") },
                    { value: "unassigned", label: t("workspace_tools.review_not_configured") },
                    { value: "all", label: t("workspace_tools.review_all") },
                  ]}
                />
              </div>
            )}
            {(searching ? !queryReady || search.isLoading : loading) ? (
              <p role="status" className="py-8 text-14 text-secondary">
                {t("workspace_tools.loading_documents")}
              </p>
            ) : (searching ? search.error : error) ? (
              <div role="alert" className="py-8 text-14 text-danger-primary">
                {t("workspace_tools.pages_error")}{" "}
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={() => (searching ? void search.mutate() : void refresh())}
                >
                  {t("workspace_tools.retry")}
                </Button>
              </div>
            ) : documents.length === 0 ? (
              <p className="py-12 text-14 text-secondary" lang={currentLocale}>
                {query
                  ? t("workspace_tools.no_results")
                  : collections.length
                    ? t("workspace_tools.no_pages")
                    : t("workspace_tools.no_collections")}
              </p>
            ) : (
              <div className="divide-y divide-subtle border-y border-subtle">
                {documents.map((page) => (
                  <div key={page.id} className="flex items-center gap-2">
                    <Link
                      href={`/${slug}/wiki/${page.collection_id}/pages/${page.id}/`}
                      className="flex min-w-0 flex-1 items-center gap-3 px-2 py-4 text-14 hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:outline-accent-strong"
                    >
                      <FileText className="size-4 shrink-0 text-tertiary" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-primary">
                          <span className="truncate font-medium">
                            {searching ? (
                              <WikiSearchText text={page.name || t("workspace_tools.untitled")} query={query} />
                            ) : (
                              page.name || t("workspace_tools.untitled")
                            )}
                          </span>
                          {page.access === 1 && (
                            <Lock aria-label={t("workspace_tools.private")} className="size-3 shrink-0" />
                          )}
                        </div>
                        <div className="mt-1 text-12 text-tertiary">
                          {page.path ? (
                            page.path.join(" / ")
                          ) : (
                            <>
                              {collections.find((c) => c.id === page.collection_id)?.name}
                              {page.parent_id
                                ? ` / ${pages.find((p) => p.id === page.parent_id)?.name || t("workspace_tools.parent_page")}`
                                : ""}
                            </>
                          )}{" "}
                          · {page.owner}
                          {page.review?.owner_name && (
                            <span>
                              {" "}
                              · {t("workspace_tools.document_owner")}: {page.review.owner_name}
                            </span>
                          )}
                          {page.review?.due_date && (
                            <span>
                              {" "}
                              · {t("workspace_tools.review_due")}: {page.review.due_date}
                            </span>
                          )}
                        </div>
                        {page.snippet !== undefined && (
                          <p className="mt-2 text-13 leading-relaxed break-words whitespace-pre-wrap text-secondary">
                            <WikiSearchText text={page.snippet} query={query} />
                          </p>
                        )}
                        {page.match && (
                          <p className="mt-1 text-11 text-tertiary">
                            {t(
                              page.match === "title"
                                ? "workspace_tools.wiki_search_title_match"
                                : "workspace_tools.wiki_search_content_match"
                            )}
                          </p>
                        )}
                      </div>
                      {page.review && (
                        <Badge
                          variant={
                            page.review.status === "overdue"
                              ? "danger"
                              : ["changed", "due_soon"].includes(page.review.status)
                                ? "warning"
                                : page.review.status === "reviewed"
                                  ? "success"
                                  : "neutral"
                          }
                        >
                          {t(`workspace_tools.wiki_review_${page.review.status}`)}
                        </Badge>
                      )}
                      <time className="hidden shrink-0 text-12 text-tertiary sm:block" dateTime={page.updated_at}>
                        {new Date(page.updated_at).toLocaleDateString(currentLocale)}
                      </time>
                    </Link>
                    <CustomMenu
                      customButton={
                        <span className={cn(getIconButtonStyling("ghost", "sm"), "text-placeholder")}>
                          <MoreHorizontal className="size-3.5" />
                        </span>
                      }
                      placement="bottom-end"
                      ariaLabel={t("workspace_tools.page_actions", { name: page.name })}
                      closeOnSelect
                      useCaptureForOutsideClick
                    >
                      <CustomMenu.MenuItem
                        onClick={() => openPageDialog({ collectionId: page.collection_id, parentId: page.id })}
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="size-3.5" />
                          <span>{t("workspace_tools.add_subpage_to", { name: page.name })}</span>
                        </span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => openPageDialog({ page })}>
                        <span className="flex items-center gap-2">
                          <Pencil className="size-3.5" />
                          <span>{t("workspace_tools.edit_page")}</span>
                        </span>
                      </CustomMenu.MenuItem>
                    </CustomMenu>
                  </div>
                ))}
              </div>
            )}
            {searching && queryReady && search.data && !search.error && search.data.count > search.data.page_size && (
              <nav
                aria-label={t("workspace_tools.wiki_search_pagination")}
                className="mt-5 flex flex-wrap items-center justify-between gap-3"
              >
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={searchPage <= 1}
                  onClick={() => updateSearch("page", String(searchPage - 1))}
                >
                  {t("workspace_tools.wiki_search_previous")}
                </Button>
                <span className="text-13 text-secondary">
                  {t("workspace_tools.wiki_search_page", {
                    page: searchPage,
                    total: Math.ceil(search.data.count / search.data.page_size),
                  })}
                </span>
                <Button
                  variant="secondary"
                  size="lg"
                  disabled={searchPage * search.data.page_size >= search.data.count}
                  onClick={() => updateSearch("page", String(searchPage + 1))}
                >
                  {t("workspace_tools.wiki_search_next")}
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}

function WikiSearchText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {wikiSearchParts(text, query).map((part) =>
        part.match ? (
          <mark key={part.start} className="rounded-sm bg-accent-primary/20 text-primary">
            {part.text}
          </mark>
        ) : (
          part.text
        )
      )}
    </>
  );
}

const WikiPageDialog = observer(function WikiPageDialog({
  options,
  onClose,
}: {
  options: PageDialogOptions;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() || "";
  const { collections, pages, refresh } = useWiki();
  const router = useAppRouter();
  const { fetchPageDetails, getPageById } = usePageStore(EPageStoreType.PROJECT);
  const editing = options.page;
  const templates = useSWR(!editing ? `wiki-templates-${slug}` : null, () => service.templates(slug));
  const [template, setTemplate] = useState("");
  const activePage = editing ? getPageById(editing.id) : undefined;
  const editorReady =
    !editing ||
    (!!activePage?.editor.editorRef && activePage.isSyncingWithServer === "synced" && activePage.isContentEditable);
  const [name, setName] = useState(editing?.name || "");
  const [collectionId, setCollectionId] = useState(
    editing?.collection_id || options.collectionId || collections[0]?.id || ""
  );
  const [parentId, setParentId] = useState(editing?.parent_id || options.parentId || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const parent = pages.find((p) => p.id === parentId && p.collection_id === collectionId);
      const payload = {
        name: name.trim(),
        ...(!editing && template ? { wiki_template: template } : {}),
        parent: parent?.id || null,
        access: (parent?.access === 1 ? 1 : (editing?.access ?? 0)) as 0 | 1,
      };
      const page = editing
        ? await pageService.update(slug, collectionId, editing.id, payload)
        : await pageService.create(slug, collectionId, payload);
      await refresh();
      if (editing) {
        activePage?.editor.editorRef?.setDocumentTitle(name.trim());
        await fetchPageDetails(slug, collectionId, editing.id);
        getPageById(editing.id)?.mutateProperties({ name: name.trim() });
      }
      onClose();
      if (!editing) router.push(`/${slug}/wiki/${collectionId}/pages/${page.id}/`);
    } catch {
      setError(t("workspace_tools.page_save_error"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <WorkspaceToolDialog
      title={t(editing ? "workspace_tools.edit_page" : "workspace_tools.create_page")}
      onClose={onClose}
      onSubmit={save}
      submitLabel={t(editing ? "workspace_tools.save_changes" : "workspace_tools.create_page")}
      busy={busy}
      disabled={!name.trim() || !collectionId || !editorReady}
      error={error}
    >
      <label className="block text-13 text-secondary" htmlFor="page-name">
        {t("workspace_tools.document_title")}
      </label>
      <Input
        id="page-name"
        className={inputStyle}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={255}
      />
      {!editing && (
        <div className="space-y-2">
          <label className="block text-13 text-secondary">{t("workspace_tools.page_template")}</label>
          <WorkspaceSelect
            label={t("workspace_tools.page_template")}
            value={template}
            onChange={setTemplate}
            disabled={busy || templates.isLoading || !!templates.error}
            options={[
              { value: "", label: t("workspace_tools.blank_page") },
              ...(templates.data ?? []).map((item) => ({ value: item.key, label: item.name })),
            ]}
          />
          {templates.error && (
            <p role="alert" className="text-12 text-danger-primary">
              {t("workspace_tools.template_load_error")}
            </p>
          )}
          {template && (
            <p className="text-12 text-secondary">
              {templates.data?.find((item) => item.key === template)?.headings.join(" · ")}
            </p>
          )}
        </div>
      )}
      <label className="block text-13 text-secondary">{t("workspace_tools.collection")}</label>
      <WorkspaceSelect
        label={t("workspace_tools.collection")}
        disabled={!!editing || busy}
        value={collectionId}
        onChange={(value) => {
          setCollectionId(value);
          setParentId("");
        }}
        options={collections.map((c) => ({ value: c.id, label: c.name }))}
      />
      <label className="block text-13 text-secondary">{t("workspace_tools.parent_page")}</label>
      <WorkspaceSelect
        label={t("workspace_tools.parent_page")}
        value={parentId}
        disabled={busy}
        onChange={setParentId}
        options={[
          { value: "", label: t("workspace_tools.collection_root") },
          ...availableWikiParents(pages, collectionId, editing?.id).map((p) => ({
            value: p.id,
            label: p.name || t("workspace_tools.untitled"),
          })),
        ]}
      />
    </WorkspaceToolDialog>
  );
});
