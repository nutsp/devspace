import type { WikiDocument } from "../core/services/wiki.service";

/** Never offer the page itself, descendants or malformed ancestry as a new parent. */
export function availableWikiParents(pages: WikiDocument[], collectionId: string, editingId?: string) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  return pages.filter((candidate) => {
    if (candidate.collection_id !== collectionId) return false;
    const seen = new Set<string>();
    let node: WikiDocument | undefined = candidate;
    while (node) {
      if (node.id === editingId || seen.has(node.id)) return false;
      seen.add(node.id);
      node = node.parent_id ? byId.get(node.parent_id) : undefined;
    }
    return true;
  });
}

export type WikiDropPosition = "before" | "after" | "inside" | "root";

export function canMoveWikiPage(
  pages: WikiDocument[],
  sourceId: string,
  targetId: string | null,
  position: WikiDropPosition
) {
  const source = pages.find((p) => p.id === sourceId);
  if (!source?.can_move) return false;
  if (position === "root") return true;
  const target = pages.find((p) => p.id === targetId);
  if (!target || target.id === sourceId || source.collection_id !== target.collection_id) return false;
  const parentId = position === "inside" ? target.id : target.parent_id;
  if (position === "inside" && !target.can_move) return false;
  if (parentId && !availableWikiParents(pages, source.collection_id, sourceId).some((p) => p.id === parentId))
    return false;
  let parent = pages.find((p) => p.id === parentId);
  const seen = new Set<string>();
  while (parent && !seen.has(parent.id)) {
    if (parent.access === 1 && source.access !== 1) return false;
    seen.add(parent.id);
    parent = pages.find((p) => p.id === parent?.parent_id);
  }
  return true;
}

export function wikiDropPosition(top: number, height: number, pointerY: number): Exclude<WikiDropPosition, "root"> {
  const ratio = (pointerY - top) / height;
  return ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
}
