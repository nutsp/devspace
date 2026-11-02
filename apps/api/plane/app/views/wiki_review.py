"""Wiki document templates and scheduled reviews, using the existing page permission boundary."""
import hashlib
import json
import uuid
from datetime import timedelta
from zoneinfo import ZoneInfo
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from plane.app.permissions.page import ProjectPagePermission
from plane.app.views.base import BaseAPIView
from plane.app.views.wiki import workspace_role, collection_tree, can_read_tree_page
from plane.app.views.timesheet import Conflict
from plane.db.models import Page, Project, Workspace, WorkspaceMember


def content_hash(page):
    return hashlib.sha256((page.description_html or "").encode()).hexdigest()


def workspace_today(workspace):
    return timezone.now().astimezone(ZoneInfo(workspace.timezone)).date()


def review_data(page, today):
    data = page.wiki_review or {}
    due = data.get("due_date")
    changed = bool(data.get("content_hash") and data["content_hash"] != content_hash(page))
    if not data.get("owner_id"):
        status = "unassigned"
    elif not due:
        status = "unscheduled"
    elif due < today.isoformat():
        status = "overdue"
    elif changed:
        status = "changed"
    elif due <= (today + timedelta(days=7)).isoformat():
        status = "due_soon"
    elif data.get("reviewed_at"):
        status = "reviewed"
    else:
        status = "scheduled"
    return {"owner_id": data.get("owner_id"), "owner_name": data.get("owner_name"), "due_date": due,
        "interval_days": data.get("interval_days", 90), "reviewed_at": data.get("reviewed_at"),
        "reviewed_by": data.get("reviewed_by"), "reviewed_by_name": data.get("reviewed_by_name"),
        "revision": data.get("revision", "0"), "content_hash": content_hash(page), "status": status,
        "changed_since_review": changed}


class ReviewInput(serializers.Serializer):
    revision = serializers.CharField(max_length=64)
    owner_id = serializers.UUIDField(allow_null=True)
    due_date = serializers.DateField(allow_null=True)
    interval_days = serializers.IntegerField(min_value=1, max_value=3650, default=90)


class CompleteInput(serializers.Serializer):
    revision = serializers.CharField(max_length=64)
    content_hash = serializers.CharField(max_length=64)
    next_due_date = serializers.DateField(required=False)


class WikiReviewEndpoint(BaseAPIView):
    permission_classes = [ProjectPagePermission]

    def resolve(self, request, slug, project_id, page_id, lock=False):
        role = workspace_role(request.user, slug)
        project = get_object_or_404(Project, id=project_id, workspace__slug=slug, is_wiki_collection=True, archived_at__isnull=True)
        query = Page.objects.select_for_update() if lock else Page.objects
        page = get_object_or_404(query, id=page_id, workspace=project.workspace,
            project_pages__project=project, project_pages__deleted_at__isnull=True, archived_at__isnull=True)
        nodes = {node.id: node for node in collection_tree(project.id)}
        if not can_read_tree_page(page, nodes, request.user):
            raise PermissionDenied()
        if request.method != "GET" and (role < 15 or page.is_locked):
            raise PermissionDenied()
        return page, project.workspace, role, nodes

    def response(self, page, workspace, role, request, nodes):
        eligible = [m for m in WorkspaceMember.objects.filter(workspace=workspace, is_active=True, role__gte=15).select_related("member")
            if can_read_tree_page(page, nodes, m.member)]
        data = review_data(page, workspace_today(workspace))
        return Response({**data, "today": workspace_today(workspace).isoformat(), "can_manage": role >= 15 and not page.is_locked,
            "can_complete": role >= 15 and not page.is_locked and bool(data["owner_id"]) and (data["owner_id"] == str(request.user.id) or role >= 20),
            "members": [{"id": str(m.member_id), "name": m.member.display_name} for m in eligible]})

    def get(self, request, slug, project_id, page_id):
        page, workspace, role, nodes = self.resolve(request, slug, project_id, page_id)
        return self.response(page, workspace, role, request, nodes)

    @transaction.atomic
    def patch(self, request, slug, project_id, page_id):
        page, workspace, role, nodes = self.resolve(request, slug, project_id, page_id, lock=True)
        serializer = ReviewInput(data=request.data); serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["revision"] != (page.wiki_review or {}).get("revision", "0"):
            raise Conflict("Review settings changed. Reopen the dialog before saving.")
        owner = None
        if data["owner_id"]:
            membership = get_object_or_404(WorkspaceMember, workspace=workspace, member_id=data["owner_id"], is_active=True, role__gte=15)
            owner = membership.member
            if not can_read_tree_page(page, nodes, owner):
                raise ValidationError("The document owner must have access to this page and its parents.")
        if data["due_date"] and not owner:
            raise ValidationError("Select a document owner before setting a review date.")
        page.wiki_review = {**(page.wiki_review or {}), "owner_id": str(owner.id) if owner else None,
            "owner_name": owner.display_name if owner else None, "due_date": data["due_date"].isoformat() if data["due_date"] else None,
            "interval_days": data["interval_days"], "revision": str(uuid.uuid4())}
        page.save(update_fields=["wiki_review", "updated_at"])
        return self.response(page, workspace, role, request, nodes)

    @transaction.atomic
    def post(self, request, slug, project_id, page_id):
        page, workspace, role, nodes = self.resolve(request, slug, project_id, page_id, lock=True)
        serializer = CompleteInput(data=request.data); serializer.is_valid(raise_exception=True)
        data = serializer.validated_data; current = page.wiki_review or {}
        if not current.get("owner_id") or (current["owner_id"] != str(request.user.id) and role < 20):
            raise PermissionDenied()
        if data["revision"] != current.get("revision", "0") or data["content_hash"] != content_hash(page):
            raise Conflict("The document or its review settings changed. Reopen the dialog and review the saved content again.")
        today = workspace_today(workspace)
        due = data.get("next_due_date", today + timedelta(days=current.get("interval_days", 90)))
        if due <= today:
            raise ValidationError("The next review date must be after today.")
        page.wiki_review = {**current, "due_date": due.isoformat(), "reviewed_at": timezone.now().isoformat(),
            "reviewed_by": str(request.user.id), "reviewed_by_name": request.user.display_name,
            "content_hash": content_hash(page), "revision": str(uuid.uuid4())}
        page.save(update_fields=["wiki_review", "updated_at"])
        return self.response(page, workspace, role, request, nodes)
