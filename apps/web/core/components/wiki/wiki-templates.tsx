import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Badge } from "@plane/propel/badge";
import { CustomMenu, AlertModalCore } from "@plane/ui";
import { Copy, FileText, MoreHorizontal, Pencil, Plus, Trash2, Power } from "lucide-react";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import { PageHead } from "@/components/core/page-title";
import { useUserPermissions } from "@/hooks/store/user";
import { WikiService } from "@/services/wiki.service";
import type { WikiTemplateDetail } from "@/services/wiki.service";
import { useAppRouter } from "@/hooks/use-app-router";

const service = new WikiService();
function message(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  return data && typeof data === "object" ? Object.values(data).flat().map(String).join(" · ") : fallback;
}

export const WikiTemplatesPage = observer(function WikiTemplatesPage() {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { getWorkspaceRoleByWorkspaceSlug } = useUserPermissions();
  const router = useAppRouter();
  const admin = getWorkspaceRoleByWorkspaceSlug(slug) === 20;
  const list = useSWR(admin ? `wiki-templates-manage-${slug}` : null, () => service.manageTemplates(slug));
  const { mutate: mutateCache } = useSWRConfig();
  const [deleting, setDeleting] = useState<WikiTemplateDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    await Promise.all([list.mutate(), mutateCache(`wiki-templates-${slug}`)]);
  }
  async function action(row: WikiTemplateDetail, kind: "duplicate" | "toggle" | "delete") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "duplicate") {
        const copy = await service.duplicateTemplate(slug, row);
        router.push(`/${slug}/wiki/templates/${copy.id}/`);
      } else if (kind === "toggle")
        await service.updateTemplate(slug, row.id, { version: row.version, is_active: !row.is_active });
      else {
        await service.deleteTemplate(slug, row);
        setDeleting(null);
      }
      await refresh();
    } catch (failure) {
      setError(message(failure, t("workspace_tools.action_error")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead title={`Wiki — ${t("workspace_tools.templates")}`} />
      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-subtle px-4 py-2">
        <div className="flex items-center gap-2 text-14 text-primary">
          <FileText className="size-4" />
          {t("workspace_tools.templates")}
        </div>
        {admin && (
          <Button
            variant="primary"
            size="lg"
            disabled={busy}
            prependIcon={<Plus className="size-4" />}
            onClick={() => {
              setError("");
              router.push(`/${slug}/wiki/templates/new/`);
            }}
          >
            {t("workspace_tools.new_template")}
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 md:p-8">
        <h1 className="text-24 font-semibold text-primary">{t("workspace_tools.templates")}</h1>
        <p className="mt-2 max-w-2xl text-14 text-secondary">{t("workspace_tools.templates_help")}</p>
        {!admin ? (
          <p className="py-8 text-14 text-secondary">{t("workspace_tools.templates_admin_only")}</p>
        ) : (
          <>
            {(error || list.error) && !deleting && (
              <p role="alert" className="mt-4 text-13 text-danger-primary">
                {error || t("workspace_tools.templates_load_error")}
              </p>
            )}
            {list.isLoading ? (
              <p role="status" className="py-8 text-secondary">
                {t("workspace_tools.loading")}
              </p>
            ) : (
              <div className="mt-6 divide-y divide-subtle border-y border-subtle">
                {(list.data ?? []).map((row) => (
                  <div key={row.id} className="flex items-center gap-3 py-4">
                    <button
                      type="button"
                      disabled={busy}
                      className="min-w-0 flex-1 rounded-md px-2 py-1 text-left hover:bg-layer-transparent-hover"
                      onClick={() => {
                        setError("");
                        router.push(`/${slug}/wiki/templates/${row.id}/`);
                      }}
                    >
                      <span className="block truncate text-14 font-medium text-primary">{row.name}</span>
                      {row.description && (
                        <span className="mt-1 block truncate text-12 text-secondary">{row.description}</span>
                      )}
                    </button>
                    <Badge variant={row.is_active ? "success" : "neutral"}>
                      {t(row.is_active ? "workspace_tools.template_active" : "workspace_tools.template_inactive")}
                    </Badge>
                    <CustomMenu
                      customButton={
                        <span className={getIconButtonStyling("ghost", "sm")}>
                          <MoreHorizontal className="size-4" />
                        </span>
                      }
                      ariaLabel={t("workspace_tools.template_actions", { name: row.name })}
                      placement="bottom-end"
                      closeOnSelect
                      disabled={busy}
                    >
                      <CustomMenu.MenuItem
                        onClick={() => {
                          setError("");
                          router.push(`/${slug}/wiki/templates/${row.id}/`);
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <Pencil className="size-3.5" />
                          {t("edit")}
                        </span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => void action(row, "duplicate")}>
                        <span className="flex items-center gap-2">
                          <Copy className="size-3.5" />
                          {t("workspace_tools.duplicate_template")}
                        </span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem onClick={() => void action(row, "toggle")}>
                        <span className="flex items-center gap-2">
                          <Power className="size-3.5" />
                          {t(
                            row.is_active ? "workspace_tools.deactivate_template" : "workspace_tools.activate_template"
                          )}
                        </span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem
                        onClick={() => {
                          setError("");
                          setDeleting(row);
                        }}
                      >
                        <span className="flex items-center gap-2 text-danger-primary">
                          <Trash2 className="size-3.5" />
                          {t("delete")}
                        </span>
                      </CustomMenu.MenuItem>
                    </CustomMenu>
                  </div>
                ))}
                {!list.isLoading && !list.error && !list.data?.length && (
                  <p className="py-10 text-14 text-secondary">{t("workspace_tools.no_templates")}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {deleting && (
        <AlertModalCore
          isOpen
          isSubmitting={busy}
          title={t("workspace_tools.delete_template")}
          content={
            <>
              <p className="font-medium text-primary">{deleting.name}</p>
              <p>{t("workspace_tools.delete_template_help")}</p>
              {error && (
                <p role="alert" className="text-danger-primary">
                  {error}
                </p>
              )}
            </>
          }
          handleClose={() => {
            if (!busy) {
              setDeleting(null);
              setError("");
            }
          }}
          handleSubmit={() => void action(deleting, "delete")}
          primaryButtonText={{ default: t("delete"), loading: t("deleting") }}
          secondaryButtonText={t("cancel")}
        />
      )}
    </>
  );
});
