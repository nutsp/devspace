"""Weekly timesheets: one owner, project-lead approvals, versioned changes and XLSX."""
from datetime import timedelta
from io import BytesIO
from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError, APIException
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace, WorkspaceMember, Project, ProjectMember, Issue, Timesheet, TimeEntry, TimesheetEvent
from plane.utils.csv_utils import sanitize_csv_row

ACTIVITIES = ("Development", "Review", "QA", "Meeting", "Support", "Learning")


class Conflict(APIException):
    status_code = 409
    default_detail = "This timesheet has changed. Reload it before continuing."


def member(user, slug, write=False):
    row = WorkspaceMember.objects.select_related("workspace").filter(workspace__slug=slug, member=user, is_active=True).first()
    if not row or (write and row.role < 15):
        raise PermissionDenied()
    return row


def reviewable_projects(workspace, user):
    return Project.objects.filter(workspace=workspace, is_wiki_collection=False, archived_at__isnull=True,
        project_lead=user, project_projectmember__member=user, project_projectmember__is_active=True,
        project_projectmember__role__gte=15, project_projectmember__deleted_at__isnull=True).distinct()


def eligible_reviewers(workspace):
    leads = Project.objects.filter(workspace=workspace, is_wiki_collection=False, archived_at__isnull=True).values("project_lead_id")
    return WorkspaceMember.objects.filter(workspace=workspace, is_active=True, role__gte=15,
        member_id__in=leads).select_related("member").order_by("member__display_name")


def lead_project_ids(sheet, user):
    if sheet.status == "draft":
        return set()
    if not WorkspaceMember.objects.filter(workspace=sheet.workspace, member=user, is_active=True, role__gte=15).exists():
        return set()
    return {str(pid) for pid in sheet.entries.filter(project__in=reviewable_projects(sheet.workspace, user)).values_list("project_id", flat=True)
        if str(pid) in sheet.project_reviews}


def review_sheet_query(workspace, user):
    scope = Q(pk__in=[])
    for project_id in reviewable_projects(workspace, user).values_list("id", flat=True):
        scope |= Q(project_reviews__has_key=str(project_id), entries__project_id=project_id, entries__deleted_at__isnull=True)
    return scope & ~Q(status="draft")


def submission_reviews(sheet):
    projects = {str(p.id): p for p in Project.objects.filter(id__in=sheet.entries.values("project_id"),
        workspace=sheet.workspace, is_wiki_collection=False, archived_at__isnull=True).select_related("project_lead")}
    result = {}
    for entry in sheet.entries.all():
        key = str(entry.project_id)
        if key in result:
            continue
        project = projects.get(key)
        lead = project.project_lead if project else None
        valid = lead and eligible_reviewers(sheet.workspace).filter(member=lead).exists()
        if not valid or not reviewable_projects(sheet.workspace, lead).filter(id=project.id).exists():
            raise ValidationError(f"{entry.project_code}: assign an active Project Lead before submitting.")
        result[key] = {"project_id": key, "project_name": project.name, "project_code": project.identifier,
            "reviewer_id": str(lead.id), "reviewer_name": lead.display_name, "status": "submitted", "reason": "", "reviewed_at": None}
    if not result:
        raise ValidationError("Add at least one time entry before submitting.")
    return result


def week_date(value, workspace):
    if not value:
        date = timezone.now().astimezone(ZoneInfo(workspace.timezone)).date()
    else:
        date = serializers.DateField().run_validation(value)
    return date - timedelta(days=date.weekday())


def entry_data(entry):
    return {"id": str(entry.id), "work_date": entry.work_date.isoformat(), "project_id": str(entry.project_id) if entry.project_id else None,
        "issue_id": str(entry.issue_id) if entry.issue_id else None, "project_name": entry.project_name, "project_code": entry.project_code,
        "issue_name": entry.issue_name, "issue_code": entry.issue_code, "activity": entry.activity, "duration_minutes": entry.duration_minutes, "note": entry.note}


def sheet_data(sheet, user=None):
    owner = user is None or sheet.user_id == user.id
    lead_scope = lead_project_ids(sheet, user) if user is not None else set()
    scope = None if owner else lead_scope
    entries = [entry_data(entry) for entry in sheet.entries.order_by("work_date", "created_at")
        if scope is None or str(entry.project_id) in scope]
    reviews = []
    current_leads = {str(p.id): p.project_lead for p in Project.objects.filter(id__in=sheet.project_reviews).select_related("project_lead")}
    for key, value in sheet.project_reviews.items():
        if scope is not None and key not in scope:
            continue
        review = {**value}
        if review["status"] == "submitted" and current_leads.get(key):
            lead = current_leads[key]
            review.update(reviewer_id=str(lead.id), reviewer_name=lead.display_name)
        review["can_review"] = key in lead_scope and review["status"] == "submitted" and sheet.status == "submitted"
        reviews.append(review)
    statuses = {r["status"] for r in reviews if not owner or user is None or r["project_id"] in lead_scope}
    review_status = "returned" if "returned" in statuses else "submitted" if "submitted" in statuses else "approved" if statuses else sheet.status
    names = list(dict.fromkeys(r.get("reviewer_name") for r in reviews if r.get("reviewer_name")))
    events = [{"id": str(e.id), "action": e.action, "actor": e.actor_name, "reason": e.reason, "version": e.version, "created_at": e.created_at}
        for e in sheet.events.order_by("created_at") if owner or e.snapshot.get("project_id") in scope]
    return {"id": str(sheet.id), "week_start": sheet.week_start.isoformat(), "timezone": sheet.timezone, "user_id": str(sheet.user_id) if sheet.user_id else None,
        "user_name": sheet.user_name, "status": sheet.status, "review_status": review_status,
        "reviewer_id": reviews[0].get("reviewer_id") if len(names) == 1 and reviews else None,
        "reviewer_name": ", ".join(names) or None, "project_reviews": reviews, "version": sheet.version,
        "submitted_at": sheet.submitted_at, "approved_at": sheet.approved_at, "total_minutes": sum(e["duration_minutes"] for e in entries), "entries": entries,
        "events": events}


def authorize_read(sheet, user):
    if sheet.user_id != user.id and not lead_project_ids(sheet, user):
        raise PermissionDenied()


def record(sheet, user, action, reason="", snapshot=None):
    sheet.version += 1
    sheet.save()
    TimesheetEvent.objects.create(timesheet=sheet, actor=user, actor_name=user.display_name, action=action, reason=reason,
        version=sheet.version, snapshot=snapshot or {})


class EntryInput(serializers.Serializer):
    version = serializers.IntegerField(min_value=0)
    work_date = serializers.DateField()
    project_id = serializers.UUIDField()
    issue_id = serializers.UUIDField(required=False, allow_null=True)
    activity = serializers.ChoiceField(choices=ACTIVITIES)
    duration_minutes = serializers.IntegerField(min_value=1, max_value=1440)
    note = serializers.CharField(required=False, allow_blank=True, max_length=2000, default="")


class TimesheetOptionsEndpoint(BaseAPIView):
    def get(self, request, slug):
        row = member(request.user, slug)
        projects = Project.objects.filter(workspace=row.workspace, is_wiki_collection=False, archived_at__isnull=True,
            project_projectmember__member=request.user, project_projectmember__is_active=True).distinct().order_by("name")
        issues = []
        project_id = request.query_params.get("project_id")
        if project_id:
            project_id = serializers.UUIDField().run_validation(project_id)
            project = get_object_or_404(projects, id=project_id)
            query = request.query_params.get("search", "").strip()[:200]
            issues = [{"id": str(i.id), "name": i.name, "code": f"{project.identifier}-{i.sequence_id}"}
                for i in Issue.objects.filter(project=project, is_draft=False, name__icontains=query).order_by("sequence_id")[:200]]
        reviewers = list(eligible_reviewers(row.workspace))
        return Response({"projects": [{"id": str(p.id), "name": p.name, "identifier": p.identifier, "project_lead_id": str(p.project_lead_id) if p.project_lead_id else None, "project_lead_name": p.project_lead.display_name if p.project_lead_id else None, "lead_eligible": bool(p.project_lead_id and eligible_reviewers(row.workspace).filter(member_id=p.project_lead_id).exists() and reviewable_projects(row.workspace, p.project_lead).filter(id=p.id).exists())} for p in projects], "issues": issues,
            "reviewers": [{"id": str(r.member_id), "name": r.member.display_name} for r in reviewers if r.member_id != request.user.id],
            "is_reviewer": row.role >= 15 and reviewable_projects(row.workspace, request.user).exists(), "activities": ACTIVITIES, "can_write": row.role >= 15})


class MyTimesheetEndpoint(BaseAPIView):
    def get(self, request, slug):
        row = member(request.user, slug)
        start = week_date(request.query_params.get("week_start"), row.workspace)
        sheet = Timesheet.objects.filter(workspace=row.workspace, user=request.user, week_start=start).first()
        return Response(sheet_data(sheet, request.user) if sheet else {"id": None, "week_start": start.isoformat(), "timezone": row.workspace.timezone,
            "user_id": str(request.user.id), "user_name": request.user.display_name, "status": "draft", "version": 0,
            "reviewer_id": None, "reviewer_name": None, "project_reviews": [], "review_status": "draft", "total_minutes": 0, "entries": [], "events": []})

    def post(self, request, slug):
        row = member(request.user, slug, write=True)
        start = week_date(request.data.get("week_start"), row.workspace)
        with transaction.atomic():
            sheet, _ = Timesheet.objects.get_or_create(workspace=row.workspace, user=request.user, week_start=start,
                defaults={"user_name": request.user.display_name, "timezone": row.workspace.timezone})
        return Response(sheet_data(sheet, request.user), status=201)


class TimesheetInboxEndpoint(BaseAPIView):
    def get(self, request, slug):
        row = member(request.user, slug)
        if not eligible_reviewers(row.workspace).filter(member=request.user).exists():
            raise PermissionDenied()
        sheets = Timesheet.objects.filter(review_sheet_query(row.workspace, request.user), workspace=row.workspace).distinct().select_related("reviewer").prefetch_related("entries", "events").order_by("-week_start", "user_name")
        return Response([sheet_data(s, request.user) for s in sheets])


class TimesheetDetailEndpoint(BaseAPIView):
    def get(self, request, slug, sheet_id, action=None):
        row = member(request.user, slug)
        sheet = get_object_or_404(Timesheet, id=sheet_id, workspace=row.workspace)
        authorize_read(sheet, request.user)
        if action != "export":
            return Response(sheet_data(sheet, request.user))
        # Lock while taking the export snapshot so its totals and status agree.
        with transaction.atomic():
            sheet = Timesheet.objects.select_for_update(of=("self",)).select_related("reviewer").get(id=sheet.id)
            data = sheet_data(sheet, request.user)
        book = Workbook()
        summary = book.active
        summary.title = "Weekly Timesheet"
        for values in [["Member", data["user_name"]], ["Week starting", data["week_start"]], ["Time zone", data["timezone"]],
            ["Status", data["status"]], ["Reviewer", data["reviewer_name"] or ""], ["Version", data["version"]],
            ["Total (minutes)", data["total_minutes"]], ["Total (hours)", data["total_minutes"] / 60]]:
            summary.append(sanitize_csv_row(values))
        details = book.create_sheet("Entries")
        details.append(["Date", "Project", "Work item ID", "Work item", "Activity", "Minutes", "Hours", "Note"])
        for e in data["entries"]:
            details.append(sanitize_csv_row([e["work_date"], e["project_name"], e["issue_code"], e["issue_name"], e["activity"], e["duration_minutes"], e["duration_minutes"] / 60, e["note"]]))
        details.append(["Total", "", "", "", "", data["total_minutes"], data["total_minutes"] / 60])
        approvals = book.create_sheet("Project approvals")
        approvals.append(["Project", "Project Lead", "Status", "Reason", "Reviewed at"])
        for review in data["project_reviews"]:
            approvals.append(sanitize_csv_row([review["project_name"], review.get("reviewer_name") or "", review["status"], review.get("reason", ""), review.get("reviewed_at") or ""]))
        history = book.create_sheet("History")
        history.append(["Time", "Actor", "Action", "Version", "Reason"])
        for event in data["events"]:
            history.append(sanitize_csv_row([event["created_at"].isoformat(), event["actor"], event["action"], event["version"], event["reason"]]))
        for tab in book:
            tab.freeze_panes = "A2"
            for cell in tab[1]:
                cell.font = Font(bold=True, color="FFFFFF")
                cell.fill = PatternFill("solid", fgColor="2563EB")
            for column in tab.columns:
                tab.column_dimensions[column[0].column_letter].width = min(60, max(16, max(len(str(c.value or "")) for c in column) + 3))
            for cells in tab:
                for cell in cells:
                    cell.alignment = Alignment(vertical="top", wrap_text=True)
            tab.auto_filter.ref = tab.dimensions
        for row_number in range(2, details.max_row + 1):
            details.cell(row_number, 7).number_format = "0.00"
        stream = BytesIO()
        book.save(stream)
        response = HttpResponse(stream.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        response["Content-Disposition"] = f'attachment; filename="timesheet-{sheet.week_start}-v{sheet.version}.xlsx"'
        return response

    @transaction.atomic
    def post(self, request, slug, sheet_id, action=None, entry_id=None):
        row = member(request.user, slug, write=True)
        sheet = get_object_or_404(Timesheet.objects.select_for_update(), id=sheet_id, workspace=row.workspace)
        authorize_read(sheet, request.user)
        version = serializers.IntegerField(min_value=0).run_validation(request.data.get("version"))
        if version != sheet.version:
            raise Conflict()
        if action in ("approve", "return"):
            project_id = str(serializers.UUIDField().run_validation(request.data.get("project_id")))
            if project_id not in lead_project_ids(sheet, request.user):
                raise PermissionDenied()
            review = sheet.project_reviews.get(project_id)
            if sheet.status != "submitted" or not review or review["status"] != "submitted":
                raise ValidationError("This project is not awaiting review.")
            reason = serializers.CharField(max_length=2000, allow_blank=action == "approve").run_validation(request.data.get("reason", ""))
            review.update(status="approved" if action == "approve" else "returned", reason=reason,
                reviewer_id=str(request.user.id), reviewer_name=request.user.display_name, reviewed_at=timezone.now().isoformat())
            statuses = {r["status"] for r in sheet.project_reviews.values()}
            sheet.status = "returned" if "returned" in statuses else "approved" if statuses == {"approved"} else "submitted"
            sheet.approved_at = timezone.now() if sheet.status == "approved" else None
            record(sheet, request.user, action, reason, {"project_id": project_id, "entries": [entry_data(e) for e in sheet.entries.filter(project_id=project_id)]})
            return Response(sheet_data(sheet, request.user))
        if sheet.user_id != request.user.id:
            raise PermissionDenied()
        if action == "withdraw" and sheet.status == "submitted":
            sheet.status = "draft"
            sheet.project_reviews = {}
            sheet.reviewer = None
            sheet.approved_at = None
            record(sheet, request.user, "withdraw")
            return Response(sheet_data(sheet, request.user))
        if sheet.status not in ("draft", "returned"):
            raise ValidationError("This timesheet is locked. Withdraw it or ask the lead to return it before editing.")
        if action == "submit":
            sheet.project_reviews = submission_reviews(sheet)
            sheet.reviewer = None
            sheet.status = "submitted"
            sheet.submitted_at = timezone.now()
            sheet.approved_at = None
            record(sheet, request.user, "submit", snapshot={"project_reviews": sheet.project_reviews, "entries": [entry_data(e) for e in sheet.entries.all()]})
        elif action in ("entries", "update-entry"):
            serializer = EntryInput(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            if not sheet.week_start <= data["work_date"] <= sheet.week_start + timedelta(days=6):
                raise ValidationError("The work date must be within the selected week.")
            project = get_object_or_404(Project, id=data["project_id"], workspace=row.workspace, is_wiki_collection=False, archived_at__isnull=True,
                project_projectmember__member=request.user, project_projectmember__is_active=True)
            issue = None
            if data.get("issue_id"):
                issue = get_object_or_404(Issue, id=data["issue_id"], project=project, is_draft=False)
            entry = get_object_or_404(TimeEntry, id=entry_id, timesheet=sheet) if action == "update-entry" else None
            total = sheet.entries.filter(work_date=data["work_date"]).exclude(id=entry.id if entry else None).aggregate(total=Sum("duration_minutes"))["total"] or 0
            if total + data["duration_minutes"] > 1440:
                raise ValidationError("Total time per day cannot exceed 24 hours.")
            before = entry_data(entry) if entry else None
            values = {"work_date": data["work_date"], "project": project, "issue": issue,
                "project_name": project.name, "project_code": project.identifier, "issue_name": issue.name if issue else "",
                "issue_code": f"{project.identifier}-{issue.sequence_id}" if issue else "", "activity": data["activity"],
                "duration_minutes": data["duration_minutes"], "note": data["note"]}
            if entry:
                for key, value in values.items():
                    setattr(entry, key, value)
                entry.save()
            else:
                entry = TimeEntry.objects.create(timesheet=sheet, **values)
            record(sheet, request.user, "update-entry" if before else "add-entry", snapshot={"before": before, "after": entry_data(entry)})
        elif action == "delete-entry":
            entry = get_object_or_404(TimeEntry, id=entry_id, timesheet=sheet)
            before = entry_data(entry)
            entry.delete()
            record(sheet, request.user, "delete-entry", snapshot={"before": before})
        else:
            raise ValidationError("Unknown action")
        return Response(sheet_data(sheet, request.user))
