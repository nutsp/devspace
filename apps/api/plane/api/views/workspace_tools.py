"""GET-only API-key access to the existing Wiki and Timesheet permission rules."""
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response
from plane.api.middleware.api_authentication import APIKeyAuthentication
from plane.api.rate_limit import ApiKeyRateThrottle
from plane.app.views.base import BaseAPIView
from plane.app.views.wiki import WikiPagesEndpoint, collection_data, workspace_role
from plane.app.views.wiki_graph import WikiGraphEndpoint
from plane.app.views.timesheet import MyTimesheetEndpoint, TimesheetDetailEndpoint, eligible_reviewers, member, sheet_data, week_date, review_sheet_query
from plane.db.models import APIToken, Page, Project, Timesheet


class WorkspaceTokenScope(BasePermission):
    def has_permission(self, request, view):
        return APIToken.objects.filter(token=request.auth, user=request.user,
            workspace__slug=view.kwargs['slug'], is_active=True).exists()


class ReadAPI:
    authentication_classes = [APIKeyAuthentication]
    permission_classes = [IsAuthenticated, WorkspaceTokenScope]
    http_method_names = ['get', 'head', 'options']

    def get_throttles(self):
        return [ApiKeyRateThrottle()]


def reader(request):
    return {'id': str(request.user.id), 'name': request.user.display_name}


class PageQuery(serializers.Serializer):
    cursor = serializers.IntegerField(min_value=0, default=0)
    per_page = serializers.IntegerField(min_value=1, max_value=100, default=50)
    collection_id = serializers.UUIDField(required=False)
    search = serializers.CharField(max_length=200, required=False, allow_blank=True)


class SheetQuery(serializers.Serializer):
    cursor = serializers.IntegerField(min_value=0, default=0)
    per_page = serializers.IntegerField(min_value=1, max_value=100, default=50)
    week_start = serializers.DateField(required=False)
    scope = serializers.ChoiceField(choices=['accessible', 'mine', 'review'], default='accessible')
    status = serializers.ChoiceField(choices=['draft', 'submitted', 'returned', 'approved'], required=False)


def query_data(serializer_class, request):
    serializer = serializer_class(data=request.query_params)
    if set(request.query_params) - set(serializer.fields):
        raise ValidationError('Unsupported query parameter. The reader identity cannot be overridden.')
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def paginate(rows, params, request):
    start, size = params['cursor'], params['per_page']
    selected = rows[start:start + size]
    next_offset = start + len(selected)
    more = next_offset < len(rows)
    return {'results': selected, 'total_count': len(rows), 'count': len(selected),
        'next_cursor': str(next_offset) if more else None, 'next_page_results': more, 'reader': reader(request)}


class MCPWikiCollections(ReadAPI, BaseAPIView):
    def get(self, request, slug):
        workspace_role(request.user, slug)
        params = query_data(PageQuery, request)
        projects = Project.objects.filter(workspace__slug=slug, is_wiki_collection=True, archived_at__isnull=True).order_by('name', 'id')
        # Unlike the browser endpoint this never creates/updates ProjectMember rows.
        return Response(paginate([collection_data(p) for p in projects], params, request))


class MCPWikiPages(ReadAPI, WikiPagesEndpoint):
    def get(self, request, slug, page_id=None):
        params = query_data(PageQuery, request)
        # Visibility includes every ancestor. Search and totals contain visible pages only.
        rows = super().get(request, slug).data
        if params.get('collection_id'):
            get_object_or_404(Project, id=params['collection_id'], workspace__slug=slug, is_wiki_collection=True, archived_at__isnull=True)
            rows = [r for r in rows if r['collection_id'] == str(params['collection_id'])]
        for row in rows:
            row.pop('can_move', None)
            row.pop('tree_revision', None)
            row['url'] = request.build_absolute_uri(f"/{slug}/wiki/{row['collection_id']}/pages/{row['id']}/")
        if page_id is not None:
            metadata = next((row for row in rows if row['id'] == str(page_id)), None)
            if metadata is None:
                raise NotFound()
            page = get_object_or_404(Page, id=page_id, workspace__slug=slug)
            return Response({**metadata, 'description_html': page.description_html or '', 'reader': reader(request)})
        return Response(paginate(rows, params, request))


class MCPWikiGraph(ReadAPI, WikiGraphEndpoint):
    def get(self, request, slug):
        if set(request.query_params) - {'page_id', 'collection_id', 'depth', 'include_hierarchy'}:
            raise ValidationError('Unsupported graph parameter. Reader identity cannot be overridden.')
        response = super().get(request, slug)
        response.data['reader'] = reader(request)
        return response


class MCPMyTimesheet(ReadAPI, MyTimesheetEndpoint):
    def get(self, request, slug):
        if set(request.query_params) - {'week_start'}:
            raise ValidationError('Only week_start is accepted; reader identity cannot be overridden.')
        response = super().get(request, slug)
        response.data['reader'] = reader(request)
        return response


class MCPTimesheetDetail(ReadAPI, TimesheetDetailEndpoint):
    def get(self, request, slug, sheet_id):
        if request.query_params:
            raise ValidationError('No query parameters are accepted.')
        response = super().get(request, slug, sheet_id)
        response.data['reader'] = reader(request)
        return response


class MCPTimesheets(ReadAPI, BaseAPIView):
    def get(self, request, slug):
        row = member(request.user, slug)
        params = query_data(SheetQuery, request)
        can_review = eligible_reviewers(row.workspace).filter(member=request.user).exists()
        if params['scope'] == 'review' and not can_review:
            raise PermissionDenied()
        permitted = Q(user=request.user)
        if can_review:
            permitted |= review_sheet_query(row.workspace, request.user)
        sheets = Timesheet.objects.filter(permitted, workspace=row.workspace).distinct()
        if params['scope'] == 'mine':
            sheets = sheets.filter(user=request.user)
        elif params['scope'] == 'review':
            sheets = sheets.filter(review_sheet_query(row.workspace, request.user))
        if params.get('week_start'):
            sheets = sheets.filter(week_start=week_date(params['week_start'].isoformat(), row.workspace))
        if params.get('status'):
            sheets = sheets.filter(status=params['status'])
        sheets = sheets.select_related('reviewer').prefetch_related('entries', 'events').order_by('-week_start', 'user_name', 'id')
        # Paginate before serializing entries/history so large lists stay bounded.
        total = sheets.count()
        start, size = params['cursor'], params['per_page']
        selected = [sheet_data(s, request.user) for s in sheets[start:start + size]]
        more = start + len(selected) < total
        return Response({'results': selected, 'total_count': total, 'count': len(selected),
            'next_cursor': str(start + len(selected)) if more else None, 'next_page_results': more, 'reader': reader(request)})


# Milestone reads use the authenticated token identity and the same project/guest rules as the UI.
from plane.app.views.milestone import (MilestonesEndpoint, MilestoneWorkItemsEndpoint,
    WorkspaceMilestonesEndpoint, PortfolioFilter, IssueFilter)


class MilestonePageQuery(serializers.Serializer):
    page = serializers.IntegerField(min_value=1, default=1)
    per_page = serializers.IntegerField(min_value=1, max_value=100, default=50)
    search = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class MilestonePortfolioQuery(PortfolioFilter):
    project_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=100)


def milestone_url(request, slug, project_id, pk):
    return request.build_absolute_uri(f"/{slug}/projects/{project_id}/milestones/?milestone={pk}")


def read_page(response, request):
    data = dict(response.data)
    data.pop('can_write', None)
    data['total_count'] = data.pop('total')
    data['count'] = len(data['results'])
    more = data.pop('next_page')
    data.update(next_cursor=str(more) if more else None, next_page_results=bool(more), reader=reader(request))
    return data


class MCPMilestonePortfolio(ReadAPI, WorkspaceMilestonesEndpoint):
    def get(self, request, slug):
        params = query_data(MilestonePortfolioQuery, request)
        response = super().get(request, slug, project_scope_ids=params['project_ids'])
        if response.status_code != 200:
            return response
        data = read_page(response, request)
        for row in data['results']:
            row['url'] = milestone_url(request, slug, row['project_id'], row['id'])
        return Response(data)


class MCPMilestones(ReadAPI, MilestonesEndpoint):
    def get(self, request, slug, project_id, pk=None):
        params = query_data(MilestonePageQuery, request)
        if pk and request.query_params:
            raise ValidationError('No query parameters are accepted for milestone retrieval.')
        response = super().get(request, slug, project_id, pk)
        if response.status_code != 200:
            return response
        data = response.data
        rows = data['results']
        if params['search']:
            rows = [row for row in rows if params['search'].lower() in row['name'].lower()]
        for row in rows:
            row.update(project_id=str(project_id), project_name=data['project_name'],
                visibility_limited=data['visibility_limited'], timezone=data['timezone'],
                url=milestone_url(request, slug, project_id, row['id']))
        if pk:
            return Response({**rows[0], 'reader': reader(request)})
        start=(params['page']-1)*params['per_page']
        selected=rows[start:start+params['per_page']]
        more=start+len(selected)<len(rows)
        return Response({'results':selected, 'total_count':len(rows), 'count':len(selected),
            'next_cursor':str(params['page']+1) if more else None, 'next_page_results':more,
            'timezone':data['timezone'], 'visibility_limited':data['visibility_limited'], 'reader':reader(request)})


class MCPMilestoneWorkItems(ReadAPI, MilestoneWorkItemsEndpoint):
    def get(self, request, slug, project_id):
        query_data(IssueFilter, request)
        response = super().get(request, slug, project_id)
        if response.status_code != 200:
            return response
        data = read_page(response, request)
        for row in data['results']:
            row['url'] = request.build_absolute_uri(f"/{slug}/projects/{project_id}/issues/{row['id']}/")
            if row['milestone_id']:
                row['milestone_url'] = milestone_url(request, slug, project_id, row['milestone_id'])
        return Response(data)
