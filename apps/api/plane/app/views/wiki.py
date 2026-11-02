"""Workspace-wide collections backed by Plane's existing Pages permission container."""
import uuid

from django.db import transaction, IntegrityError
from django.db.models import Q, Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace, WorkspaceMember, Project, ProjectMember, ProjectIdentifier, State, Page
from plane.db.models.state import DEFAULT_STATES


class CollectionInput(serializers.Serializer):
    name = serializers.CharField(max_length=80, trim_whitespace=True)


def workspace_role(user, slug):
    member = WorkspaceMember.objects.filter(workspace__slug=slug, member=user, is_active=True).first()
    if not member:
        raise PermissionDenied()
    return member.role


def collection_data(project):
    return {"id": str(project.id), "name": project.name, "created_at": project.created_at, "updated_at": project.updated_at}


class WikiCollectionsEndpoint(BaseAPIView):
    def get(self, request, slug, project_id=None):
        role = workspace_role(request.user, slug)
        projects = Project.objects.filter(workspace__slug=slug, is_wiki_collection=True, archived_at__isnull=True).order_by("name")
        if project_id:
            projects = projects.filter(id=project_id)
            if not projects.exists():
                get_object_or_404(projects)
        # Join through the normal model so all editor and asset permissions remain in force.
        for project in projects:
            ProjectMember.objects.update_or_create(project=project, member=request.user, defaults={"role": role, "is_active": True})
        return Response([collection_data(project) for project in projects])

    def post(self, request, slug):
        role = workspace_role(request.user, slug)
        if role < 15:
            raise PermissionDenied()
        data = CollectionInput(data=request.data)
        data.is_valid(raise_exception=True)
        workspace = get_object_or_404(Workspace, slug=slug)
        try:
            with transaction.atomic():
                project = Project.objects.create(workspace=workspace, name=data.validated_data["name"],
                    identifier="WK" + uuid.uuid4().hex[:10].upper(), is_wiki_collection=True,
                    network=0, page_view=True, project_lead=request.user)
                ProjectIdentifier.objects.create(name=project.identifier, project=project, workspace=workspace)
                for member in WorkspaceMember.objects.filter(workspace=workspace, is_active=True):
                    ProjectMember.objects.create(project=project, member=member.member, role=member.role)
                State.objects.bulk_create([State(project=project, workspace=workspace, **state) for state in DEFAULT_STATES])
        except IntegrityError:
            return Response({"error": "A collection or project with this name already exists."}, status=400)
        return Response(collection_data(project), status=201)

    def patch(self, request, slug, project_id):
        if workspace_role(request.user, slug) < 15:
            raise PermissionDenied()
        data = CollectionInput(data=request.data)
        data.is_valid(raise_exception=True)
        project = get_object_or_404(Project, id=project_id, workspace__slug=slug, is_wiki_collection=True)
        try:
            with transaction.atomic():
                project.name = data.validated_data["name"]
                project.save(update_fields=["name", "updated_at"])
        except IntegrityError:
            return Response({"error": "A collection or project with this name already exists."}, status=400)
        return Response(collection_data(project))


def wiki_page_scope(user, slug, include_content=False):
    """Use the same visibility rules for navigation and content search."""
    role = workspace_role(user, slug)
    query = Page.objects.filter(workspace__slug=slug, projects__is_wiki_collection=True,
        projects__archived_at__isnull=True, projects__deleted_at__isnull=True, project_pages__deleted_at__isnull=True, archived_at__isnull=True)
    deferred = ["description_binary", "description_json", "description_stripped"]
    if not include_content:
        deferred.append("description_html")
    nodes = list(query.defer(*deferred).select_related("owned_by").prefetch_related(
        Prefetch("projects", queryset=Project.objects.filter(is_wiki_collection=True), to_attr="wiki_collections")
    ).order_by("sort_order", "created_at", "id").distinct())
    page_map = {page.id: page for page in nodes}
    def visible(page):
        if not page.wiki_collections:
            return False
        seen = set()
        collection_id = page.wiki_collections[0].id
        while page:
            if page.id in seen or page.archived_at or (page.access == Page.PRIVATE_ACCESS and page.owned_by_id != user.id):
                return False
            if not any(project.id == collection_id for project in page.wiki_collections):
                return False
            seen.add(page.id)
            if page.parent_id and page.parent_id not in page_map:
                return False
            page = page_map.get(page.parent_id)
        return True
    return role, nodes, [page for page in nodes if visible(page)]


def wiki_tree_revisions(nodes):
    groups = {}
    for page in nodes:
        for project in page.wiki_collections:
            groups.setdefault(project.id, []).append(page)
    return {project_id: tree_revision(group) for project_id, group in groups.items()}


def wiki_document_data(page, role, today, revisions):
    from plane.app.views.wiki_review import review_data
    collection = page.wiki_collections[0]
    return {"id": str(page.id), "name": page.name, "collection_id": str(collection.id),
        "parent_id": str(page.parent_id) if page.parent_id else None, "sort_order": page.sort_order,
        "can_move": role >= 15 and not page.is_locked, "tree_revision": revisions[collection.id],
        "updated_at": page.updated_at, "owner": page.owned_by.display_name, "access": page.access,
        "review": review_data(page, today)}


class WikiPagesEndpoint(BaseAPIView):
    def get(self, request, slug):
        from plane.app.views.wiki_review import workspace_today
        role, nodes, visible = wiki_page_scope(request.user, slug, include_content=True)
        today = workspace_today(get_object_or_404(Workspace, slug=slug))
        revisions = wiki_tree_revisions(nodes)
        query = request.query_params.get("search", "").strip()[:200].lower()
        return Response([wiki_document_data(page, role, today, revisions)
            for page in visible if not query or query in page.name.lower()])


def collection_tree(project_id):
    return list(Page.objects.filter(projects__id=project_id, project_pages__deleted_at__isnull=True,
        archived_at__isnull=True).order_by("sort_order", "created_at", "id").distinct())


def tree_revision(nodes):
    import hashlib
    import json
    return hashlib.sha256(json.dumps(sorted((str(p.id), str(p.parent_id), p.sort_order, p.access,
        str(p.owned_by_id), p.is_locked) for p in nodes)).encode()).hexdigest()


def can_read_tree_page(page, page_map, user):
    seen = set()
    while page:
        if page.id in seen or page.archived_at or (page.access == Page.PRIVATE_ACCESS and page.owned_by_id != user.id):
            return False
        seen.add(page.id)
        if page.parent_id and page.parent_id not in page_map:
            return False
        page = page_map.get(page.parent_id)
    return True


class WikiMoveInput(serializers.Serializer):
    target_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    position = serializers.ChoiceField(choices=("before", "after", "inside", "root"))
    revision = serializers.CharField(max_length=64)


class WikiPageMoveEndpoint(BaseAPIView):
    @transaction.atomic
    def post(self, request, slug, project_id, page_id):
        from plane.app.serializers.page import PageSerializer
        if workspace_role(request.user, slug) < 15:
            raise PermissionDenied()
        project = get_object_or_404(Project.objects.select_for_update(), id=project_id,
            workspace__slug=slug, is_wiki_collection=True, archived_at__isnull=True)
        data = WikiMoveInput(data=request.data)
        data.is_valid(raise_exception=True)
        payload = data.validated_data
        nodes = collection_tree(project.id)
        if payload["revision"] != tree_revision(nodes):
            return Response({"detail": "The wiki structure has changed. Reload it and try again."}, status=409)
        page_map = {p.id: p for p in nodes}
        source = get_object_or_404(Page, id=page_id, workspace=project.workspace)
        if source.id not in page_map or not can_read_tree_page(source, page_map, request.user):
            raise PermissionDenied()
        if source.is_locked:
            raise serializers.ValidationError("Unlock the page before moving it.")
        target = page_map.get(payload["target_id"])
        position = payload["position"]
        if position != "root" and (not target or not can_read_tree_page(target, page_map, request.user)):
            raise PermissionDenied()
        if target and target.id == source.id:
            raise serializers.ValidationError("A page cannot be dropped onto itself.")
        parent = None if position == "root" else target if position == "inside" else page_map.get(target.parent_id)
        if position == "inside" and target.is_locked:
            raise serializers.ValidationError("Unlock the parent page before adding children.")
        validator = PageSerializer(source, data={"parent": str(parent.id) if parent else None}, partial=True,
            context={"request": request, "project_id": project.id})
        validator.is_valid(raise_exception=True)
        # Do not silently change the visibility of a public page or its subtree.
        ancestor = parent
        while ancestor:
            if ancestor.access == Page.PRIVATE_ACCESS and source.access != Page.PRIVATE_ACCESS:
                raise serializers.ValidationError("Change the page visibility before moving it under a private page.")
            ancestor = page_map.get(ancestor.parent_id)
        siblings = [p for p in nodes if p.parent_id == (parent.id if parent else None) and p.id != source.id]
        index = len(siblings)
        if position in ("before", "after"):
            index = next(i for i, p in enumerate(siblings) if p.id == target.id) + (position == "after")
        siblings.insert(index, source)
        source.parent = parent
        for index, page in enumerate(siblings):
            page.sort_order = (index + 1) * 1024
        source.save(update_fields=["parent", "sort_order", "updated_at", "updated_by"])
        Page.objects.bulk_update([p for p in siblings if p.id != source.id], ["sort_order"])
        return Response({"id": str(source.id), "parent_id": str(source.parent_id) if source.parent_id else None,
            "sort_order": source.sort_order, "revision": tree_revision(collection_tree(project.id))})
