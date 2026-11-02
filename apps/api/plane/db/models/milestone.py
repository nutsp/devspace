"""Project delivery checkpoints; assignments do not change work item ownership."""
from django.db import models
from django.db.models.functions import Lower
from django.db.models.signals import post_save
from django.dispatch import receiver
from .project import ProjectBaseModel
from .issue import Issue, IssueActivity


class Milestone(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    target_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "milestones"
        ordering = ["target_date", "name", "id"]
        constraints = [models.UniqueConstraint(Lower("name"), "project", condition=models.Q(deleted_at__isnull=True), name="milestone_unique_project_name")]


class MilestoneIssue(ProjectBaseModel):
    milestone = models.ForeignKey(Milestone, on_delete=models.CASCADE, related_name="assignments")
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name="milestone_assignments")

    class Meta:
        db_table = "milestone_issues"
        constraints = [models.UniqueConstraint(fields=["issue"], condition=models.Q(deleted_at__isnull=True), name="milestone_one_per_issue")]


def milestone_activity(issue, old, new, actor=None):
    if old == new:
        return
    IssueActivity.objects.create(project=issue.project, workspace=issue.workspace, issue=issue,
        actor=actor, field="milestone", verb="updated", old_value=old or "", new_value=new or "")


@receiver(post_save, sender=Issue)
def detach_moved_issue(sender, instance, **kwargs):
    # Moving between projects must never carry a checkpoint from the old project.
    for assignment in MilestoneIssue.objects.filter(issue=instance).select_related("milestone").exclude(project_id=instance.project_id):
        milestone_activity(instance, assignment.milestone.name, None, instance.updated_by)
        assignment.delete()
