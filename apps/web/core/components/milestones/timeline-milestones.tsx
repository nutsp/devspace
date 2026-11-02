import { observer } from "mobx-react";
import { Link, useNavigate } from "react-router";
import useSWR from "swr";
import { Diamond, Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CircularProgressIndicator, CustomSearchSelect } from "@plane/ui";
import { Tooltip } from "@plane/propel/tooltip";
import { getDate } from "@plane/utils";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
import { HEADER_HEIGHT } from "@/components/gantt-chart/constants";
import { milestoneService, milestoneKey } from "@/services/milestone.service";
import { groupMilestonesByDate, milestoneMarkerOffset, splitMilestoneMarkers } from "@/helpers/milestone-markers";

const markerColor = (progress: number) =>
  progress >= 100 ? "text-success-primary" : progress > 0 ? "text-accent-primary" : "text-tertiary";

type Props = { workspaceSlug: string; projectId: string };
function useMilestones({ workspaceSlug, projectId }: Props) {
  return useSWR(
    workspaceSlug && projectId ? milestoneKey(workspaceSlug, projectId) : null,
    () => milestoneService.list(workspaceSlug, projectId),
    { refreshInterval: 5000 }
  );
}
export const TimelineMilestones = observer(function TimelineMilestones(props: Props) {
  const data = useMilestones(props);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentViewData } = useTimeLineChartStore();
  if (!currentViewData || !data.data) return null;
  const { startDate, endDate, dayWidth } = currentViewData.data;
  const href = (id: string) => `/${props.workspaceSlug}/projects/${props.projectId}/milestones/?milestone=${id}`;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[6]"
      aria-label={t("workspace_tools.milestone_timeline_markers")}
    >
      {groupMilestonesByDate(data.data.results).map((group) => {
        const left = milestoneMarkerOffset(group.date, startDate, dayWidth);
        const max = milestoneMarkerOffset(
          `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`,
          startDate,
          dayWidth
        );
        if (left === null || max === null || left < 0 || left > max) return null;
        const { visible, overflow } = splitMilestoneMarkers(group.items);
        return (
          <div
            key={group.date}
            data-milestone-date={group.date}
            className="absolute bottom-0"
            style={{ left, top: HEADER_HEIGHT }}
          >
            {visible.map((m, index) => (
              <div
                key={m.id}
                className={`pointer-events-none absolute inset-y-0 border-l border-dashed border-current ${markerColor(m.progress)}`}
                style={{ left: (index - (visible.length - 1) / 2) * Math.min(3, dayWidth / (visible.length + 1)) }}
              />
            ))}
            <div
              className="pointer-events-auto sticky z-[6] flex -translate-x-1/2 flex-col items-center gap-2"
              style={{ top: HEADER_HEIGHT + 64 }}
            >
              {visible.map((m, index) => {
                const summary = `${m.name} · ${group.date} · ${m.progress}% · ${t("workspace_tools.milestone_work_item_count", { count: m.total })}`;
                return (
                  <Tooltip
                    key={m.id}
                    position="right"
                    tooltipHeading={m.name}
                    className="min-w-56 p-4"
                    tooltipContent={
                      <span className="mt-3 block space-y-3 text-13">
                        <span className="flex items-center gap-2">
                          <CircularProgressIndicator size={22} percentage={m.progress} strokeWidth={3} />
                          <span>
                            {m.progress}% {t("workspace_tools.milestone_progress")}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <Layers className="size-4" />
                          {t("workspace_tools.milestone_work_item_count", { count: m.total })}
                        </span>
                        <span className="block text-11 text-tertiary">{group.date}</span>
                        {data.data?.visibility_limited && (
                          <span className="block text-11 text-tertiary">
                            {t("workspace_tools.milestone_limited_badge")}
                          </span>
                        )}
                      </span>
                    }
                  >
                    <Link
                      to={href(m.id)}
                      data-milestone-marker={m.id}
                      style={{
                        position: "relative",
                        left: (index - (visible.length - 1) / 2) * Math.min(3, dayWidth / (visible.length + 1)),
                      }}
                      className={`flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-layer-transparent-hover focus-visible:outline-2 focus-visible:outline-accent-strong ${markerColor(m.progress)}`}
                      aria-label={`${t("workspace_tools.milestone")}: ${summary}`}
                    >
                      <Diamond className="size-4 fill-current stroke-(--background-color-surface-1)" />
                    </Link>
                  </Tooltip>
                );
              })}
              {overflow.length > 0 && (
                <CustomSearchSelect
                  value=""
                  customButton={
                    <span
                      aria-label={t("workspace_tools.milestone_more_on_date", {
                        count: overflow.length,
                        date: group.date,
                      })}
                    >
                      +{overflow.length}
                    </span>
                  }
                  customButtonClassName="min-h-8 min-w-8 justify-center rounded-sm border border-subtle-1 bg-layer-2 px-1 text-11 text-primary hover:bg-layer-2-hover"
                  optionsClassName="z-[100] max-w-[calc(100vw-2rem)] min-w-60"
                  noChevron
                  options={overflow.map((m) => ({ value: m.id, query: m.name, content: `${m.name} · ${m.progress}%` }))}
                  onChange={(id: string) => navigate(href(id))}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});
export function TimelineMilestoneToolbar(props: Props & { focusDate: (date: Date) => void }) {
  const { t } = useTranslation();
  const data = useMilestones(props);
  const dated = (data.data?.results ?? []).filter((m) => m.target_date);
  return (
    <div className="flex flex-wrap items-center gap-3 px-2 py-1">
      <CustomSearchSelect
        value=""
        label={t("workspace_tools.milestone_jump")}
        disabled={!dated.length}
        className="w-60"
        buttonClassName="w-full text-secondary"
        optionsClassName="z-[100] max-w-[calc(100vw-2rem)]"
        options={dated.map((m) => ({
          value: m.id,
          query: `${m.name} ${m.target_date}`,
          content: `${m.name} · ${m.target_date}`,
        }))}
        onChange={(id: string) => {
          const row = dated.find((m) => m.id === id);
          const date = getDate(row?.target_date);
          if (date) props.focusDate(date);
        }}
      />
      {data.error ? (
        <p role="alert" className="text-11 text-danger-primary">
          {t("workspace_tools.milestone_load_error")}
        </p>
      ) : (
        <span className="text-11 text-tertiary">
          {t(dated.length ? "workspace_tools.milestone_marker_help" : "workspace_tools.milestone_no_dated")}
          {data.data?.visibility_limited && ` · ${t("workspace_tools.milestone_limited_badge")}`}
        </span>
      )}
    </div>
  );
}
