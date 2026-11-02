"""Workspace-scoped Wiki templates. Stored content is copied into new pages, never linked."""
import re
import uuid
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.html import strip_tags
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.app.views.wiki import workspace_role
from plane.app.views.timesheet import Conflict
from plane.db.models import WikiTemplate, Workspace
from plane.utils.content_validator import validate_html_content


def template_html(key, workspace_id, lock=False):
    query = WikiTemplate.objects.select_for_update() if lock else WikiTemplate.objects
    row = query.filter(workspace_id=workspace_id, key=key, is_active=True).first()
    if row is None:
        raise ValidationError({"wiki_template": "This Wiki template is unavailable or inactive. Select another template."})
    return row.content_html


def template_data(row, manage=False):
    data = {"id": str(row.id), "key": str(row.key), "name": row.name, "description": row.description,
        "headings": [strip_tags(value) for value in re.findall(r"<h[1-6][^>]*>(.*?)</h[1-6]>", row.content_html, re.I | re.S)][:30]}
    if manage:
        data.update(content_html=row.content_html, is_active=row.is_active, version=str(row.version), updated_at=row.updated_at)
    return data


class TemplateInput(serializers.Serializer):
    name = serializers.CharField(max_length=80, trim_whitespace=True)
    description = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")
    content_html = serializers.CharField(max_length=1000000, allow_blank=True, required=False, default="<p></p>")
    is_active = serializers.BooleanField(required=False, default=True)
    version = serializers.UUIDField(required=False)

    def validate_content_html(self, value):
        valid, error, sanitized = validate_html_content(value or "<p></p>")
        if not valid:
            raise serializers.ValidationError(error)
        return sanitized if sanitized is not None else value or "<p></p>"


def require_admin(request, slug):
    if workspace_role(request.user, slug) != 20:
        raise PermissionDenied()


def check_version(request, row):
    version = serializers.UUIDField().run_validation(request.data.get("version"))
    if version != row.version:
        raise Conflict("This template changed. Reload it before continuing.")


class WikiTemplatesEndpoint(BaseAPIView):
    def get(self, request, slug):
        workspace_role(request.user, slug)
        manage = request.query_params.get("manage") == "1"
        if manage:
            require_admin(request, slug)
        rows = WikiTemplate.objects.filter(workspace__slug=slug).order_by("name", "id")
        if not manage:
            rows = rows.filter(is_active=True)
        return Response([template_data(row, manage) for row in rows])

    @transaction.atomic
    def post(self, request, slug):
        require_admin(request, slug)
        serializer = TemplateInput(data=request.data); serializer.is_valid(raise_exception=True)
        data = serializer.validated_data; data.pop("version", None)
        row = WikiTemplate.objects.create(workspace=get_object_or_404(Workspace, slug=slug), **data)
        return Response(template_data(row, True), status=201)


class WikiTemplateDetailEndpoint(BaseAPIView):
    def resolve(self, request, slug, template_id, lock=False):
        require_admin(request, slug)
        query = WikiTemplate.objects.select_for_update() if lock else WikiTemplate.objects
        return get_object_or_404(query, workspace__slug=slug, id=template_id)

    def get(self, request, slug, template_id):
        return Response(template_data(self.resolve(request, slug, template_id), True))

    @transaction.atomic
    def patch(self, request, slug, template_id):
        row = self.resolve(request, slug, template_id, True)
        check_version(request, row)
        serializer = TemplateInput(data=request.data, partial=True); serializer.is_valid(raise_exception=True)
        data = serializer.validated_data; data.pop("version", None)
        for key, value in data.items():
            setattr(row, key, value)
        row.version = uuid.uuid4()
        row.save()
        return Response(template_data(row, True))

    @transaction.atomic
    def post(self, request, slug, template_id):
        row = self.resolve(request, slug, template_id, True)
        check_version(request, row)
        clone = WikiTemplate.objects.create(workspace=row.workspace, name=(row.name[:73] + " (copy)"),
            description=row.description, content_html=row.content_html, is_active=False)
        return Response(template_data(clone, True), status=201)

    @transaction.atomic
    def delete(self, request, slug, template_id):
        row = self.resolve(request, slug, template_id, True)
        check_version(request, row)
        # Keep the native soft-delete convention. Pages have no relationship to templates.
        row.delete()
        return Response(status=204)
