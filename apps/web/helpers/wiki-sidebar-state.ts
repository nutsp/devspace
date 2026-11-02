export type WikiSidebarState = {
  version: 1;
  width: number;
  collectionsOpen: boolean;
  expandedCollections: Record<string, boolean>;
  collapsedPages: Record<string, boolean>;
};

export const defaultWikiSidebarState = (): WikiSidebarState => ({
  version: 1,
  width: 250,
  collectionsOpen: true,
  expandedCollections: {},
  collapsedPages: {},
});

export function wikiSidebarStorageKey(userId?: string, workspaceSlug?: string): string | null {
  return userId && workspaceSlug
    ? `wiki-sidebar:v1:${encodeURIComponent(userId)}:${encodeURIComponent(workspaceSlug)}`
    : null;
}

function booleanMap(value: unknown): value is Record<string, boolean> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "boolean")
  );
}

export function parseWikiSidebarState(raw: string | null): WikiSidebarState | undefined {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return undefined;
    const state = value as Partial<WikiSidebarState>;
    if (
      state.version !== 1 ||
      typeof state.collectionsOpen !== "boolean" ||
      !booleanMap(state.expandedCollections) ||
      !booleanMap(state.collapsedPages)
    )
      return undefined;
    return {
      version: 1,
      width: wikiSidebarWidth(state.width),
      collectionsOpen: state.collectionsOpen,
      expandedCollections: { ...state.expandedCollections },
      collapsedPages: { ...state.collapsedPages },
    };
  } catch {
    return undefined;
  }
}

/** Reveal a newly selected document without expanding unrelated saved branches. */
export function revealWikiSidebarPage(
  state: WikiSidebarState,
  collectionId: string,
  pageId: string | undefined,
  pages: { id: string; collection_id: string; parent_id: string | null }[]
): WikiSidebarState {
  const byId = new Map(pages.filter((page) => page.collection_id === collectionId).map((page) => [page.id, page]));
  const collapsedPages = { ...state.collapsedPages };
  const visited = new Set<string>();
  let page = pageId ? byId.get(pageId) : undefined;
  while (page?.parent_id && !visited.has(page.id)) {
    visited.add(page.id);
    const parent = byId.get(page.parent_id);
    if (!parent) break;
    collapsedPages[parent.id] = false;
    page = parent;
  }
  return {
    ...state,
    collectionsOpen: true,
    expandedCollections: { ...state.expandedCollections, [collectionId]: true },
    collapsedPages,
  };
}

/** Match the native Project sidebar bounds and recover old or invalid preferences. */
export function wikiSidebarWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(350, Math.max(236, value)) : 250;
}
