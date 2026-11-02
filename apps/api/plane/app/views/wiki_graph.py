"""Permission-filtered wiki links derived from the original editor's saved HTML."""
import re
from collections import defaultdict
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
from django.db.models import Prefetch
from rest_framework import serializers
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.db.models import Page, Project
from .wiki import workspace_role, can_read_tree_page


class PageLinkParser(HTMLParser):
    def __init__(self, slug, host):
        super().__init__(convert_charrefs=True)
        self.slug, self.host, self.targets = slug, host.lower(), set()

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        if not isinstance(href, str):
            return
        try:
            url = urlsplit(href)
            if url.scheme and url.scheme not in ("http", "https"):
                return
            if url.netloc and url.netloc.lower() != self.host:
                return
            match = re.fullmatch(r"/([^/]+)/(?:wiki|projects)/([0-9a-fA-F-]{36})/pages/([0-9a-fA-F-]{36})/?", unquote(url.path))
            if match and match[1] == self.slug:
                self.targets.add((match[2].lower(), match[3].lower()))
        except ValueError:
            return


def saved_page_links(html, slug, host):
    parser = PageLinkParser(slug, host)
    parser.feed(html or "")
    return parser.targets


class WikiGraphQuery(serializers.Serializer):
    page_id = serializers.UUIDField(required=False)
    collection_id = serializers.UUIDField(required=False)
    depth = serializers.IntegerField(min_value=1, max_value=2, default=1)
    include_hierarchy = serializers.BooleanField(default=True)


class WikiGraphEndpoint(BaseAPIView):
    def get(self, request, slug):
        workspace_role(request.user, slug)
        query = WikiGraphQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data
        pages = list(Page.objects.filter(workspace__slug=slug, projects__is_wiki_collection=True,
            projects__archived_at__isnull=True, project_pages__deleted_at__isnull=True, archived_at__isnull=True)
            .defer("description_binary", "description_json").prefetch_related(Prefetch("projects",
                queryset=Project.objects.filter(is_wiki_collection=True, archived_at__isnull=True).order_by("id"), to_attr="wiki_collections"))
            .order_by("id").distinct())
        groups = defaultdict(dict)
        for page in pages:
            for collection in page.wiki_collections:
                groups[collection.id][page.id] = page
        visible = {str(p.id): p for p in pages if p.wiki_collections and
            can_read_tree_page(p, groups[p.wiki_collections[0].id], request.user)}
        nodes = {pid: {"id": pid, "name": p.name, "collection_id": str(p.wiki_collections[0].id),
            "collection_name": p.wiki_collections[0].name} for pid, p in visible.items()}
        edges = []
        for pid, page in visible.items():
            for collection_id, target_id in sorted(saved_page_links(page.description_html, slug, request.get_host())):
                if target_id in visible and target_id != pid and nodes[target_id]["collection_id"] == collection_id:
                    edges.append({"source": pid, "target": target_id, "type": "link"})
            if page.parent_id and str(page.parent_id) in visible and params["include_hierarchy"]:
                edges.append({"source": str(page.parent_id), "target": pid, "type": "parent"})
        focus = str(params["page_id"]) if params.get("page_id") else None
        if focus and focus not in nodes:
            raise NotFound()
        scope = set(nodes)
        if params.get("collection_id"):
            cid = str(params["collection_id"])
            if cid not in {str(c.id) for p in visible.values() for c in p.wiki_collections}:
                # An empty visible collection is a valid graph too.
                if not Project.objects.filter(id=cid, workspace__slug=slug, is_wiki_collection=True, archived_at__isnull=True).exists():
                    raise NotFound()
            scope = {pid for pid in scope if nodes[pid]["collection_id"] == cid}
        if focus and focus not in scope:
            raise NotFound()
        incoming = [nodes[e["source"]] for e in edges if e["type"] == "link" and e["target"] == focus]
        outgoing = [nodes[e["target"]] for e in edges if e["type"] == "link" and e["source"] == focus]
        if focus:
            neighbors = defaultdict(set)
            for edge in edges:
                if edge["source"] in scope and edge["target"] in scope:
                    neighbors[edge["source"]].add(edge["target"])
                    neighbors[edge["target"]].add(edge["source"])
            selected, frontier = {focus}, {focus}
            for _ in range(params["depth"]):
                frontier = {target for pid in frontier for target in neighbors[pid]} - selected
                selected.update(frontier)
            scope = selected
        total = len(scope)
        # Bound layout work; metadata for inaccessible pages never enters the response.
        limit = 80 if focus else 300
        chosen = sorted(scope, key=lambda pid: (pid != focus, nodes[pid]["name"].casefold(), pid))[:limit]
        selected = set(chosen)
        return Response({"nodes": [nodes[pid] for pid in chosen],
            "edges": [e for e in edges if e["source"] in selected and e["target"] in selected],
            "incoming": incoming, "outgoing": outgoing, "focus_id": focus,
            "total_nodes": total, "truncated": total > limit})
