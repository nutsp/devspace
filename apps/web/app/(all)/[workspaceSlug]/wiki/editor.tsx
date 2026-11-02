import { useState } from "react";
import { Link2, Network } from "lucide-react";
import { IconButton } from "@plane/propel/icon-button";
import { WikiReviewControls } from "@/components/wiki/wiki-review-controls";
import { WikiGraph } from "@/components/wiki/wiki-graph";
import { WikiPageLinkDialog } from "@/components/wiki/wiki-page-links";
import { Button } from "@plane/propel/button";
import { useTranslation } from "@plane/i18n";
import Link from "next/link";
import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { ObservablePageEditor } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/pages/(detail)/[pageId]/page";
import { PageHeaderActions } from "@/components/pages/header/actions";
import { PageSyncingBadge } from "@/components/pages/header/syncing-badge";
import { EPageStoreType, usePage } from "@/hooks/store";
import { useWiki } from "@/components/wiki/workspace-wiki";

export default observer(function WikiEditor() {
  const { t } = useTranslation();
  const [connections, setConnections] = useState(false);
  const [linkDialog, setLinkDialog] = useState(false);
  const { workspaceSlug, projectId, pageId } = useParams();
  const { collections, pages, openPageDialog } = useWiki();
  const ancestors = [];
  let cursor = pages.find((p) => p.id === pageId)?.parent_id;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const ancestor = pages.find((p) => p.id === cursor);
    if (!ancestor) break;
    ancestors.unshift(ancestor);
    cursor = ancestor.parent_id;
  }
  const page = usePage({ pageId: pageId?.toString(), storeType: EPageStoreType.PROJECT });
  if (!workspaceSlug || !projectId || !pageId) return null;
  const collection = collections.find((c) => c.id === projectId);
  if (!collection)
    return <p className="p-6 text-14 text-secondary">{t("workspace_tools.collection_not_found_or_unavailable")}</p>;
  return (
    <>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-subtle px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-13 text-secondary">
          <Link href={`/${workspaceSlug}/wiki/${projectId}/`} className="shrink-0 hover:underline">
            {collection.name}
          </Link>
          {ancestors.map((ancestor) => (
            <Link
              key={ancestor.id}
              className="truncate hover:underline"
              href={`/${workspaceSlug}/wiki/${projectId}/pages/${ancestor.id}/`}
            >
              / {ancestor.name}
            </Link>
          ))}
          <span>/</span>
          <span className="truncate text-primary">{page?.name || t("workspace_tools.untitled")}</span>
        </div>
        {page && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => openPageDialog({ collectionId: projectId.toString(), parentId: pageId.toString() })}
            >
              {t("workspace_tools.subpage")}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => {
                const document = pages.find((p) => p.id === pageId);
                if (document) openPageDialog({ page: document });
              }}
            >
              {t("workspace_tools.edit_page")}
            </Button>
            <IconButton
              icon={Link2}
              variant="ghost"
              size="base"
              aria-label={t("workspace_tools.insert_page_link")}
              title={t("workspace_tools.insert_page_link")}
              disabled={!page.isContentEditable}
              onClick={() => setLinkDialog(true)}
            />
            <IconButton
              icon={Network}
              variant="ghost"
              size="base"
              aria-label={t("workspace_tools.connections")}
              title={t("workspace_tools.connections")}
              aria-pressed={connections}
              onClick={() => setConnections((v) => !v)}
            />
            <PageSyncingBadge syncStatus={page.isSyncingWithServer} />
            <PageHeaderActions page={page} storeType={EPageStoreType.PROJECT} />
          </div>
        )}
      </header>
      <WikiReviewControls
        key={pageId.toString()}
        slug={workspaceSlug.toString()}
        collectionId={projectId.toString()}
        pageId={pageId.toString()}
        saved={!!page && page.isSyncingWithServer === "synced" && page.isContentEditable}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <ObservablePageEditor
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            pageId={pageId.toString()}
          />
        </div>
        {connections && (
          <aside className="max-h-[45%] shrink-0 overflow-y-auto border-t border-subtle p-4 lg:max-h-none lg:w-80 lg:border-t-0 lg:border-l">
            <WikiGraph key={pageId.toString()} focusId={pageId.toString()} compact />
          </aside>
        )}
      </div>
      {linkDialog && page && (
        <WikiPageLinkDialog
          pageId={pageId.toString()}
          onClose={() => setLinkDialog(false)}
          insert={(href, label) => {
            if (!page.editor.editorRef || !page.isContentEditable) throw new Error("Editor unavailable");
            page.editor.editorRef.insertPageLink(href, label);
          }}
        />
      )}
    </>
  );
});
