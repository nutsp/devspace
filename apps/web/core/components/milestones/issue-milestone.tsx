import { useState } from "react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { CustomSearchSelect } from "@plane/ui";
import { milestoneService as service, milestoneKey, milestoneError } from "@/services/milestone.service";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

export function IssueMilestone({
  workspaceSlug,
  projectId,
  issueId,
  disabled,
}: {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { activity } = useIssueDetail();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const list = useSWR(milestoneKey(workspaceSlug, projectId), () => service.list(workspaceSlug, projectId));
  const item = useSWR(
    ["issue-milestone", workspaceSlug, projectId, issueId],
    () => service.issues(workspaceSlug, projectId, { issue_id: issueId }),
    { refreshInterval: 5000 }
  );
  const issue = item.data?.results[0];
  const selected = list.data?.results.find((m) => m.id === issue?.milestone_id);
  return (
    <div className="w-full min-w-0">
      <CustomSearchSelect
        value={issue?.milestone_id ?? ""}
        label={selected?.name ?? t("workspace_tools.milestone_none")}
        disabled={disabled || busy || !list.data?.can_write || !item.data || !issue}
        className="w-full"
        buttonClassName="w-full border-0 text-primary"
        optionsClassName="z-[100] max-w-[calc(100vw-2rem)]"
        options={[
          { value: "", query: t("workspace_tools.milestone_none"), content: t("workspace_tools.milestone_none") },
          ...(list.data?.results ?? []).map((m) => ({ value: m.id, query: m.name, content: m.name })),
        ]}
        onChange={async (value: string) => {
          setBusy(true);
          setError("");
          try {
            await service.assign(workspaceSlug, projectId, issueId, value || null);
            await Promise.all([
              item.mutate(),
              list.mutate(),
              activity.fetchActivities(workspaceSlug, projectId, issueId),
            ]);
          } catch (e) {
            setError(milestoneError(e, t("workspace_tools.milestone_error")));
          } finally {
            setBusy(false);
          }
        }}
      />
      {issue?.late && (
        <p className="mt-1 text-11 whitespace-normal text-danger-primary">{t("workspace_tools.milestone_late")}</p>
      )}
      {(error || list.error || item.error) && (
        <p role="alert" className="mt-1 text-11 whitespace-normal text-danger-primary">
          {error || t("workspace_tools.milestone_load_error")}
        </p>
      )}
    </div>
  );
}
