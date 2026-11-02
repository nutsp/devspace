from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Page, ProjectPage, APIToken, Project, ProjectMember
from plane.app.views.wiki_review import workspace_today


@patch('plane.app.views.page.base.page_transaction.delay')
class WikiReviewTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create(email='wiki-review-admin@example.test',username='wiki-review-admin',display_name='Admin')
        self.editor = User.objects.create(email='wiki-review-editor@example.test',username='wiki-review-editor',display_name='Editor')
        self.other = User.objects.create(email='wiki-review-other@example.test',username='wiki-review-other',display_name='Other')
        self.guest = User.objects.create(email='wiki-review-guest@example.test',username='wiki-review-guest')
        self.outsider = User.objects.create(email='wiki-review-outsider@example.test',username='wiki-review-outsider')
        self.workspace = Workspace.objects.create(name='Wiki review',slug='wiki-review-test',owner=self.admin)
        for user,role in [(self.admin,20),(self.editor,15),(self.other,15),(self.guest,5)]:
            WorkspaceMember.objects.create(workspace=self.workspace,member=user,role=role)
        self.client=APIClient();self.client.force_authenticate(self.admin)
        self.base='/api/workspaces/wiki-review-test/wiki/'
        self.collection=self.client.post(self.base+'collections/',{'name':'Engineering'},format='json').data['id']
        self.pages=f'/api/workspaces/wiki-review-test/projects/{self.collection}/pages/'
        self.today=workspace_today(self.workspace)

    def create(self,**kwargs):
        result=self.client.post(self.pages,{'name':'Review document','wiki_template':'prd',**kwargs},format='json')
        self.assertEqual(result.status_code,201,result.data)
        return Page.objects.get(id=result.data['id'])

    def url(self,page):
        return self.base+f'collections/{self.collection}/pages/{page.id}/review/'

    def setup_review(self,page,owner=None,days=-1):
        current=self.client.get(self.url(page)).data
        return self.client.patch(self.url(page),{'revision':current['revision'],'owner_id':str((owner or self.editor).id),'due_date':(self.today+timedelta(days=days)).isoformat(),'interval_days':30},format='json')

    def test_templates_use_existing_page_create_and_reject_invalid_overwrites(self,_task):
        templates=self.client.get(self.base+'templates/').data
        self.assertEqual({t['key'] for t in templates},{'prd','technical-design','adr','runbook'})
        for template in templates:
            page=self.create(wiki_template=template['key'])
            self.assertIn(template['headings'][0],page.description_html)
            self.assertEqual(page.owned_by_id,self.admin.id)
        count=Page.objects.count()
        self.assertEqual(self.client.post(self.pages,{'name':'Invalid','wiki_template':'bad'},format='json').status_code,400)
        self.assertEqual(Page.objects.count(),count)
        self.assertEqual(self.client.patch(self.pages+f'{page.id}/',{'wiki_template':'prd'},format='json').status_code,400)
        work=Project.objects.create(workspace=self.workspace,name='Work',identifier='WORK')
        ProjectMember.objects.create(project=work,workspace=self.workspace,member=self.admin,role=20)
        self.assertEqual(self.client.post(f'/api/workspaces/wiki-review-test/projects/{work.id}/pages/',{'name':'Work','wiki_template':'prd'},format='json').status_code,400)

    def test_owner_due_complete_saved_content_and_next_review(self,_task):
        page=self.create()
        configured=self.setup_review(page)
        self.assertEqual(configured.status_code,200,configured.data)
        self.assertEqual(configured.data['status'],'overdue')
        self.client.force_authenticate(self.other)
        data=self.client.get(self.url(page)).data
        self.assertFalse(data['can_complete'])
        self.assertEqual(self.client.post(self.url(page),{'revision':data['revision'],'content_hash':data['content_hash']},format='json').status_code,403)
        self.client.force_authenticate(self.editor)
        data=self.client.get(self.url(page)).data
        self.assertTrue(data['can_complete'])
        result=self.client.post(self.url(page),{'revision':data['revision'],'content_hash':data['content_hash']},format='json')
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['status'],'reviewed')
        self.assertEqual(result.data['due_date'],(self.today+timedelta(days=30)).isoformat())
        self.assertEqual(result.data['reviewed_by'],str(self.editor.id))
        page.refresh_from_db();self.assertEqual(page.owned_by_id,self.admin.id)
        self.assertIn('Problem and context',page.description_html)
        Page.objects.filter(id=page.id).update(description_html='<p>Changed saved content</p>')
        self.assertEqual(self.client.get(self.url(page)).data['status'],'changed')

    def test_stale_content_and_settings_conflict_and_invalid_dates(self,_task):
        page=self.create();data=self.setup_review(page).data
        self.assertEqual(self.client.patch(self.url(page),{'revision':'0','owner_id':str(self.editor.id),'due_date':None},format='json').status_code,409)
        Page.objects.filter(id=page.id).update(description_html='<p>Concurrent edit</p>')
        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.post(self.url(page),{'revision':data['revision'],'content_hash':data['content_hash']},format='json').status_code,409)
        fresh=self.client.get(self.url(page)).data
        self.assertEqual(self.client.post(self.url(page),{'revision':fresh['revision'],'content_hash':fresh['content_hash'],'next_due_date':self.today.isoformat()},format='json').status_code,400)

    def test_private_ancestry_guests_inactive_owners_and_locked_documents(self,_task):
        parent=self.create(access=1)
        child=self.create(parent=str(parent.id),access=1)
        self.assertEqual(self.setup_review(child,owner=self.editor).status_code,400)
        self.assertEqual(self.setup_review(child,owner=self.admin).status_code,200)
        self.client.force_authenticate(self.editor)
        self.assertEqual(self.client.get(self.url(child)).status_code,403)
        self.assertNotIn(str(child.id),str(self.client.get(self.base+'pages/').data))
        self.client.force_authenticate(self.admin)
        public=self.create()
        WorkspaceMember.objects.filter(member=self.editor).update(is_active=False)
        self.assertEqual(self.setup_review(public).status_code,404)
        self.client.force_authenticate(self.guest)
        self.assertEqual(self.client.patch(self.url(public),{},format='json').status_code,403)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.url(public)).status_code,403)
        self.client.force_authenticate(self.admin)
        Page.objects.filter(id=public.id).update(is_locked=True)
        self.assertEqual(self.client.patch(self.url(public),{},format='json').status_code,403)

    def test_list_and_readonly_mcp_include_review_without_writes(self,_task):
        page=self.create();self.setup_review(page,owner=self.admin,days=3)
        row=next(row for row in self.client.get(self.base+'pages/').data if row['id']==str(page.id))
        self.assertEqual(row['review']['status'],'due_soon')
        client=APIClient();token=APIToken.objects.create(workspace=self.workspace,user=self.admin);client.credentials(HTTP_X_API_KEY=token.token)
        url=f'/api/v1/workspaces/wiki-review-test/mcp/wiki/pages/{page.id}/'
        self.assertEqual(client.get(url).data['review']['owner_id'],str(self.admin.id))
        page.refresh_from_db();before=page.wiki_review.copy()
        self.assertEqual(client.post(url,{},format='json').status_code,405)
        page.refresh_from_db();self.assertEqual(page.wiki_review,before)

    def test_stale_editor_and_title_saves_cannot_overwrite_review_metadata(self,_task):
        from plane.app.serializers.page import PageBinaryUpdateSerializer
        page=self.create()
        stale=Page.objects.get(id=page.id)
        data=self.setup_review(page).data
        serializer=PageBinaryUpdateSerializer(stale,data={'description_html':'<p>Saved concurrently</p>'},partial=True)
        self.assertTrue(serializer.is_valid(),serializer.errors)
        serializer.save()
        page.refresh_from_db()
        self.assertEqual(page.wiki_review['revision'],data['revision'])
        self.assertEqual(page.wiki_review['owner_id'],str(self.editor.id))
        self.assertIn('Saved concurrently',page.description_html)
        old=Page.objects.get(id=page.id)
        fresh=self.client.get(self.url(page)).data
        self.client.post(self.url(page),{'revision':fresh['revision'],'content_hash':fresh['content_hash']},format='json')
        old.name='A new title';old.save()
        page.refresh_from_db();self.assertIsNotNone(page.wiki_review.get('reviewed_at'))
