from datetime import date, timedelta
from django.test import TestCase
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember, State, Issue, IssueActivity, Milestone, MilestoneIssue


class MilestoneTests(TestCase):
    def setUp(self):
        self.member = User.objects.create(email="milestone-member@example.test", username="milestone-member")
        self.guest = User.objects.create(email="milestone-guest@example.test", username="milestone-guest")
        self.outsider = User.objects.create(email="milestone-other@example.test", username="milestone-other")
        self.workspace = Workspace.objects.create(name="Milestones", slug="milestones-test", owner=self.member, timezone="Asia/Bangkok")
        for user, role in [(self.member,15),(self.guest,5),(self.outsider,20)]:
            WorkspaceMember.objects.create(workspace=self.workspace,member=user,role=role)
        self.project = Project.objects.create(workspace=self.workspace,name="Delivery",identifier="DEL",guest_view_all_features=False)
        self.other = Project.objects.create(workspace=self.workspace,name="Other",identifier="OTH")
        for user, role in [(self.member,15),(self.guest,5)]:
            ProjectMember.objects.create(project=self.project,member=user,role=role)
        self.open = State.objects.create(project=self.project,name="In progress",group="started",default=True)
        self.done = State.objects.create(project=self.project,name="Done",group="completed")
        self.cancelled = State.objects.create(project=self.project,name="Cancelled",group="cancelled")
        self.triage = State.objects.create(project=self.project,name="Intake",group="triage")
        self.issues = [Issue.objects.create(project=self.project,name=f"Task {n}",state=self.open) for n in range(4)]
        self.client=APIClient()
        self.client.force_authenticate(self.member)
        self.base=f"/api/workspaces/{self.workspace.slug}/projects/{self.project.id}/milestones/"

    def create(self, name="UAT", **extra):
        response=self.client.post(self.base,{"name":name,**extra},format="json")
        self.assertEqual(response.status_code,201,response.data)
        return response.data["id"]

    def link(self, mid, issues):
        return self.client.post(f"{self.base}{mid}/work-items/",{"issue_ids":[str(i.id) for i in issues]},format="json")

    def assign(self, issue, mid):
        return self.client.post(f"{self.base}work-items/{issue.id}/",{"milestone_id":mid},format="json")

    def test_lifecycle_progress_filters_and_history(self):
        mid=self.create(target_date=str(date.today()-timedelta(days=2)))
        self.assertEqual(self.link(mid,self.issues[:3]).status_code,200)
        self.issues[0].state=self.done;self.issues[0].save()
        self.issues[1].state=self.cancelled;self.issues[1].save()
        self.issues[2].target_date=date.today();self.issues[2].save()
        row=self.client.get(self.base).data["results"][0]
        self.assertEqual((row["total"],row["progress"],row["pending"],row["late_work_items"]),(3,50,1,1))
        self.assertTrue(row["overdue"])
        items=self.client.get(self.base+"work-items/",{"milestone":mid,"per_page":2}).data
        self.assertEqual((items["total"],items["next_page"],len(items["results"])),(3,2,2))
        self.assertEqual(self.client.get(self.base+"work-items/",{"milestone":"none"}).data["total"],1)
        second=self.create("Go-live")
        self.assertEqual(self.assign(self.issues[2],second).status_code,200)
        self.assertEqual(MilestoneIssue.objects.filter(issue=self.issues[2]).count(),1)
        self.assertTrue(IssueActivity.objects.filter(issue=self.issues[2],field="milestone",old_value="UAT",new_value="Go-live").exists())
        self.assertEqual(self.assign(self.issues[2],None).status_code,200)
        self.assertEqual(self.client.patch(f"{self.base}{mid}/",{"name":"UAT ready","target_date":None},format="json").status_code,200)
        self.assertEqual(self.client.delete(f"{self.base}{mid}/").status_code,204)
        self.assertEqual(Issue.objects.filter(project=self.project).count(),4)
        self.assertFalse(MilestoneIssue.objects.filter(milestone_id=mid).exists())
        self.assertTrue(IssueActivity.objects.filter(issue=self.issues[0],field="milestone",new_value="").exists())

    def test_validation_cross_project_and_active_scope(self):
        mid=self.create()
        self.assertEqual(self.client.post(self.base,{"name":" uat "},format="json").status_code,400)
        self.assertEqual(self.client.post(self.base,{"name":" "},format="json").status_code,400)
        self.assertEqual(self.client.post(self.base,{"name":"X","target_date":"bad"},format="json").status_code,400)
        other_milestone=Milestone.objects.create(project=self.other,name="Other milestone")
        self.assertEqual(self.assign(self.issues[0],str(other_milestone.id)).status_code,404)
        other_issue=Issue.objects.create(project=self.other,name="Other task")
        self.assertEqual(self.link(mid,[self.issues[0],other_issue]).status_code,400)
        self.assertFalse(MilestoneIssue.objects.exists())
        for field,value in [("is_draft",True),("archived_at",date.today()),("state",self.triage)]:
            issue=Issue.objects.create(project=self.project,name="Unavailable",**{field:value})
            self.assertEqual(self.link(mid,[issue]).status_code,400)
        self.assertEqual(self.link(mid,[self.issues[0]]).status_code,200)
        second=self.create("Second")
        self.assertEqual(self.link(second,[self.issues[0]]).status_code,409)
        self.assertEqual(self.client.get(self.base+"work-items/",{"milestone":"invalid"}).status_code,400)
        self.assertEqual(self.client.get(self.base+"work-items/",{"page":0}).status_code,400)
        self.assertEqual(self.client.get(self.base+"work-items/",{"search":"Task 0"}).data["total"],1)

    def test_existing_permissions_and_guest_visible_counts(self):
        mid=self.create()
        Issue.objects.filter(id=self.issues[0].id).update(created_by=self.guest)
        self.assertEqual(self.link(mid,self.issues).status_code,200)
        self.client.force_authenticate(self.guest)
        data=self.client.get(self.base).data
        self.assertTrue(data["visibility_limited"])
        self.assertFalse(data["can_write"])
        self.assertEqual(data["results"][0]["total"],1)
        self.assertEqual(self.client.get(self.base+"work-items/",{"milestone":mid}).data["total"],1)
        self.assertEqual(self.client.post(self.base,{"name":"Forbidden"},format="json").status_code,403)
        self.assertEqual(self.client.patch(f"{self.base}{mid}/",{"name":"Forbidden"},format="json").status_code,403)
        self.assertEqual(self.client.delete(f"{self.base}{mid}/").status_code,403)
        self.assertEqual(self.assign(self.issues[0],None).status_code,403)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.base).status_code,403)
        self.client.force_authenticate(self.member)
        WorkspaceMember.objects.filter(workspace=self.workspace,member=self.member).update(is_active=False)
        self.assertEqual(self.client.get(self.base).status_code,403)

    def test_cancelled_empty_archived_and_move(self):
        mid=self.create()
        self.assertEqual(self.client.get(self.base).data["results"][0]["progress"],0)
        self.link(mid,[self.issues[0]])
        self.issues[0].state=self.cancelled;self.issues[0].save()
        data=self.client.get(self.base).data["results"][0]
        self.assertEqual(data["progress"],0)
        self.assertFalse(data["overdue"])
        self.issues[0].project=self.other;self.issues[0].save()
        self.assertFalse(MilestoneIssue.objects.filter(issue=self.issues[0]).exists())
        self.assertTrue(IssueActivity.objects.filter(issue=self.issues[0],field="milestone",new_value="").exists())
        self.project.archived_at=date.today();self.project.save()
        self.assertFalse(self.client.get(self.base).data["can_write"])
        self.assertEqual(self.client.post(self.base,{"name":"Archived"},format="json").status_code,403)

    def test_portfolio_project_access_pagination_and_filters(self):
        mid=self.create("Overdue delivery",target_date=str(date.today()-timedelta(days=2)))
        self.link(mid,[self.issues[0]])
        secret=Milestone.objects.create(project=self.other,name="Secret checkpoint",target_date=date.today()+timedelta(days=1))
        url=f"/api/workspaces/{self.workspace.slug}/milestones/"
        result=self.client.get(url).data
        self.assertEqual(result['total'],1)
        self.assertEqual(result['results'][0]['id'],mid)
        self.assertNotIn(str(self.other.id),[p['id'] for p in result['projects']])
        self.assertEqual(self.client.get(url,{'project_id':str(self.other.id)}).status_code,404)
        ProjectMember.objects.create(project=self.other,member=self.member,role=15)
        other_issue=Issue.objects.create(project=self.other,name="Late task",target_date=date.today()+timedelta(days=10))
        self.client.post(f"/api/workspaces/{self.workspace.slug}/projects/{self.other.id}/milestones/{secret.id}/work-items/",{'issue_ids':[str(other_issue.id)]},format='json')
        result=self.client.get(url,{'status':'all','per_page':1}).data
        self.assertEqual((result['total'],result['next_page']),(2,2))
        page2=self.client.get(url,{'status':'all','per_page':1,'page':2}).data
        self.assertNotEqual(result['results'][0]['id'],page2['results'][0]['id'])
        self.assertIsNone(page2['next_page'])
        self.assertEqual(self.client.get(url,{'status':'due_soon','project_id':str(self.other.id)}).data['total'],1)
        self.assertEqual(self.client.get(url,{'search':'Secret'}).data['results'][0]['late_pending_work_items'],1)
        for params in [{'status':'invalid'},{'page':0},{'window_days':0},{'window_days':91},{'project_id':'bad'}]:
            self.assertEqual(self.client.get(url,params).status_code,400)
        ProjectMember.objects.filter(project=self.other,member=self.member).update(is_active=False)
        self.assertEqual(self.client.get(url,{'status':'all'}).data['total'],1)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(url,{'status':'all'}).data['total'],0)

    def test_portfolio_guest_risks_do_not_leak_hidden_work(self):
        mid=self.create("Private workload",target_date=str(date.today()+timedelta(days=20)))
        Issue.objects.filter(id=self.issues[0].id).update(created_by=self.guest,state=self.done)
        Issue.objects.filter(id=self.issues[1].id).update(target_date=date.today()+timedelta(days=30))
        self.link(mid,self.issues[:2])
        url=f"/api/workspaces/{self.workspace.slug}/milestones/"
        self.assertEqual(self.client.get(url).data['total'],1)
        self.client.force_authenticate(self.guest)
        self.assertEqual(self.client.get(url).data['total'],0)
        row=self.client.get(url,{'status':'all'}).data['results'][0]
        self.assertTrue(row['visibility_limited'])
        self.assertEqual((row['total'],row['progress'],row['pending'],row['late_pending_work_items'],row['unassigned_work_items']),(1,100,0,0,0))
        self.assertEqual(row['risk_status'],'completed')
        self.project.guest_view_all_features=True;self.project.save()
        self.assertEqual(self.client.get(url).data['total'],1)
        WorkspaceMember.objects.filter(workspace=self.workspace,member=self.guest).update(is_active=False)
        self.assertEqual(self.client.get(url).status_code,403)

    def test_portfolio_risk_rules_timezone_and_archive(self):
        from datetime import datetime, timezone as dt_timezone
        from unittest.mock import patch
        from plane.db.models import IssueAssignee
        mid=self.create("Midnight target",target_date='2026-10-31')
        issue=self.issues[0]
        issue.target_date=date(2026,11,2);issue.save()
        self.link(mid,[issue])
        url=f"/api/workspaces/{self.workspace.slug}/milestones/"
        with patch('plane.app.views.milestone.timezone.now',return_value=datetime(2026,10,31,17,30,tzinfo=dt_timezone.utc)):
            result=self.client.get(url).data
            self.assertEqual(str(result['today']),'2026-11-01')
            row=result['results'][0]
            self.assertEqual((row['risk_status'],row['days_remaining'],row['late_pending_work_items'],row['unassigned_work_items']),('overdue',-1,1,1))
            Milestone.objects.filter(id=mid).update(target_date=date(2026,11,3))
            self.assertEqual(self.client.get(url,{'status':'due_soon'}).data['total'],1)
            self.assertEqual(self.client.get(url,{'status':'due_soon','window_days':1}).data['total'],0)
            Milestone.objects.filter(id=mid).update(target_date=None)
            self.assertEqual(self.client.get(url,{'status':'planning'}).data['total'],1)
            issue.target_date=None;issue.save()
            IssueAssignee.objects.create(project=self.project,issue=issue,assignee=self.member)
            row=self.client.get(url,{'status':'all'}).data['results'][0]
            self.assertEqual((row['risk_status'],row['unassigned_work_items'],row['undated_work_items']),('no_target',0,1))
            issue.state=self.done;issue.save()
            self.assertEqual(self.client.get(url).data['total'],0)
            self.assertEqual(self.client.get(url,{'status':'completed'}).data['total'],1)
            issue.state=self.cancelled;issue.save()
            row=self.client.get(url,{'status':'all'}).data['results'][0]
            self.assertEqual((row['risk_status'],row['progress'],row['at_risk']),('empty',0,False))
        self.project.archived_at=date.today();self.project.save()
        self.assertEqual(self.client.get(url,{'status':'all'}).data['total'],0)
