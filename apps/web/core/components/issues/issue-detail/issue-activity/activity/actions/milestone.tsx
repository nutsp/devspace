import { observer } from "mobx-react";
import { Flag } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssueActivityBlockComponent } from "./helpers/activity-block";
export const IssueMilestoneActivity = observer(function IssueMilestoneActivity({
  activityId,
  ends,
}: {
  activityId: string;
  ends: "top" | "bottom" | undefined;
}) {
  const { t } = useTranslation();
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const activity = getActivityById(activityId);
  if (!activity) return null;
  return (
    <IssueActivityBlockComponent
      icon={<Flag className="size-3.5 text-secondary" />}
      activityId={activityId}
      ends={ends}
    >
      {t("workspace_tools.milestone_activity", {
        old: activity.old_value || t("workspace_tools.milestone_none"),
        next: activity.new_value || t("workspace_tools.milestone_none"),
      })}
    </IssueActivityBlockComponent>
  );
});
