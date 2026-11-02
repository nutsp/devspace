import { useRef } from "react";
import type { ReactNode, MouseEvent } from "react";
import { CalendarDays, AlertTriangle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CircularProgressIndicator } from "@plane/ui";
import { ListItem } from "@/components/core/list";
import type { Milestone, PortfolioMilestone } from "@/services/milestone.service";

const riskLabelKeys = {
  overdue: "workspace_tools.milestone_overdue",
  at_risk: "workspace_tools.milestone_at_risk",
  due_soon: "workspace_tools.milestone_due_soon",
  on_track: "workspace_tools.milestone_on_track",
  completed: "workspace_tools.milestone_completed",
  no_target: "workspace_tools.milestone_no_target",
  empty: "workspace_tools.milestone_empty_work",
} as const;

export function MilestoneListItem({
  milestone: m,
  href,
  project,
  actions,
  onClick,
  selected,
}: {
  milestone: Milestone;
  href: string;
  project?: Pick<PortfolioMilestone, "project_code" | "project_name" | "visibility_limited">;
  actions?: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  selected?: boolean;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const riskColor = m.overdue ? "text-danger-primary" : m.at_risk ? "text-warning-primary" : "text-secondary";
  const reasons = [
    ...(m.due_soon ? [t("workspace_tools.milestone_due_soon_reason", { days: m.days_remaining ?? 0 })] : []),
    ...(m.late_pending_work_items
      ? [t("workspace_tools.milestone_late_count", { count: m.late_pending_work_items })]
      : []),
    ...(m.overdue_work_items
      ? [t("workspace_tools.milestone_overdue_work_count", { count: m.overdue_work_items })]
      : []),
    ...(m.unassigned_work_items
      ? [t("workspace_tools.milestone_unassigned_count", { count: m.unassigned_work_items })]
      : []),
    ...(m.undated_work_items ? [t("workspace_tools.milestone_undated_count", { count: m.undated_work_items })] : []),
    ...(!m.target_date && m.pending > 0 ? [t("workspace_tools.milestone_no_target")] : []),
  ];
  return (
    <ListItem
      parentRef={parentRef}
      title={m.name}
      itemLink={href}
      onItemClick={onClick}
      className={selected ? "bg-layer-transparent-active hover:bg-layer-transparent-active" : ""}
      itemClassName="min-w-0"
      leftElementClassName="min-w-0"
      prependTitleElement={
        <div
          role="progressbar"
          aria-label={`${m.name} ${t("workspace_tools.milestone_progress")}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={m.progress}
        >
          <CircularProgressIndicator size={30} percentage={m.progress} strokeWidth={3}>
            <span className="text-9 text-primary">{m.progress}%</span>
          </CircularProgressIndicator>
        </div>
      }
      appendTitleElement={<span className={`text-11 ${riskColor}`}>{t(riskLabelKeys[m.risk_status])}</span>}
      actionableItems={
        <>
          {project && (
            <span title={project.project_name} className="text-11 text-secondary">
              {project.project_code}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 text-11 ${m.overdue ? "text-danger-primary" : "text-secondary"}`}
          >
            <CalendarDays className="size-3.5 shrink-0" />
            <span>{m.target_date || t("workspace_tools.milestone_no_target")}</span>
            {m.overdue && (
              <span>· {t("workspace_tools.milestone_days_overdue", { days: Math.abs(m.days_remaining ?? 0) })}</span>
            )}
          </span>
          <span className="text-11 text-secondary">
            {t("workspace_tools.milestone_pending_count", { count: m.pending })}
          </span>
          {!project && (
            <span className="text-11 text-tertiary">
              {m.completed} / {m.total - m.cancelled} · {m.cancelled} {t("workspace_tools.milestone_cancelled")}
            </span>
          )}
          {reasons.length > 0 && (
            <span className={`inline-flex max-w-sm items-start gap-1.5 text-11 ${riskColor}`}>
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>{reasons.join(" · ")}</span>
            </span>
          )}
          {project?.visibility_limited && (
            <span className="text-11 text-tertiary">{t("workspace_tools.milestone_limited_badge")}</span>
          )}
          {actions}
        </>
      }
      actionItemContainerClassName="gap-x-4 gap-y-2 lg:max-w-[55%] lg:flex-wrap lg:py-2"
    />
  );
}
