"""Search saved Wiki text, including diagram source, with native tree visibility."""
import re
from django.db.models import Q, Case, When, Value, IntegerField
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from plane.app.views.base import BaseAPIView
from plane.app.views.wiki import wiki_page_scope, wiki_tree_revisions, wiki_document_data
from plane.app.views.wiki_review import review_data, workspace_today
from plane.db.models import Page, Project, Workspace


class SearchInput(serializers.Serializer):
    q = serializers.CharField(max_length=200)
    collection_id = serializers.UUIDField(required=False)
    page = serializers.IntegerField(min_value=1, max_value=1000000, default=1)
    review = serializers.ChoiceField(choices=('all', 'attention', 'unassigned'), default='all')


def excerpt(text, terms):
    text = ' '.join((text or '').split())
    positions = [match.start() for term in terms if (match := re.search(re.escape(term), text, re.I))]
    start = max(0, min(positions, default=0) - 70)
    end = start + 240
    return ('…' if start else '') + text[start:end] + ('…' if end < len(text) else '')


class WikiSearchEndpoint(BaseAPIView):
    def get(self, request, slug):
        # Authenticate before query validation so an outsider learns no document metadata.
        role, nodes, visible = wiki_page_scope(request.user, slug)
        serializer = SearchInput(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data.get('collection_id'):
            collection = get_object_or_404(Project, id=data['collection_id'], workspace__slug=slug,
                is_wiki_collection=True, archived_at__isnull=True)
            visible = [page for page in visible if page.wiki_collections[0].id == collection.id]
        allowed = {page.id: page for page in visible}
        # Page.save maintains this plain-text field on every native document save; no indexing lag.
        query = Page.objects.filter(id__in=allowed).defer('description_binary', 'description_json').select_related('owned_by')
        terms = list(dict.fromkeys(data['q'].split()))
        for term in terms:
            query = query.filter(Q(name__icontains=term) | Q(description_stripped__icontains=term))
        query = query.annotate(title_rank=Case(When(name__icontains=data['q'], then=Value(0)),
            default=Value(1), output_field=IntegerField())).order_by('title_rank', 'name', 'id')
        today = workspace_today(get_object_or_404(Workspace, slug=slug))
        if data['review'] != 'all':
            statuses = ('overdue', 'due_soon', 'changed') if data['review'] == 'attention' else ('unassigned', 'unscheduled')
            query = [page for page in query if review_data(page, today)['status'] in statuses]
        count = len(query) if isinstance(query, list) else query.count()
        start = (data['page'] - 1) * 25
        revisions = wiki_tree_revisions(nodes)
        page_map = {page.id: page for page in nodes}
        results = []
        for page in query[start:start + 25]:
            metadata = allowed[page.id]
            page.wiki_collections = metadata.wiki_collections
            ancestors = []
            parent = page_map.get(page.parent_id)
            while parent:
                ancestors.insert(0, parent.name)
                parent = page_map.get(parent.parent_id)
            title_match = all(term.casefold() in page.name.casefold() for term in terms)
            results.append({**wiki_document_data(page, role, today, revisions),
                'path': [page.wiki_collections[0].name, *ancestors],
                'snippet': excerpt(page.description_stripped, terms),
                'match': 'title' if title_match else 'content'})
        return Response({'results': results, 'count': count, 'page': data['page'], 'page_size': 25},
            headers={'Cache-Control': 'no-store'})
