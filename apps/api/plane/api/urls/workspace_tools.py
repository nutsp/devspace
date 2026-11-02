from django.urls import path
from plane.api.views.workspace_tools import MCPWikiCollections, MCPWikiPages, MCPWikiGraph, MCPMyTimesheet, MCPTimesheets, MCPTimesheetDetail

urlpatterns = [
    path('workspaces/<str:slug>/mcp/wiki/collections/', MCPWikiCollections.as_view()),
    path('workspaces/<str:slug>/mcp/wiki/pages/', MCPWikiPages.as_view()),
    path('workspaces/<str:slug>/mcp/wiki/pages/<uuid:page_id>/', MCPWikiPages.as_view()),
    path('workspaces/<str:slug>/mcp/wiki/graph/', MCPWikiGraph.as_view()),
    path('workspaces/<str:slug>/mcp/timesheets/my/', MCPMyTimesheet.as_view()),
    path('workspaces/<str:slug>/mcp/timesheets/', MCPTimesheets.as_view()),
    path('workspaces/<str:slug>/mcp/timesheets/<uuid:sheet_id>/', MCPTimesheetDetail.as_view()),
]

from plane.api.views.workspace_tools import MCPMilestonePortfolio, MCPMilestones, MCPMilestoneWorkItems
urlpatterns += [
    path('workspaces/<str:slug>/mcp/milestones/', MCPMilestonePortfolio.as_view()),
    path('workspaces/<str:slug>/mcp/projects/<uuid:project_id>/milestones/', MCPMilestones.as_view()),
    path('workspaces/<str:slug>/mcp/projects/<uuid:project_id>/milestones/<uuid:pk>/', MCPMilestones.as_view()),
    path('workspaces/<str:slug>/mcp/projects/<uuid:project_id>/milestone-work-items/', MCPMilestoneWorkItems.as_view()),
]
