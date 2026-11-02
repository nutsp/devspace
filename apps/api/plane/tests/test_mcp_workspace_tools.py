from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember, ProjectPage, Page, APIToken, Timesheet, TimeEntry


class MCPWorkspaceToolsTests(TestCase):
    def setUp(self):
        self.owner=User.objects.create(email='mcp-owner@example.test',username='mcp-owner',display_name='PM')
        self.other=User.objects.create(email='mcp-other@example.test',username='mcp-other')
        self.member=User.objects.create(email='mcp-member@example.test',username='mcp-member')
        self.workspace=Workspace.objects.create(name='MCP test',slug='mcp-test',owner=self.owner)
        for user,role in [(self.owner,20),(self.other,15),(self.member,15)]:
            WorkspaceMember.objects.create(workspace=self.workspace,member=user,role=role)
        self.collection=Project.objects.create(workspace=self.workspace,name='Engineering',identifier='WIKI',is_wiki_collection=True)
        self.token=APIToken.objects.create(workspace=self.workspace,user=self.owner)
        self.client=APIClient();self.client.credentials(HTTP_X_API_KEY=self.token.token)
        self.base='/api/v1/workspaces/mcp-test/mcp/'
        self.public=self.page('Public guide')
        self.mine=self.page('My private guide',access=1)
        self.hidden=self.page('Secret guide',owned_by=self.other,access=1)
        self.child=self.page('Hidden child',parent=self.hidden)
        self.own_sheet=self.sheet(self.owner,180)
        self.review_project=Project.objects.create(workspace=self.workspace,name='Lead project',identifier='LEAD',project_lead=self.owner)
        ProjectMember.objects.create(workspace=self.workspace,project=self.review_project,member=self.owner,role=20)
        self.review_sheet=self.sheet(self.member,90,reviewer=self.owner,status='submitted')
        entry=self.review_sheet.entries.first();entry.project=self.review_project;entry.save()
        self.review_sheet.project_reviews={str(self.review_project.id):{'project_id':str(self.review_project.id),'project_name':'Lead project','project_code':'LEAD','reviewer_id':str(self.owner.id),'reviewer_name':'PM','status':'submitted','reason':'','reviewed_at':None}}
        self.review_sheet.save()
        self.hidden_sheet=self.sheet(self.other,45)

    def page(self,name,**kwargs):
        owner=kwargs.pop('owned_by',self.owner)
        page=Page.objects.create(workspace=self.workspace,owned_by=owner,name=name,description_html='<p>Saved body</p>',**kwargs)
        ProjectPage.objects.create(workspace=self.workspace,project=self.collection,page=page)
        return page

    def sheet(self,user,minutes,**kwargs):
        sheet=Timesheet.objects.create(workspace=self.workspace,user=user,user_name=user.display_name,week_start=date(2026,10,26),timezone='Asia/Bangkok',**kwargs)
        TimeEntry.objects.create(timesheet=sheet,work_date=date(2026,10,26),project_name='Demo',project_code='DEMO',activity='Development',duration_minutes=minutes)
        return sheet

    def test_wiki_content_private_ancestry_search_pagination_and_no_membership_write(self):
        before=ProjectMember.objects.count()
        self.assertEqual(self.client.get(self.base+'wiki/collections/').status_code,200)
        self.assertEqual(ProjectMember.objects.count(),before)
        url=self.base+'wiki/pages/'
        first=self.client.get(url,{'per_page':1}).data
        self.assertEqual(first['total_count'],2)
        second=self.client.get(url,{'per_page':1,'cursor':first['next_cursor']}).data
        self.assertFalse(second['next_page_results'])
        self.assertEqual({first['results'][0]['id'],second['results'][0]['id']},{str(self.public.id),str(self.mine.id)})
        self.assertEqual(self.client.get(url+f'{self.public.id}/').data['description_html'],'<p>Saved body</p>')
        for page in [self.hidden,self.child]:
            self.assertEqual(self.client.get(url+f'{page.id}/').status_code,404)
        self.assertEqual(self.client.get(url,{'search':'Hidden'}).data['total_count'],0)
        graph=self.client.get(self.base+'wiki/graph/').data
        self.assertEqual({n['id'] for n in graph['nodes']},{str(self.public.id),str(self.mine.id)})
        self.assertEqual(self.client.get(self.base+'wiki/graph/',{'page_id':str(self.hidden.id)}).status_code,404)
        self.public.archived_at=timezone.now();self.public.save()
        self.assertEqual(self.client.get(url+f'{self.public.id}/').status_code,404)

    def test_timesheet_owner_assigned_reviewer_and_demotion(self):
        url=self.base+'timesheets/'
        first=self.client.get(url,{'per_page':1}).data
        second=self.client.get(url,{'per_page':1,'cursor':first['next_cursor']}).data
        self.assertEqual(first['total_count'],2)
        self.assertEqual({r['id'] for r in first['results']+second['results']},{str(self.own_sheet.id),str(self.review_sheet.id)})
        own=self.client.get(url+'my/',{'week_start':'2026-10-28'}).data
        self.assertEqual(own['total_minutes'],180)
        self.assertEqual(own['week_start'],'2026-10-26')
        self.assertEqual(self.client.get(url+f'{self.review_sheet.id}/').data['total_minutes'],90)
        self.assertEqual(self.client.get(url+f'{self.hidden_sheet.id}/').status_code,403)
        self.assertEqual(self.client.get(url,{'scope':'review','status':'submitted'}).data['total_count'],1)
        WorkspaceMember.objects.filter(member=self.owner,workspace=self.workspace).update(role=5)
        self.assertEqual(self.client.get(url).data['total_count'],1)
        self.assertEqual(self.client.get(url+f'{self.review_sheet.id}/').status_code,403)
        self.assertEqual(self.client.get(url,{'scope':'review'}).status_code,403)
        self.assertEqual(self.client.get(url+f'{self.own_sheet.id}/').status_code,200)

    def test_identity_validation_and_empty_week_is_non_creating(self):
        for path in ['timesheets/','timesheets/my/','wiki/pages/','wiki/graph/']:
            self.assertEqual(self.client.get(self.base+path,{'user_id':str(self.other.id)}).status_code,400)
        count=Timesheet.objects.count()
        result=self.client.get(self.base+'timesheets/my/',{'week_start':'2026-12-07'})
        self.assertIsNone(result.data['id'])
        self.assertEqual(Timesheet.objects.count(),count)
        for query in [{'per_page':101},{'cursor':-1},{'week_start':'invalid'}]:
            self.assertEqual(self.client.get(self.base+'timesheets/',query).status_code,400)

    def test_all_api_routes_are_read_only(self):
        for path in ['wiki/collections/','wiki/pages/',f'wiki/pages/{self.public.id}/','wiki/graph/','timesheets/','timesheets/my/',f'timesheets/{self.own_sheet.id}/']:
            for method in ['post','patch','delete']:
                self.assertEqual(getattr(self.client,method)(self.base+path,{},format='json').status_code,405)
        self.assertEqual(Timesheet.objects.count(),3)
        self.assertEqual(Page.objects.count(),4)

    def test_authentication_workspace_binding_revocation_and_removed_member(self):
        url=self.base+'wiki/pages/'
        self.client.credentials()
        self.assertIn(self.client.get(url).status_code,[401,403])
        self.client.credentials(HTTP_X_API_KEY=self.token.token)
        self.token.expired_at=timezone.now()-timedelta(seconds=1);self.token.save()
        self.assertIn(self.client.get(url).status_code,[401,403])
        self.token.expired_at=None;self.token.save()
        another=Workspace.objects.create(name='Other',slug='other-mcp',owner=self.owner)
        WorkspaceMember.objects.create(workspace=another,member=self.owner,role=20)
        self.assertEqual(self.client.get('/api/v1/workspaces/other-mcp/mcp/wiki/pages/').status_code,403)
        WorkspaceMember.objects.filter(workspace=self.workspace,member=self.owner).update(is_active=False)
        self.assertEqual(self.client.get(url).status_code,403)
        self.assertEqual(self.client.get(self.base+'timesheets/').status_code,403)
