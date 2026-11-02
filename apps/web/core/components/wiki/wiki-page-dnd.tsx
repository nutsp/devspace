import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { GripVertical } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { cn } from "@plane/utils";
import type { WikiDocument } from "@/services/wiki.service";
import { canMoveWikiPage, wikiDropPosition } from "@/helpers/wiki-page-tree";
import type { WikiDropPosition } from "@/helpers/wiki-page-tree";

type Move = (page: WikiDocument, targetId: string | null, position: WikiDropPosition) => Promise<void>;
const kind = "workspace-wiki-page";

export function WikiPageDragRow({
  page,
  pages,
  moving,
  onMove,
  onExpand,
  children,
  className,
  depth,
}: {
  page: WikiDocument;
  pages: WikiDocument[];
  moving: boolean;
  onMove: Move;
  onExpand: (id: string) => void;
  children: ReactNode;
  className: string;
  depth: number;
}) {
  const { t } = useTranslation();
  const row = useRef<HTMLDivElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState<WikiDropPosition | null>(null);
  useEffect(() => {
    const element = row.current;
    const dragHandle = handle.current;
    if (!element || !dragHandle || moving) return;
    return combine(
      ...(page.can_move
        ? [
            draggable({
              element,
              dragHandle,
              getInitialData: () => ({ kind, id: page.id, collectionId: page.collection_id }),
              onDragStart: () => setDragging(true),
              onDrop: () => setDragging(false),
            }),
          ]
        : []),
      dropTargetForElements({
        element,
        canDrop: ({ source, input }) => {
          const rect = element.getBoundingClientRect();
          return (
            source.data.kind === kind &&
            canMoveWikiPage(
              pages,
              String(source.data.id),
              page.id,
              wikiDropPosition(rect.top, rect.height, input.clientY)
            )
          );
        },
        getData: ({ input }) => {
          const rect = element.getBoundingClientRect();
          return { position: wikiDropPosition(rect.top, rect.height, input.clientY) };
        },
        onDrag: ({ self }) => setPosition(self.data.position as WikiDropPosition),
        onDragLeave: () => setPosition(null),
        onDrop: ({ source, self }) => {
          setPosition(null);
          const sourcePage = pages.find((p) => p.id === source.data.id);
          if (self.data.position === "inside") onExpand(page.id);
          if (sourcePage) void onMove(sourcePage, page.id, self.data.position as WikiDropPosition);
        },
      })
    );
  }, [page, pages, moving, onMove, onExpand]);
  return (
    <div
      ref={row}
      className={cn(
        "relative",
        className,
        dragging && "opacity-40",
        position === "inside" && "bg-accent-subtle ring-1 ring-accent-strong"
      )}
      style={{ paddingLeft: 2 + depth * 12 }}
    >
      <IconButton
        ref={handle}
        data-wiki-drag-handle={page.id}
        icon={GripVertical}
        variant="ghost"
        size="sm"
        className="absolute z-10 cursor-grab opacity-0 group-focus-within/page:opacity-100 group-hover/page:opacity-100 focus-visible:opacity-100 active:cursor-grabbing max-md:opacity-100"
        style={{ left: depth * 12 - 18 }}
        disabled={moving || !page.can_move}
        aria-label={t("workspace_tools.move_page_name", { name: page.name })}
        title={t("workspace_tools.drag_keyboard_help")}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        onKeyDown={(event) => {
          const siblings = pages.filter(
            (p) => p.collection_id === page.collection_id && p.parent_id === page.parent_id
          );
          const index = siblings.findIndex((p) => p.id === page.id);
          let target: WikiDocument | undefined;
          let intent: WikiDropPosition = "before";
          if (event.key === "ArrowUp") target = siblings[index - 1];
          else if (event.key === "ArrowDown") {
            target = siblings[index + 1];
            intent = "after";
          } else if (event.key === "ArrowRight") {
            target = siblings[index - 1];
            intent = "inside";
          } else if (event.key === "ArrowLeft") {
            target = pages.find((p) => p.id === page.parent_id);
            intent = "after";
          } else return;
          event.preventDefault();
          if (target && canMoveWikiPage(pages, page.id, target.id, intent)) {
            if (intent === "inside") onExpand(target.id);
            void onMove(page, target.id, intent);
          }
        }}
      />
      {children}
      {(position === "before" || position === "after") && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-1 border-t-2 border-accent-strong",
            position === "before" ? "-top-0.5" : "-bottom-0.5"
          )}
        />
      )}
    </div>
  );
}

export function WikiRootDropTarget({
  collectionId,
  pages,
  moving,
  onMove,
  children,
}: {
  collectionId: string;
  pages: WikiDocument[];
  moving: boolean;
  onMove: Move;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || moving) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        source.data.kind === kind &&
        source.data.collectionId === collectionId &&
        canMoveWikiPage(pages, String(source.data.id), null, "root"),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source }) => {
        setOver(false);
        const page = pages.find((p) => p.id === source.data.id);
        if (page) void onMove(page, null, "root");
      },
    });
  }, [collectionId, pages, moving, onMove]);
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-1 rounded-md", over && "bg-accent-subtle ring-1 ring-accent-strong")}
    >
      {children}
    </div>
  );
}
