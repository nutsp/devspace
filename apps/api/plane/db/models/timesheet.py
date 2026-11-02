from django.conf import settings
from django.db import models
from .base import BaseModel


class Timesheet(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="timesheets")
    user_name = models.CharField(max_length=255)
    week_start = models.DateField()
    timezone = models.CharField(max_length=255, default="Asia/Bangkok")
    status = models.CharField(max_length=16, default="draft", choices=[(s, s) for s in ("draft", "submitted", "returned", "approved")])
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="review_timesheets")
    project_reviews = models.JSONField(default=dict, blank=True)
    version = models.PositiveIntegerField(default=0)
    submitted_at = models.DateTimeField(null=True)
    approved_at = models.DateTimeField(null=True)

    class Meta:
        db_table = "timesheets"
        constraints = [models.UniqueConstraint(fields=["workspace", "user", "week_start"], name="timesheet_unique_user_week")]
        indexes = [models.Index(fields=["reviewer", "status"], name="timesheet_reviewer_status")]


class TimeEntry(BaseModel):
    timesheet = models.ForeignKey(Timesheet, on_delete=models.CASCADE, related_name="entries")
    work_date = models.DateField()
    project = models.ForeignKey("db.Project", null=True, on_delete=models.SET_NULL)
    issue = models.ForeignKey("db.Issue", null=True, blank=True, on_delete=models.SET_NULL)
    project_name = models.CharField(max_length=255)
    project_code = models.CharField(max_length=12)
    issue_name = models.CharField(max_length=255, blank=True)
    issue_code = models.CharField(max_length=50, blank=True)
    activity = models.CharField(max_length=30)
    duration_minutes = models.PositiveIntegerField()
    note = models.TextField(blank=True)

    class Meta:
        db_table = "time_entries"
        constraints = [models.CheckConstraint(condition=models.Q(duration_minutes__gt=0, duration_minutes__lte=1440), name="time_entry_valid_minutes")]


class TimesheetEvent(BaseModel):
    timesheet = models.ForeignKey(Timesheet, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    actor_name = models.CharField(max_length=255)
    action = models.CharField(max_length=30)
    reason = models.TextField(blank=True)
    version = models.PositiveIntegerField()
    snapshot = models.JSONField(default=dict)

    class Meta:
        db_table = "timesheet_events"
