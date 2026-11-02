from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from plane.db.models import (User, Workspace, WorkspaceMember, Project, ProjectMember,
    State, Issue, IssueAssignee, Milestone, MilestoneIssue, APIToken)


class MCPMilestonesTests(TestCase):
    def setUp(self):
        self.reader=User.objects.create(email='milestone-reader@example.test',username='milestone-reader',display_name='Work reader')
        self.other=User.objects.create(email='milestone-author@example.test',username='milestone-author')
        self.workspace=Workspace.objects.create(slug='mcp-milestones-test',name='MCP delivery',owner=self.other,timezone='Asia/Bangkok')
        WorkspaceMember.objects.create(workspace=self.workspace,member=self.reader,role=20)
        self.a=Project.objects.create(workspace=self.workspace,name='A',identifier='AA')
        self.b=Project.objects.create(workspace=self.workspace,name='B',identifier='BB',guest_view_all_features=False)
        self.hidden=Project.objects.create(workspace=self.workspace,name='Secret',identifier='SECRET')
        ProjectMember.objects.create(project=self.a,member=self.reader,role=15)
        ProjectMember.objects.create(project=self.b,member=self.reader,role=5)
        self.started=State.objects.create(project=self.a,name='Started',group='started',default=True)
        self.done=State.objects.create(project=self.a,name='Done',group='completed')
        self.cancelled=State.objects.create(project=self.a,name='Cancelled',group='cancelled')
        self.launch=Milestone.objects.create(project=self.a,name='Launch',target_date=date.today()-timedelta(days=2),description='Saved checkpoint description')
        self.second=Milestone.objects.create(project=self.a,name='Release')
        self.pending=Issue.objects.create(project=self.a,name='Pending task',state=self.started,target_date=date.today()-timedelta(days=1))
        self.completed=Issue.objects.create(project=self.a,name='Done task',state=self.done,target_date=date.today()+timedelta(days=10))
        self.cancelled_issue=Issue.objects.create(project=self.a,name='Cancelled task',state=self.cancelled)
        for issue in (self.pending,self.completed,self.cancelled_issue):
            MilestoneIssue.objects.create(project=self.a,issue=issue,milestone=self.launch)
        self.b_milestone=Milestone.objects.create(project=self.b,name='Limited checkpoint',target_date=date.today()+timedelta(days=10))
        b_done=State.objects.create(project=self.b,name='Done',group='completed')
        b_started=State.objects.create(project=self.b,name='Started',group='started')
        for name,state,creator in [('Visible',b_done,self.reader),('Hidden',b_started,self.other)]:
            issue=Issue.objects.create(project=self.b,name=name,state=state)
            Issue.objects.filter(id=issue.id).update(created_by=creator)
            MilestoneIssue.objects.create(project=self.b,milestone=self.b_milestone,issue=issue)
        Milestone.objects.create(project=self.hidden,name='Secret checkpoint')
        self.token=APIToken.objects.create(workspace=self.workspace,user=self.reader)
        self.client=APIClient();self.client.credentials(HTTP_X_API_KEY=self.token.token)
        self.base='/api/v1/workspaces/mcp-milestones-test/mcp/'
        self.project_url=f'{self.base}projects/{self.a.id}/milestones/'
        self.items_url=f'{self.base}projects/{self.a.id}/milestone-work-items/'

    def test_scoped_portfolio_paginates_after_scope_and_access_filtering(self):
        url=self.base+'milestones/'
        first=self.client.get(url,{'project_ids':[str(self.a.id)],'status':'all','per_page':1})
        self.assertEqual(first.status_code,200,first.data)
        self.assertEqual(first.data['total_count'],2)
        self.assertTrue(first.data['next_page_results'])
        self.assertEqual([p['id'] for p in first.data['projects']],[str(self.a.id)])
        second=self.client.get(url,{'project_ids':[str(self.a.id)],'status':'all','per_page':1,'page':first.data['next_cursor']}).data
        self.assertFalse(second['next_page_results'])
        self.assertEqual({r['id'] for r in first.data['results']+second['results']},{str(self.launch.id),str(self.second.id)})
        self.assertTrue(first.data['results'][0]['url'].endswith(f'/{self.workspace.slug}/projects/{self.a.id}/milestones/?milestone={self.launch.id}'))
        self.assertEqual(first.data['reader']['id'],str(self.reader.id))
        all_rows=self.client.get(url,{'project_ids':[str(p.id) for p in (self.a,self.b,self.hidden)],'status':'all'}).data
        self.assertEqual(all_rows['total_count'],3)
        self.assertNotIn('SECRET',str(all_rows))
        self.assertEqual(self.client.get(url,{'project_ids':[str(self.a.id)],'project_id':str(self.b.id)}).status_code,404)
        self.assertEqual(self.client.get(url).status_code,400)

    def test_project_detail_search_and_guest_visibility(self):
        data=self.client.get(self.project_url,{'per_page':1}).data
        self.assertEqual(data['total_count'],2)
        self.assertNotIn('can_write',data)
        self.assertEqual(self.client.get(self.project_url,{'search':'Launch'}).data['total_count'],1)
        detail=self.client.get(f'{self.project_url}{self.launch.id}/').data
        self.assertEqual((detail['description'],detail['progress'],detail['pending']),('Saved checkpoint description',50,1))
        self.assertEqual(self.client.get(f'{self.project_url}{self.b_milestone.id}/').status_code,404)
        limited=self.client.get(f'{self.base}projects/{self.b.id}/milestones/{self.b_milestone.id}/').data
        self.assertTrue(limited['visibility_limited'])
        self.assertEqual((limited['total'],limited['pending'],limited['progress']),(1,0,100))
        hidden_items=self.client.get(f'{self.base}projects/{self.b.id}/milestone-work-items/',{'search':'Hidden'}).data
        self.assertEqual(hidden_items['total_count'],0)
        self.assertEqual(self.client.get(f'{self.base}projects/{self.hidden.id}/milestones/').status_code,404)

    def test_workitem_filters_apply_before_pagination_and_keep_citations(self):
        params={'milestone':str(self.launch.id),'per_page':1}
        all_first=self.client.get(self.items_url,params).data
        self.assertEqual(all_first['total_count'],3)
        second=self.client.get(self.items_url,{**params,'page':all_first['next_cursor']}).data
        self.assertNotEqual(all_first['results'][0]['id'],second['results'][0]['id'])
        for choice in ['pending','overdue','late','unassigned']:
            result=self.client.get(self.items_url,{**params,'work_status':choice}).data
            self.assertEqual(result['total_count'],1,(choice,result))
            self.assertFalse(result['next_page_results'])
            row=result['results'][0]
            self.assertEqual(row['id'],str(self.pending.id))
            self.assertTrue(row['url'].endswith(f'/issues/{self.pending.id}/'))
            self.assertTrue(row['milestone_url'].endswith(f'?milestone={self.launch.id}'))
        IssueAssignee.objects.create(project=self.a,issue=self.pending,assignee=self.reader)
        self.assertEqual(self.client.get(self.items_url,{**params,'work_status':'unassigned'}).data['total_count'],0)

    def test_reads_never_write_and_every_route_refuses_mutations(self):
        before=(Milestone.objects.count(),MilestoneIssue.objects.count(),ProjectMember.objects.count(),Issue.objects.count())
        paths=[self.base+'milestones/',self.project_url,f'{self.project_url}{self.launch.id}/',self.items_url]
        for path in paths:
            for method in ['post','put','patch','delete']:
                self.assertEqual(getattr(self.client,method)(path,{},format='json').status_code,405,(path,method))
        self.client.get(self.base+'milestones/',{'project_ids':[str(self.a.id)],'status':'all'})
        self.client.get(self.project_url);self.client.get(self.items_url)
        self.assertEqual(before,(Milestone.objects.count(),MilestoneIssue.objects.count(),ProjectMember.objects.count(),Issue.objects.count()))

    def test_validation_overrides_revocation_and_workspace_binding(self):
        for path in [self.project_url,self.items_url,self.base+'milestones/']:
            for key in ['user_id','reader_id','workspace_slug','base_url','api_key','pql']:
                self.assertEqual(self.client.get(path,{key:'override'}).status_code,400,(path,key))
        for params in [{'page':0},{'per_page':101},{'work_status':'invalid'},{'milestone':'bad'}]:
            self.assertEqual(self.client.get(self.items_url,params).status_code,400)
        self.assertEqual(self.client.get(f'{self.project_url}{self.launch.id}/',{'page':1}).status_code,400)
        self.client.credentials()
        self.assertIn(self.client.get(self.project_url).status_code,[401,403])
        self.client.credentials(HTTP_X_API_KEY=self.token.token)
        other_ws=Workspace.objects.create(slug='mcp-milestones-other',name='Other',owner=self.reader)
        WorkspaceMember.objects.create(workspace=other_ws,member=self.reader,role=20)
        self.assertEqual(self.client.get(f'/api/v1/workspaces/{other_ws.slug}/mcp/milestones/',{'project_ids':[str(self.a.id)]}).status_code,403)
        self.token.expired_at=timezone.now()-timedelta(seconds=1);self.token.save()
        self.assertIn(self.client.get(self.project_url).status_code,[401,403])
        self.token.expired_at=None;self.token.save()
        ProjectMember.objects.filter(project=self.a,member=self.reader).update(is_active=False)
        self.assertEqual(self.client.get(self.project_url).status_code,404)
        ProjectMember.objects.filter(project=self.a,member=self.reader).update(is_active=True)
        WorkspaceMember.objects.filter(workspace=self.workspace,member=self.reader).update(is_active=False)
        self.assertEqual(self.client.get(self.project_url).status_code,403)
