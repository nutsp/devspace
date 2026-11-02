from io import BytesIO
from openpyxl import load_workbook
from django.test import TestCase
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember, APIToken


class TimesheetTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create(email="time-owner@example.test", username="time-owner", display_name="สมาชิก")
        self.lead = User.objects.create(email="time-lead@example.test", username="time-lead", display_name="หัวหน้า")
        self.other = User.objects.create(email="time-other@example.test", username="time-other")
        self.workspace = Workspace.objects.create(name="Times", slug="times-test", owner=self.lead)
        for user, role in [(self.owner,15),(self.lead,20),(self.other,15)]:
            WorkspaceMember.objects.create(workspace=self.workspace, member=user, role=role)
        self.project = Project.objects.create(workspace=self.workspace,name="โปรเจกต์จริง",identifier="TIME",project_lead=self.lead)
        ProjectMember.objects.create(project=self.project,workspace=self.workspace,member=self.lead,role=20)
        ProjectMember.objects.create(project=self.project, workspace=self.workspace, member=self.owner,role=15)
        self.client=APIClient()
        self.client.force_authenticate(self.owner)
        self.base="/api/workspaces/times-test/timesheets/"
        self.sheet=self.client.post(self.base+"my/", {"week_start":"2026-10-28"},format="json").data
        self.url=self.base+str(self.sheet['id'])+"/"

    def act(self, action, **values):
        if action in ("approve", "return"): values.setdefault("project_id",str(self.project.id))
        result=self.client.post(self.url+action+"/",{"version":self.sheet['version'],**values},format="json")
        if result.status_code==200:self.sheet=result.data
        return result

    def add(self, **values):
        return self.act("entries",work_date="2026-10-26",project_id=str(self.project.id),activity="Development",duration_minutes=90,note="=SUM(A1)",**values)

    def test_submit_return_resubmit_approve_and_excel(self):
        self.assertEqual(self.sheet['week_start'],"2026-10-26")
        self.assertEqual(self.add().status_code,200)
        self.assertEqual(self.act('submit',reviewer_id=str(self.lead.id)).status_code,200)
        self.assertEqual(self.add().status_code,400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code,403)
        self.client.force_authenticate(self.lead)
        self.assertEqual(self.act('return',reason=' ').status_code,400)
        self.assertEqual(self.act('return',reason='แก้รายละเอียด').status_code,200)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.add().status_code,200)
        self.assertEqual(self.act('submit',reviewer_id=str(self.lead.id)).status_code,200)
        self.client.force_authenticate(self.lead)
        self.assertEqual(self.act('approve').status_code,200)
        self.assertEqual(self.sheet['total_minutes'],180)
        self.assertEqual(self.sheet['status'],'approved')
        response=self.client.get(self.url+'export/')
        self.assertEqual(response.status_code,200)
        book=load_workbook(BytesIO(response.content))
        self.assertEqual(book['Entries']['A1'].value,'Date')
        self.assertEqual(book['Weekly Timesheet']['A1'].value,'Member')
        self.assertEqual(book['History']['E1'].value,'Reason')
        self.assertEqual(book['Entries']['F4'].value,180)
        self.assertEqual(book['Entries']['G4'].value,3)
        self.assertEqual(book['Entries']['H2'].value,"'=SUM(A1)")
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.add().status_code,400)

    def test_validation_stale_versions_and_deleted_entry_totals(self):
        self.assertEqual(self.add().status_code,200)
        stale=self.client.post(self.url+'entries/',{'version':0},format='json')
        self.assertEqual(stale.status_code,409)
        self.assertEqual(self.act('entries',work_date='2026-11-02',project_id=str(self.project.id),activity='Development',duration_minutes=60).status_code,400)
        self.assertEqual(self.act('entries',work_date='2026-10-26',project_id=str(self.project.id),activity='Development',duration_minutes=1400).status_code,400)
        entry=self.sheet['entries'][0]['id']
        self.assertEqual(self.act(f'entries/{entry}/delete-entry').status_code,200)
        self.assertEqual(self.sheet['total_minutes'],0)
        self.assertEqual(self.act('submit',reviewer_id=str(self.lead.id)).status_code,400)

    def test_options_and_membership(self):
        self.assertEqual(self.client.get(self.base+'options/').status_code,200)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.base+'options/').data['projects'],[])
        self.client.force_authenticate(self.owner)
        WorkspaceMember.objects.filter(member=self.owner).update(is_active=False)
        self.assertEqual(self.client.get(self.url).status_code,403)

    def test_two_leads_scope_all_approvals_and_export(self):
        second=Project.objects.create(workspace=self.workspace,name="Second secret",identifier="TWO",project_lead=self.other)
        for user in [self.owner,self.other]:
            ProjectMember.objects.create(workspace=self.workspace,project=second,member=user,role=15)
        self.assertEqual(self.add().status_code,200)
        self.assertEqual(self.act('entries',work_date='2026-10-27',project_id=str(second.id),activity='QA',duration_minutes=60,note='SECOND PRIVATE').status_code,200)
        self.assertEqual(self.act('submit',reviewer_id=str(self.owner.id)).status_code,200)  # client cannot choose a reviewer
        self.assertEqual(len(self.sheet['project_reviews']),2)
        self.client.force_authenticate(self.lead)
        scoped=self.client.get(self.url).data
        self.assertEqual(scoped['total_minutes'],90)
        self.assertEqual(len(scoped['project_reviews']),1)
        self.assertNotIn('SECOND PRIVATE',str(scoped))
        mcp=APIClient();mcp.credentials(HTTP_X_API_KEY=APIToken.objects.create(workspace=self.workspace,user=self.lead).token)
        mcp_url=f'/api/v1/workspaces/times-test/mcp/timesheets/{self.sheet["id"]}/'
        self.assertEqual(mcp.get(mcp_url).status_code,200)
        self.assertNotIn('SECOND PRIVATE',str(mcp.get(mcp_url).data))
        self.assertEqual(mcp.get('/api/v1/workspaces/times-test/mcp/timesheets/',{'scope':'review','per_page':1}).data['results'][0]['total_minutes'],90)

        self.assertEqual(self.act('approve',project_id=str(second.id)).status_code,403)
        self.assertEqual(self.act('approve').status_code,200)
        self.assertEqual(self.sheet['status'],'submitted')
        self.assertEqual(self.sheet['review_status'],'approved')
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.act('approve').status_code,403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).data['total_minutes'],60)
        self.assertEqual(self.act('approve',project_id=str(second.id)).status_code,200)
        self.assertEqual(self.sheet['status'],'approved')
        book=load_workbook(BytesIO(self.client.get(self.url+'export/').content))
        self.assertEqual(book['Entries'].max_row,3)
        self.assertEqual(book['Project approvals'].max_row,2)
        self.assertNotIn('TIME',str(list(book['Project approvals'].values)))
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.url).data['total_minutes'],150)

    def test_missing_inactive_lead_and_admin_not_lead(self):
        self.add()
        self.project.project_lead=None;self.project.save()
        self.assertEqual(self.act('submit').status_code,400)
        self.project.project_lead=self.lead;self.project.save()
        ProjectMember.objects.filter(project=self.project,member=self.lead).update(is_active=False)
        self.assertEqual(self.act('submit').status_code,400)
        ProjectMember.objects.filter(project=self.project,member=self.lead).update(is_active=True)
        self.assertEqual(self.act('submit').status_code,200)
        WorkspaceMember.objects.filter(member=self.other).update(role=20)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code,403)
        self.assertEqual(self.act('approve').status_code,403)
        self.assertEqual(self.client.get(self.base+'options/').data['is_reviewer'],False)

    def test_lead_change_withdraw_and_resubmit_resets_approvals(self):
        self.add();self.act('submit')
        self.project.project_lead=self.other;self.project.save()
        ProjectMember.objects.create(workspace=self.workspace,project=self.project,member=self.other,role=15)
        self.client.force_authenticate(self.lead)
        self.assertEqual(self.client.get(self.url).status_code,403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code,200)
        self.assertEqual(self.act('return',reason='Please fix').status_code,200)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.act('submit').status_code,200)
        self.assertEqual(self.sheet['project_reviews'][0]['reviewer_id'],str(self.other.id))
        self.assertEqual(self.act('withdraw').status_code,200)
        self.assertEqual(self.sheet['status'],'draft')
        self.assertEqual(self.sheet['project_reviews'],[])
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).status_code,403)

    def test_legacy_migration_keeps_approved_status_and_routes_pending(self):
        from importlib import import_module
        from django.apps import apps
        from plane.db.models import Timesheet
        self.add()
        Timesheet.objects.filter(id=self.sheet['id']).update(status='approved',reviewer=self.lead)
        import_module('plane.db.migrations.0126_timesheet_project_reviews').backfill_reviews(apps,None)
        sheet=Timesheet.objects.get(id=self.sheet['id'])
        self.assertEqual(sheet.status,'approved')
        self.assertEqual(sheet.project_reviews[str(self.project.id)]['status'],'approved')
        self.assertEqual(sheet.project_reviews[str(self.project.id)]['reviewer_id'],str(self.lead.id))

    def test_return_after_partial_approval_requires_new_reviews_for_every_project(self):
        second=Project.objects.create(workspace=self.workspace,name="Second",identifier="TWO",project_lead=self.other)
        for user in [self.owner,self.other]:
            ProjectMember.objects.create(workspace=self.workspace,project=second,member=user,role=15)
        self.add()
        self.act('entries',work_date='2026-10-27',project_id=str(second.id),activity='QA',duration_minutes=60)
        self.act('submit')
        self.client.force_authenticate(self.lead);self.act('approve')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.act('return',project_id=str(second.id),reason='Correct time').status_code,200)
        self.assertEqual(self.sheet['status'],'returned')
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.act('submit').status_code,200)
        self.assertEqual([r['status'] for r in self.sheet['project_reviews']],['submitted','submitted'])

    def test_project_lead_can_submit_and_approve_own_time(self):
        self.project.project_lead=self.owner;self.project.save()
        self.add()
        options=self.client.get(self.base+'options/').data
        self.assertTrue(options['projects'][0]['lead_eligible'])
        self.assertEqual(self.act('submit').status_code,200)
        self.assertTrue(self.sheet['project_reviews'][0]['can_review'])
        self.assertEqual(len(self.client.get(self.base+'review/').data),1)
        self.assertEqual(self.act('approve').status_code,200)
        self.assertEqual(self.sheet['status'],'approved')
        self.assertEqual(self.sheet['project_reviews'][0]['reviewer_id'],str(self.owner.id))

    def test_self_lead_cannot_approve_another_leads_project(self):
        second=Project.objects.create(workspace=self.workspace,name='Self led',identifier='SELF',project_lead=self.owner)
        ProjectMember.objects.create(workspace=self.workspace,project=second,member=self.owner,role=15)
        self.add()
        self.act('entries',work_date='2026-10-27',project_id=str(second.id),activity='QA',duration_minutes=60)
        self.assertEqual(self.act('submit').status_code,200)
        self.assertEqual(self.act('approve').status_code,403)
        self.assertEqual(self.act('approve',project_id=str(second.id)).status_code,200)
        self.assertEqual(self.sheet['status'],'submitted')
        self.assertEqual(self.sheet['review_status'],'approved')
        self.client.force_authenticate(self.lead)
        self.assertEqual(self.act('approve').status_code,200)
        self.assertEqual(self.sheet['status'],'approved')
