import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useBlocker, useNavigate } from "react-router";
import useSWR, { useSWRConfig } from "swr";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import { Check, LoaderCircle } from "lucide-react";
import { Button } from "@plane/propel/button";
import { AlertModalCore, Checkbox, Input } from "@plane/ui";
import { DocumentEditor } from "@/components/editor/document/editor";
import { PageToolbar } from "@/components/pages/editor/toolbar";
import { PageHead } from "@/components/core/page-title";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WikiService } from "@/services/wiki.service";
import type { WikiTemplateDetail } from "@/services/wiki.service";
import { createTemplateAutosave } from "@/helpers/wiki-template-autosave";
import { WorkspaceService } from "@/services/workspace.service";

const service = new WikiService();
const workspaceService = new WorkspaceService();

export const WikiTemplateEditorPage = observer(function WikiTemplateEditorPage() {
  const { t } = useTranslation();
  const params = useParams();
  const slug = params.workspaceSlug?.toString() ?? "";
  const id = params.templateId?.toString() ?? "";
  const { getWorkspaceRoleByWorkspaceSlug } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const admin = getWorkspaceRoleByWorkspaceSlug(slug) === 20;
  const detail = useSWR(
    admin && id !== "new" ? `wiki-template-${slug}-${id}` : null,
    () => service.template(slug, id),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  if (!admin) return <p className="p-8 text-secondary">{t("workspace_tools.templates_admin_only")}</p>;
  if (detail.error)
    return (
      <p role="alert" className="p-8 text-danger-primary">
        {t("workspace_tools.templates_load_error")}
      </p>
    );
  if (!currentWorkspace || (id !== "new" && (!detail.data || detail.isValidating)))
    return (
      <p role="status" className="p-8 text-secondary">
        {t("workspace_tools.loading")}
      </p>
    );
  return (
    <TemplatePageForm key={`${slug}-${id}`} slug={slug} workspaceId={currentWorkspace.id} template={detail.data} />
  );
});

function TemplatePageForm({
  slug,
  workspaceId,
  template,
}: {
  slug: string;
  workspaceId: string;
  template?: WikiTemplateDetail;
}) {
  const { t } = useTranslation();
  const translate = useRef(t);
  translate.current = t;
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const editor = useRef<EditorRefApi>(null);
  const contentInteracted = useRef(false);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [active, setActive] = useState(template?.is_active ?? true);
  const draft = useRef<Record<string, unknown>>({
    name: template?.name ?? "",
    description: template?.description ?? "",
    is_active: template?.is_active ?? true,
    content_html: template?.content_html ?? "<p></p>",
  });
  const savedTemplate = useRef(template);
  const isNew = !template;
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [error, setError] = useState("");
  // A successful create can navigate before React commits the new dirty state.
  const allowNavigation = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !allowNavigation.current && currentLocation.pathname !== nextLocation.pathname
  );
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const [autosave] = useState(() =>
    createTemplateAutosave<Record<string, unknown>, WikiTemplateDetail>({
      delay: 800,
      persist: async (data) => {
        const current = savedTemplate.current;
        const result = current
          ? await service.updateTemplate(slug, current.id, { ...data, version: current.version })
          : await service.createTemplate(slug, data);
        savedTemplate.current = result;
        return result;
      },
      status: (status, failure) => {
        setSaveStatus(status);
        if (status === "saved") setDirty(false);
        const data = (failure as { response?: { data?: unknown } })?.response?.data;
        setError(
          status === "error"
            ? data && typeof data === "object"
              ? Object.values(data).flat().map(String).join(" · ")
              : translate.current("workspace_tools.action_error")
            : ""
        );
      },
      saved: (result) => {
        void mutate(`wiki-templates-manage-${slug}`);
        void mutate(`wiki-templates-${slug}`);
        void mutate(`wiki-template-${slug}-${result.id}`, result, false);
        if (isNew) {
          allowNavigation.current = true;
          navigate(`/${slug}/wiki/templates/${result.id}/`, { replace: true });
        }
      },
    })
  );
  useEffect(() => () => autosave.dispose(), [autosave]);
  function updateDraft(patch: Record<string, unknown>) {
    draft.current = { ...draft.current, ...patch };
    autosave.pause();
    setDirty(true);
    setSaveStatus("pending");
    const title = String(draft.current.name).trim();
    if (title) autosave.schedule({ ...draft.current, name: title });
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead title={`${name || t("workspace_tools.new_template")} — Wiki`} />
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 text-13 text-secondary">
          <Link href={`/${slug}/wiki/templates/`} className="hover:underline">
            {t("workspace_tools.templates")}
          </Link>
          <span>/</span>
          <span className="truncate text-primary">{name || t("workspace_tools.new_template")}</span>
        </div>
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-13 font-medium ${saveStatus === "error" ? "text-danger-primary" : "bg-layer-1 text-secondary"}`}
        >
          {saveStatus === "saving" && <LoaderCircle className="size-4 animate-spin" />}
          {saveStatus === "saved" && !dirty && <Check className="size-4" />}
          {saveStatus === "error"
            ? t("workspace_tools.template_save_failed")
            : !name.trim()
              ? t("workspace_tools.template_name_required")
              : saveStatus === "saving"
                ? t("workspace_tools.template_saving")
                : dirty
                  ? t("workspace_tools.template_save_pending")
                  : t("workspace_tools.template_saved")}
        </div>
      </header>
      <div
        className="shrink-0 overflow-x-auto border-b border-subtle px-4 py-3 md:px-8"
        aria-label={t("workspace_tools.template_formatting")}
        onPointerDownCapture={() => {
          contentInteracted.current = true;
        }}
        onKeyDownCapture={() => {
          contentInteracted.current = true;
        }}
      >
        {ready && editor.current && <PageToolbar editorRef={editor.current} />}
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-3 px-8 py-3 text-13 text-danger-primary">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => autosave.retry()}>
            {t("workspace_tools.template_retry")}
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 pt-10 pb-20 md:px-12">
          <Input
            aria-label={t("workspace_tools.template_name")}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              updateDraft({ name: event.target.value });
            }}
            maxLength={80}
            required
            placeholder={t("workspace_tools.template_name")}
            className="w-full border-none bg-transparent px-0 text-32 font-bold text-primary shadow-none"
          />
          <Input
            aria-label={t("workspace_tools.template_description")}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              updateDraft({ description: event.target.value });
            }}
            maxLength={500}
            placeholder={t("workspace_tools.template_description")}
            className="mt-3 w-full border-none bg-transparent px-0 text-14 text-secondary shadow-none"
          />
          <label className="my-5 flex items-center gap-2 text-13 text-secondary">
            <Checkbox
              checked={active}
              onChange={(event) => {
                setActive(event.target.checked);
                updateDraft({ is_active: event.target.checked });
              }}
            />
            {t("workspace_tools.template_active_help")}
          </label>
          <div
            aria-label={t("workspace_tools.template_content")}
            onPointerDownCapture={() => {
              contentInteracted.current = true;
            }}
            onKeyDownCapture={() => {
              contentInteracted.current = true;
            }}
          >
            <DocumentEditor
              ref={editor}
              id={`wiki-template-${template?.id ?? "new"}`}
              editable={true}
              workspaceSlug={slug}
              workspaceId={workspaceId}
              value={template?.content_html ?? "<p></p>"}
              onChange={(_, html, metadata) => {
                const previous = draft.current.content_html;
                draft.current.content_html = html;
                // Document extensions also emit updates without changing the document.
                if (html !== previous && contentInteracted.current && !metadata?.isMigrationUpdate)
                  updateDraft({ content_html: html });
              }}
              handleEditorReady={setReady}
              disabledExtensions={["image", "issue-embed", "ai"]}
              bubbleMenuEnabled
              containerClassName="min-h-96 !border-0 !bg-transparent !pl-0 !shadow-none"
              editorClassName="min-h-80"
              searchMentionCallback={(payload) => workspaceService.searchEntity(slug, payload)}
              uploadFile={async () => {
                throw new Error(t("workspace_tools.template_upload_unsupported"));
              }}
              duplicateFile={async () => {
                throw new Error(t("workspace_tools.template_upload_unsupported"));
              }}
            />
          </div>
        </div>
      </div>
      <AlertModalCore
        isSubmitting={false}
        isOpen={blocker.state === "blocked"}
        title={t("workspace_tools.template_discard_title")}
        content={t("workspace_tools.template_discard_help")}
        handleClose={() => blocker.reset?.()}
        handleSubmit={() => blocker.proceed?.()}
        primaryButtonText={{
          default: t("workspace_tools.template_discard"),
          loading: t("workspace_tools.template_discard"),
        }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
}
