# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from .analytic import urlpatterns as analytic_urls
from .api import urlpatterns as api_urls
from .asset import urlpatterns as asset_urls
from .cycle import urlpatterns as cycle_urls
from .estimate import urlpatterns as estimate_urls
from .external import urlpatterns as external_urls
from .intake import urlpatterns as intake_urls
from .issue import urlpatterns as issue_urls
from .module import urlpatterns as module_urls
from .notification import urlpatterns as notification_urls
from .page import urlpatterns as page_urls
from .project import urlpatterns as project_urls
from .search import urlpatterns as search_urls
from .state import urlpatterns as state_urls
from .user import urlpatterns as user_urls
from .views import urlpatterns as view_urls
from .webhook import urlpatterns as webhook_urls
from .workspace import urlpatterns as workspace_urls
from .timezone import urlpatterns as timezone_urls
from .exporter import urlpatterns as exporter_urls
from django.urls import path
from plane.app.views.wiki_search import WikiSearchEndpoint
from plane.app.views.wiki_graph import WikiGraphEndpoint
from plane.app.views.wiki import WikiCollectionsEndpoint, WikiPagesEndpoint, WikiPageMoveEndpoint
from plane.app.views.timesheet import TimesheetOptionsEndpoint, MyTimesheetEndpoint, TimesheetInboxEndpoint, TimesheetDetailEndpoint

from plane.app.views.wiki_review import WikiReviewEndpoint
from plane.app.views.wiki_diagrams import WikiPlantUMLPreviewEndpoint
from plane.app.views.wiki_templates import WikiTemplatesEndpoint, WikiTemplateDetailEndpoint

urlpatterns = [
    path("workspaces/<str:slug>/wiki/diagrams/plantuml/", WikiPlantUMLPreviewEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/templates/", WikiTemplatesEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/templates/<uuid:template_id>/", WikiTemplateDetailEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/collections/<uuid:project_id>/pages/<uuid:page_id>/review/", WikiReviewEndpoint.as_view()),
    path("workspaces/<str:slug>/timesheets/options/", TimesheetOptionsEndpoint.as_view()),
    path("workspaces/<str:slug>/timesheets/my/", MyTimesheetEndpoint.as_view()),
    path("workspaces/<str:slug>/timesheets/review/", TimesheetInboxEndpoint.as_view()),
    path("workspaces/<str:slug>/timesheets/<uuid:sheet_id>/", TimesheetDetailEndpoint.as_view()),
    path("workspaces/<str:slug>/timesheets/<uuid:sheet_id>/<str:action>/", TimesheetDetailEndpoint.as_view()),
    path("workspaces/<str:slug>/timesheets/<uuid:sheet_id>/entries/<uuid:entry_id>/<str:action>/", TimesheetDetailEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/collections/", WikiCollectionsEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/collections/<uuid:project_id>/", WikiCollectionsEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/search/", WikiSearchEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/pages/", WikiPagesEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/graph/", WikiGraphEndpoint.as_view()),
    path("workspaces/<str:slug>/wiki/collections/<uuid:project_id>/pages/<uuid:page_id>/move/", WikiPageMoveEndpoint.as_view()),
    *analytic_urls,
    *asset_urls,
    *cycle_urls,
    *estimate_urls,
    *external_urls,
    *intake_urls,
    *issue_urls,
    *module_urls,
    *notification_urls,
    *page_urls,
    *project_urls,
    *search_urls,
    *state_urls,
    *user_urls,
    *view_urls,
    *workspace_urls,
    *api_urls,
    *webhook_urls,
    *timezone_urls,
    *exporter_urls,
]

from plane.app.views.milestone import MilestonesEndpoint, MilestoneWorkItemsEndpoint, MilestoneAssignmentEndpoint
urlpatterns += [
    path("workspaces/<str:slug>/projects/<uuid:project_id>/milestones/", MilestonesEndpoint.as_view()),
    path("workspaces/<str:slug>/projects/<uuid:project_id>/milestones/work-items/", MilestoneWorkItemsEndpoint.as_view()),
    path("workspaces/<str:slug>/projects/<uuid:project_id>/milestones/work-items/<uuid:issue_id>/", MilestoneAssignmentEndpoint.as_view()),
    path("workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:pk>/", MilestonesEndpoint.as_view()),
    path("workspaces/<str:slug>/projects/<uuid:project_id>/milestones/<uuid:pk>/work-items/", MilestoneWorkItemsEndpoint.as_view()),
]

from plane.app.views.milestone import WorkspaceMilestonesEndpoint
urlpatterns += [path("workspaces/<str:slug>/milestones/", WorkspaceMilestonesEndpoint.as_view())]
