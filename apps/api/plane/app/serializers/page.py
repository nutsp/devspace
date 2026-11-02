# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Third party imports
from rest_framework import serializers
import base64

# Module imports
from .base import BaseSerializer
from plane.utils.content_validator import (
    validate_binary_data,
    validate_html_content,
)
from plane.db.models import (
    Page,
    PageLabel,
    Label,
    ProjectPage,
    Project,
    PageVersion,
)


class PageSerializer(BaseSerializer):
    wiki_template = serializers.CharField(required=False, allow_blank=True, write_only=True)
    is_favorite = serializers.BooleanField(read_only=True)
    labels = serializers.ListField(
        child=serializers.PrimaryKeyRelatedField(queryset=Label.objects.all()),
        write_only=True,
        required=False,
    )
    # Many to many
    label_ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    project_ids = serializers.ListField(child=serializers.UUIDField(), required=False)

    class Meta:
        model = Page
        fields = [
            "wiki_template",
            "id",
            "name",
            "owned_by",
            "access",
            "color",
            "labels",
            "parent",
            "is_favorite",
            "is_locked",
            "archived_at",
            "workspace",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "view_props",
            "logo_props",
            "label_ids",
            "project_ids",
        ]
        read_only_fields = ["workspace", "owned_by"]

    def validate(self, attrs):
        template = attrs.get("wiki_template")
        if template:
            from plane.app.views.wiki_templates import template_html
            if self.instance or not Project.objects.filter(id=self.context.get("project_id"), is_wiki_collection=True).exists():
                raise serializers.ValidationError({"wiki_template": "Templates can only be selected when creating a new Wiki page."})
            template_html(template, Project.objects.get(id=self.context["project_id"]).workspace_id)
        parent = attrs.get("parent", self.instance.parent if self.instance else None)
        project_id = self.context.get("project_id")
        request = self.context.get("request")
        if parent is not None:
            if not project_id or not ProjectPage.objects.filter(page=parent, project_id=project_id, deleted_at__isnull=True).exists():
                raise serializers.ValidationError({"parent": "Parent must be in the same collection/project."})
            visited = {self.instance.id} if self.instance else set()
            node = parent
            while node:
                if node.id in visited:
                    raise serializers.ValidationError({"parent": "Pages cannot form a cycle."})
                visited.add(node.id)
                if node.archived_at or (node.access == Page.PRIVATE_ACCESS and (not request or node.owned_by_id != request.user.id)):
                    raise serializers.ValidationError({"parent": "Parent is unavailable or private."})
                node = node.parent
            access = attrs.get("access", self.instance.access if self.instance else Page.PUBLIC_ACCESS)
            if parent.access == Page.PRIVATE_ACCESS and access != Page.PRIVATE_ACCESS:
                raise serializers.ValidationError({"access": "A child of a private page must also be private."})
        if self.instance:
            attrs.pop("wiki_template", None)
        return attrs

    def create(self, validated_data):
        template = validated_data.pop("wiki_template", "")
        labels = validated_data.pop("labels", None)
        project_id = self.context["project_id"]
        owned_by_id = self.context["owned_by_id"]
        description_json = self.context["description_json"]
        description_binary = self.context["description_binary"]
        description_html = self.context["description_html"]

        if template:
            from plane.app.views.wiki_templates import template_html
            description_html = template_html(template, Project.objects.get(id=project_id).workspace_id, lock=True)
            description_json = {}
            description_binary = None

        # Get the workspace id from the project
        project = Project.objects.get(pk=project_id)

        # New wiki pages append after their siblings, including collections with many reordered pages.
        if project.is_wiki_collection:
            from django.db.models import Max
            maximum = Page.objects.filter(projects=project, parent=validated_data.get("parent")).aggregate(value=Max("sort_order"))["value"]
            validated_data["sort_order"] = (maximum or 0) + 1024

        # Create the page
        page = Page.objects.create(
            **validated_data,
            description_json=description_json,
            description_binary=description_binary,
            description_html=description_html,
            owned_by_id=owned_by_id,
            workspace_id=project.workspace_id,
        )

        # Create the project page
        ProjectPage.objects.create(
            workspace_id=page.workspace_id,
            project_id=project_id,
            page_id=page.id,
            created_by_id=page.created_by_id,
            updated_by_id=page.updated_by_id,
        )

        # Create page labels
        if labels is not None:
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=page,
                        workspace_id=page.workspace_id,
                        created_by_id=page.created_by_id,
                        updated_by_id=page.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )
        return page

    def update(self, instance, validated_data):
        labels = validated_data.pop("labels", None)
        if labels is not None:
            PageLabel.objects.filter(page=instance).delete()
            PageLabel.objects.bulk_create(
                [
                    PageLabel(
                        label=label,
                        page=instance,
                        workspace_id=instance.workspace_id,
                        created_by_id=instance.created_by_id,
                        updated_by_id=instance.updated_by_id,
                    )
                    for label in labels
                ],
                batch_size=10,
            )

        return super().update(instance, validated_data)


class PageDetailSerializer(PageSerializer):
    description_html = serializers.CharField()

    class Meta(PageSerializer.Meta):
        fields = PageSerializer.Meta.fields + ["description_html"]


class PageVersionSerializer(BaseSerializer):
    class Meta:
        model = PageVersion
        fields = [
            "id",
            "workspace",
            "page",
            "last_saved_at",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "page"]


class PageVersionDetailSerializer(BaseSerializer):
    class Meta:
        model = PageVersion
        fields = [
            "id",
            "workspace",
            "page",
            "last_saved_at",
            "description_binary",
            "description_html",
            "description_json",
            "owned_by",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = ["workspace", "page"]


class PageBinaryUpdateSerializer(serializers.Serializer):
    """Serializer for updating page binary description with validation"""

    description_binary = serializers.CharField(required=False, allow_blank=True)
    description_html = serializers.CharField(required=False, allow_blank=True)
    description_json = serializers.JSONField(required=False, allow_null=True)

    def validate_description_binary(self, value):
        """Validate the base64-encoded binary data"""
        if not value:
            return value

        try:
            # Decode the base64 data
            binary_data = base64.b64decode(value)

            # Validate the binary data
            is_valid, error_message = validate_binary_data(binary_data)
            if not is_valid:
                raise serializers.ValidationError(f"Invalid binary data: {error_message}")

            return binary_data
        except Exception as e:
            if isinstance(e, serializers.ValidationError):
                raise
            raise serializers.ValidationError("Failed to decode base64 data")

    def validate_description_html(self, value):
        """Validate the HTML content"""
        if not value:
            return value

        # Use the validation function from utils
        is_valid, error_message, sanitized_html = validate_html_content(value)
        if not is_valid:
            raise serializers.ValidationError(error_message)

        # Return sanitized HTML if available, otherwise return original
        return sanitized_html if sanitized_html is not None else value

    def update(self, instance, validated_data):
        """Update the page instance with validated data"""
        if "description_binary" in validated_data:
            instance.description_binary = validated_data.get("description_binary")

        if "description_html" in validated_data:
            instance.description_html = validated_data.get("description_html")

        if "description_json" in validated_data:
            instance.description_json = validated_data.get("description_json")

        instance.save()
        return instance
