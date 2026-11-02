import uuid
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from .base import BaseModel
from plane.utils.wiki_templates import BUILTIN_TEMPLATES, builtin_html


class WikiTemplate(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="wiki_templates")
    key = models.CharField(max_length=64, default=uuid.uuid4)
    name = models.CharField(max_length=80)
    description = models.CharField(max_length=500, blank=True)
    content_html = models.TextField(default="<p></p>")
    is_active = models.BooleanField(default=True)
    version = models.UUIDField(default=uuid.uuid4, editable=False)

    class Meta:
        db_table = "wiki_templates"
        constraints = [models.UniqueConstraint(fields=["workspace", "key"], name="wiki_template_workspace_key")]
        indexes = [models.Index(fields=["workspace", "is_active"], name="wiki_template_active")]


@receiver(post_save, sender="db.Workspace", dispatch_uid="wiki_templates_new_workspace")
def seed_workspace_templates(sender, instance, created, raw=False, **kwargs):
    if created and not raw:
        WikiTemplate.objects.bulk_create([WikiTemplate(workspace=instance, key=key, name=name, content_html=builtin_html(headings))
            for key, (name, headings) in BUILTIN_TEMPLATES.items()])
