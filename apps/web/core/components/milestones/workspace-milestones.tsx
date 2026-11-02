import { useParams, useSearchParams } from "react-router";
import useSWR from "swr";
import { Flag } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header, Input } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { MilestoneListItem } from "./milestone-list-item";
import { WorkspaceSelect } from "@/components/common/workspace-select";
import { PageHead } from "@/components/core/page-title";
import { milestoneService } from "@/services/milestone.service";
export function WorkspaceMilestones() {
  const { workspaceSlug = "" } = useParams();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const project = params.get("project_id") || "";
  const status = params.get("status") || "risk";
  const windowDays = params.get("window_days") || "7";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const change = (key: string, value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  const data = useSWR(
    ["workspace-milestones", workspaceSlug, project, status, windowDays, page, search],
    () =>
      milestoneService.portfolio(workspaceSlug, {
        ...(project ? { project_id: project } : {}),
        status,
        window_days: windowDays,
        page,
        search,
      }),
    { refreshInterval: 5000 }
  );
  const rows = data.data?.results ?? [];
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHead title={t("workspace_tools.milestone_portfolio")} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t("workspace_tools.milestone_portfolio")}
                      icon={<Flag className="size-4 text-tertiary" />}
                    />
                  }
                />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />
      <main aria-label={t("workspace_tools.milestone_portfolio")} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-page-x py-2.5">
          <WorkspaceSelect
            variant="filter"
            label={t("workspace_tools.milestone_project_filter")}
            value={project}
            onChange={(v) => change("project_id", v)}
            options={[
              { value: "", label: t("workspace_tools.milestone_all_projects") },
              ...(data.data?.projects ?? []).map((p) => ({ value: p.id, label: `${p.identifier} · ${p.name}` })),
            ]}
          />
          <WorkspaceSelect
            variant="filter"
            label={t("workspace_tools.milestone_risk_filter")}
            value={status}
            onChange={(v) => change("status", v)}
            options={[
              { value: "risk", label: t("workspace_tools.milestone_risk_only") },
              { value: "overdue", label: t("workspace_tools.milestone_overdue") },
              { value: "due_soon", label: t("workspace_tools.milestone_due_soon") },
              { value: "planning", label: t("workspace_tools.milestone_planning_gaps") },
              { value: "completed", label: t("workspace_tools.milestone_completed") },
              { value: "all", label: t("workspace_tools.milestone_all_statuses") },
            ]}
          />
          <WorkspaceSelect
            variant="filter"
            label={t("workspace_tools.milestone_window")}
            value={windowDays}
            onChange={(v) => change("window_days", v)}
            options={[3, 7, 14, 30].map((n) => ({
              value: String(n),
              label: t("workspace_tools.milestone_within_days", { days: n }),
            }))}
          />
          <Input
            className="h-7 w-full py-1 text-13 sm:ml-auto sm:w-52"
            aria-label={t("workspace_tools.milestone_portfolio_search")}
            placeholder={t("workspace_tools.milestone_portfolio_search")}
            value={search}
            onChange={(e) => {
              change("search", e.target.value);
            }}
          />
        </div>
        <p className="px-page-x py-3 text-12 text-secondary">{t("workspace_tools.milestone_portfolio_intro")}</p>
        {data.error && (
          <p role="alert" className="px-page-x py-2 text-13 text-danger-primary">
            {t("workspace_tools.milestone_load_error")}
          </p>
        )}
        {data.isLoading && (
          <p role="status" className="px-page-x py-2 text-13 text-secondary">
            {t("workspace_tools.milestone_loading")}
          </p>
        )}
        {!!data.data?.limited_project_count && (
          <p className="px-page-x py-2 text-13 text-secondary">{t("workspace_tools.milestone_portfolio_limited")}</p>
        )}
        {data.data && (
          <p className="px-page-x pb-3 text-12 text-tertiary">
            {t("workspace_tools.milestone_result_count", { count: data.data.total })} · {data.data.today} ·{" "}
            {data.data.timezone}
          </p>
        )}
        <div aria-label={t("workspace_tools.milestones")}>
          {rows.map((m) => (
            <MilestoneListItem
              key={m.id}
              milestone={m}
              project={m}
              href={`/${workspaceSlug}/projects/${m.project_id}/milestones/?milestone=${m.id}`}
            />
          ))}
          {data.data && !rows.length && !data.error && (
            <p className="p-8 text-center text-13 text-secondary">{t("workspace_tools.milestone_no_risks")}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-subtle px-page-x py-3 text-12 text-secondary">
          <span>{page}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page === 1 || data.isLoading}
            onClick={() =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set("page", String(page - 1));
                return next;
              })
            }
          >
            {t("workspace_tools.milestone_previous")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!data.data?.next_page || data.isLoading}
            onClick={() =>
              setParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set("page", String(page + 1));
                return next;
              })
            }
          >
            {t("workspace_tools.milestone_next")}
          </Button>
        </div>
      </main>
    </div>
  );
}
