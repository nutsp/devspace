import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { Input } from "@plane/ui";
import { WorkspaceToolDialog } from "@/components/common/workspace-tool-dialog";
import { useWiki } from "./workspace-wiki";

export function WikiPageLinkDialog({
  pageId,
  insert,
  onClose,
}: {
  pageId: string;
  insert: (href: string, label: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const { pages, collections } = useWiki();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const choices = pages.filter(
    (p) => p.id !== pageId && p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  return (
    <WorkspaceToolDialog
      title={t("workspace_tools.insert_page_link")}
      submitLabel={t("workspace_tools.insert_link")}
      busy={false}
      disabled={!selected}
      error={error}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault();
        const target = pages.find((p) => p.id === selected);
        if (!target) return;
        try {
          insert(
            `/${workspaceSlug}/wiki/${target.collection_id}/pages/${target.id}/`,
            target.name || t("workspace_tools.untitled")
          );
          onClose();
        } catch {
          setError(t("workspace_tools.insert_link_error"));
        }
      }}
    >
      <Input
        aria-label={t("workspace_tools.search_documents")}
        placeholder={t("workspace_tools.search_documents")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full text-primary"
      />
      <div
        className="max-h-80 space-y-1 overflow-y-auto"
        role="radiogroup"
        aria-label={t("workspace_tools.choose_page")}
      >
        {choices.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-14 text-primary hover:bg-layer-transparent-hover"
          >
            <input
              type="radio"
              name="linked-page"
              value={p.id}
              checked={selected === p.id}
              onChange={() => setSelected(p.id)}
              className="accent-accent-primary"
            />
            <span>
              {p.name || t("workspace_tools.untitled")}
              <span className="ml-2 text-12 text-tertiary">
                {collections.find((c) => c.id === p.collection_id)?.name}
              </span>
            </span>
          </label>
        ))}
        {!choices.length && <p className="p-3 text-13 text-tertiary">{t("workspace_tools.no_results")}</p>}
      </div>
    </WorkspaceToolDialog>
  );
}
