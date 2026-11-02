"""Read and manage milestones using Plane's existing project roles and guest scope."""
from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import F, Q, Prefetch, Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.app.permissions import ProjectEntityPermission
from plane.db.models import Project, ProjectMember, WorkspaceMember, Workspace, Issue, IssueAssignee, Milestone, MilestoneIssue
from plane.db.models.milestone import milestone_activity


class MilestoneInput(serializers.Serializer):
    name = serializers.CharField(max_length=255, trim_whitespace=True)
    description = serializers.CharField(max_length=20000, allow_blank=True, required=False, default="")
    target_date = serializers.DateField(allow_null=True, required=False, default=None)


class IssueFilter(serializers.Serializer):
    search = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")
    milestone = serializers.CharField(required=False, default="all")
    work_status = serializers.ChoiceField(choices=["all", "pending", "overdue", "late", "unassigned"], required=False, default="all")
    issue_id = serializers.UUIDField(required=False)
    page = serializers.IntegerField(min_value=1, required=False, default=1)
    per_page = serializers.IntegerField(min_value=1, max_value=100, required=False, default=50)


class LinkInput(serializers.Serializer):
    issue_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=200)


class AssignmentInput(serializers.Serializer):
    milestone_id = serializers.UUIDField(allow_null=True)


class MilestoneBase(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def context(self, request, slug, project_id, write=False):
        project = get_object_or_404(Project.objects.select_related("workspace"), id=project_id, workspace__slug=slug, is_wiki_collection=False)
        if not WorkspaceMember.objects.filter(workspace=project.workspace, member=request.user, is_active=True).exists():
            raise PermissionDenied()
        member = get_object_or_404(ProjectMember, project=project, member=request.user, is_active=True)
        can_write = member.role >= 15
        if write and (not can_write or project.archived_at):
            raise PermissionDenied()
        limited = member.role == 5 and not project.guest_view_all_features
        issues = Issue.issue_objects.filter(project=project, state__deleted_at__isnull=True)
        if limited:
            issues = issues.filter(created_by=request.user)
        return project, issues, can_write and not project.archived_at, limited

    def milestone(self, project, pk):
        return get_object_or_404(Milestone, id=pk, project=project)


def summary(row, issues, today, window_days=7):
    linked = [i for i in issues if any(a.milestone_id == row.id for a in i.visible_milestone_assignments)]
    completed = sum(getattr(i.state, "group", "backlog") == "completed" for i in linked)
    cancelled = sum(getattr(i.state, "group", "backlog") == "cancelled" for i in linked)
    active = len(linked) - cancelled
    pending = active - completed
    pending_items = [i for i in linked if getattr(i.state, "group", "backlog") not in ("completed", "cancelled")]
    days_remaining = (row.target_date - today).days if row.target_date else None
    overdue_work_items = sum(bool(i.target_date and i.target_date < today) for i in pending_items)
    late_pending_work_items = sum(bool(row.target_date and i.target_date and i.target_date > row.target_date) for i in pending_items)
    due_soon = bool(pending and days_remaining is not None and 0 <= days_remaining <= window_days)
    overdue = bool(pending and days_remaining is not None and days_remaining < 0)
    risk_status = ("overdue" if overdue else "at_risk" if pending and (late_pending_work_items or overdue_work_items)
        else "due_soon" if due_soon else "no_target" if pending and not row.target_date
        else "completed" if active and not pending else "empty" if not active else "on_track")
    return {"id": str(row.id), "name": row.name, "description": row.description,
        "target_date": row.target_date, "updated_at": row.updated_at, "total": len(linked),
        "completed": completed, "cancelled": cancelled, "pending": pending,
        "progress": round(completed * 100 / active) if active else 0,
        "overdue": overdue, "due_soon": due_soon, "days_remaining": days_remaining,
        "risk_status": risk_status, "at_risk": bool(overdue or due_soon or late_pending_work_items or overdue_work_items),
        "late_pending_work_items": late_pending_work_items, "overdue_work_items": overdue_work_items,
        "unassigned_work_items": sum(not i.has_assignee for i in pending_items),
        "undated_work_items": sum(i.target_date is None for i in pending_items),
        "late_work_items": sum(bool(row.target_date and i.target_date and i.target_date > row.target_date) for i in linked)}


def with_assignments(issues):
    return issues.annotate(has_assignee=Exists(IssueAssignee.objects.filter(issue_id=OuterRef("id"), assignee__is_active=True))).select_related("state").only("id", "name", "sequence_id", "state_id", "state__name", "state__group", "target_date", "project_id").prefetch_related(Prefetch("milestone_assignments", queryset=MilestoneIssue.objects.filter(milestone__deleted_at__isnull=True, project_id=F("issue__project_id")), to_attr="visible_milestone_assignments"))


class MilestonesEndpoint(MilestoneBase):
    def get(self, request, slug, project_id, pk=None):
        project, issues, can_write, limited = self.context(request, slug, project_id)
        rows = Milestone.objects.filter(project=project).order_by(F("target_date").asc(nulls_last=True), "name", "id")
        if pk:
            rows = [self.milestone(project, pk)]
        items = list(with_assignments(issues))
        today = timezone.localdate(timezone=ZoneInfo(project.workspace.timezone))
        return Response({"results": [summary(row, items, today) for row in rows], "can_write": can_write,
            "visibility_limited": limited, "timezone": project.workspace.timezone, "project_name": project.name})

    @transaction.atomic
    def post(self, request, slug, project_id):
        project, _, _, _ = self.context(request, slug, project_id, True)
        Project.objects.select_for_update().get(id=project.id)
        data = MilestoneInput(data=request.data)
        data.is_valid(raise_exception=True)
        if Milestone.objects.filter(project=project, name__iexact=data.validated_data["name"]).exists():
            raise ValidationError({"name": "A milestone with this name already exists in the project."})
        row = Milestone.objects.create(project=project, **data.validated_data)
        return Response({"id": str(row.id)}, status=201)

    @transaction.atomic
    def patch(self, request, slug, project_id, pk):
        project, _, _, _ = self.context(request, slug, project_id, True)
        Project.objects.select_for_update().get(id=project.id)
        row = self.milestone(project, pk)
        data = MilestoneInput(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        name = data.validated_data.get("name", row.name)
        if Milestone.objects.filter(project=project, name__iexact=name).exclude(id=row.id).exists():
            raise ValidationError({"name": "A milestone with this name already exists in the project."})
        for key, value in data.validated_data.items():
            setattr(row, key, value)
        row.save()
        return Response({"id": str(row.id)})

    @transaction.atomic
    def delete(self, request, slug, project_id, pk):
        project, _, _, _ = self.context(request, slug, project_id, True)
        Project.objects.select_for_update().get(id=project.id)
        row = self.milestone(project, pk)
        for assignment in MilestoneIssue.objects.filter(milestone=row).select_related("issue"):
            milestone_activity(assignment.issue, row.name, None, request.user)
            assignment.delete()
        row.delete()
        return Response(status=204)


class MilestoneWorkItemsEndpoint(MilestoneBase):
    def get(self, request, slug, project_id):
        project, issues, _, limited = self.context(request, slug, project_id)
        data = IssueFilter(data=request.query_params)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        valid_links = MilestoneIssue.objects.filter(project=project, milestone__deleted_at__isnull=True)
        if values["milestone"] == "none":
            issues = issues.exclude(id__in=valid_links.values("issue_id"))
        elif values["milestone"] != "all":
            field = serializers.UUIDField()
            milestone_id = field.run_validation(values["milestone"])
            self.milestone(project, milestone_id)
            issues = issues.filter(id__in=valid_links.filter(milestone_id=milestone_id).values("issue_id"))
        if values.get("issue_id"):
            issues = issues.filter(id=values["issue_id"])
        if values["search"]:
            query = values["search"]
            issues = issues.filter(Q(name__icontains=query) | Q(sequence_id=int(query)) if query.isdigit() else Q(name__icontains=query))
        pending = ~Q(state__group__in=["completed", "cancelled"])
        if values["work_status"] != "all":
            issues = issues.filter(pending)
            today = timezone.localdate(timezone=ZoneInfo(project.workspace.timezone))
            if values["work_status"] == "overdue":
                issues = issues.filter(target_date__lt=today)
            elif values["work_status"] == "late":
                issues = issues.filter(id__in=valid_links.filter(milestone__target_date__isnull=False,
                    issue__target_date__gt=F("milestone__target_date")).values("issue_id"))
            elif values["work_status"] == "unassigned":
                issues = issues.filter(~Exists(IssueAssignee.objects.filter(issue_id=OuterRef("id"), assignee__is_active=True)))
        total = issues.count()
        start = (values["page"] - 1) * values["per_page"]
        items = with_assignments(issues).order_by("sequence_id", "id")[start:start + values["per_page"]]
        ids = [a.milestone_id for item in items for a in item.visible_milestone_assignments]
        milestones = {m.id: m for m in Milestone.objects.filter(id__in=ids)}
        results = []
        for issue in items:
            milestone = milestones.get(issue.visible_milestone_assignments[0].milestone_id) if issue.visible_milestone_assignments else None
            results.append({"id": str(issue.id), "name": issue.name, "code": f"{project.identifier}-{issue.sequence_id}",
                "state": issue.state.name if issue.state else "No state", "state_group": getattr(issue.state, "group", "backlog"), "target_date": issue.target_date,
                "milestone_id": str(milestone.id) if milestone else None,
                "milestone_name": milestone.name if milestone else None,
                "has_assignee": issue.has_assignee,
                "late": bool(milestone and milestone.target_date and issue.target_date and issue.target_date > milestone.target_date)})
        return Response({"results": results, "total": total, "next_page": values["page"] + 1 if start + len(results) < total else None, "visibility_limited": limited})

    @transaction.atomic
    def post(self, request, slug, project_id, pk):
        project, issues, _, _ = self.context(request, slug, project_id, True)
        Project.objects.select_for_update().get(id=project.id)
        row = self.milestone(project, pk)
        data = LinkInput(data=request.data)
        data.is_valid(raise_exception=True)
        ids = set(data.validated_data["issue_ids"])
        selected = list(issues.select_for_update(of=("self",)).filter(id__in=ids))
        if len(selected) != len(ids):
            raise ValidationError("Select active work items from this project only.")
        if MilestoneIssue.objects.filter(issue_id__in=ids).exclude(milestone=row).exists():
            return Response({"detail": "A work item already belongs to another milestone. Reload and select again."}, status=409)
        for issue in selected:
            link, created = MilestoneIssue.objects.get_or_create(issue=issue, defaults={"project": project, "milestone": row})
            if created:
                milestone_activity(issue, None, row.name, request.user)
        return Response({"linked": len(selected)})


class MilestoneAssignmentEndpoint(MilestoneBase):
    @transaction.atomic
    def post(self, request, slug, project_id, issue_id):
        project, issues, _, _ = self.context(request, slug, project_id, True)
        Project.objects.select_for_update().get(id=project.id)
        issue = get_object_or_404(issues.select_for_update(of=("self",)), id=issue_id)
        data = AssignmentInput(data=request.data)
        data.is_valid(raise_exception=True)
        pk = data.validated_data["milestone_id"]
        row = self.milestone(project, pk) if pk else None
        current = MilestoneIssue.objects.filter(issue=issue).select_related("milestone").first()
        old = current.milestone.name if current else None
        if current and row and current.milestone_id == row.id:
            return Response({"milestone_id": str(row.id)})
        if current:
            current.delete()
        if row:
            MilestoneIssue.objects.create(project=project, milestone=row, issue=issue)
        milestone_activity(issue, old, row.name if row else None, request.user)
        return Response({"milestone_id": str(row.id) if row else None})


class PortfolioFilter(serializers.Serializer):
    project_id = serializers.UUIDField(required=False)
    search = serializers.CharField(max_length=200, allow_blank=True, required=False, default="")
    status = serializers.ChoiceField(choices=["risk", "overdue", "due_soon", "planning", "completed", "all"], required=False, default="risk")
    window_days = serializers.IntegerField(min_value=1, max_value=90, required=False, default=7)
    page = serializers.IntegerField(min_value=1, required=False, default=1)
    per_page = serializers.IntegerField(min_value=1, max_value=100, required=False, default=25)


class WorkspaceMilestonesEndpoint(BaseAPIView):
    def get(self, request, slug, project_scope_ids=None):
        workspace = get_object_or_404(Workspace, slug=slug)
        if not WorkspaceMember.objects.filter(workspace=workspace, member=request.user, is_active=True).exists():
            raise PermissionDenied()
        data = PortfolioFilter(data=request.query_params)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        memberships = list(ProjectMember.objects.filter(workspace=workspace, member=request.user,
            is_active=True, project__archived_at__isnull=True, project__is_wiki_collection=False).select_related("project").order_by("project__name"))
        if project_scope_ids is not None:
            memberships = [m for m in memberships if m.project_id in set(project_scope_ids)]
        project_map = {m.project_id: m.project for m in memberships}
        projects = [{"id": str(p.id), "name": p.name, "identifier": p.identifier} for p in project_map.values()]
        if values.get("project_id"):
            if values["project_id"] not in project_map:
                # Do not disclose whether an inaccessible project exists.
                return Response({"detail": "Project not found."}, status=404)
            memberships = [m for m in memberships if m.project_id == values["project_id"]]
        ids = [m.project_id for m in memberships]
        limited = {m.project_id for m in memberships if m.role == 5 and not m.project.guest_view_all_features}
        issues = Issue.issue_objects.filter(project_id__in=ids, state__deleted_at__isnull=True)
        if limited:
            issues = issues.filter(~Q(project_id__in=limited) | Q(created_by=request.user))
        by_milestone = {}
        for item in with_assignments(issues):
            for assignment in item.visible_milestone_assignments:
                by_milestone.setdefault(assignment.milestone_id, []).append(item)
        today = timezone.localdate(timezone=ZoneInfo(workspace.timezone))
        rows = Milestone.objects.filter(project_id__in=ids)
        if values["search"]:
            rows = rows.filter(Q(name__icontains=values["search"]) | Q(project__name__icontains=values["search"]) | Q(project__identifier__icontains=values["search"]))
        results = []
        for row in rows:
            result = summary(row, by_milestone.get(row.id, []), today, values["window_days"])
            result.update(project_id=str(row.project_id), project_name=project_map[row.project_id].name,
                project_code=project_map[row.project_id].identifier, visibility_limited=row.project_id in limited)
            choice = values["status"]
            if choice == "risk" and not result["at_risk"]:
                continue
            if choice == "overdue" and not result["overdue"]:
                continue
            if choice == "due_soon" and not result["due_soon"]:
                continue
            if choice == "completed" and result["risk_status"] != "completed":
                continue
            if choice == "planning" and not (result["unassigned_work_items"] or result["undated_work_items"] or (result["pending"] and not row.target_date)):
                continue
            results.append(result)
        priority = {"overdue": 0, "at_risk": 1, "due_soon": 2, "no_target": 3, "on_track": 4, "completed": 5, "empty": 6}
        results.sort(key=lambda r: (priority[r["risk_status"]], r["target_date"] or timezone.datetime.max.date(), r["project_name"], r["name"], r["id"]))
        total = len(results)
        start = (values["page"]-1)*values["per_page"]
        selected = results[start:start+values["per_page"]]
        return Response({"results": selected, "total": total,
            "next_page": values["page"]+1 if start+len(selected)<total else None,
            "projects": projects, "timezone": workspace.timezone, "today": today,
            "window_days": values["window_days"], "limited_project_count": len(limited)})
