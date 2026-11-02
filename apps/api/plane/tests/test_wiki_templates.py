from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, WikiTemplate, Page


@patch('plane.app.views.page.base.page_transaction.delay')
@patch('plane.db.mixins.soft_delete_related_objects.delay')
class WikiTemplatesTests(TestCase):
    def setUp(self):
        self.admin=User.objects.create(email='template-admin@example.test',username='template-admin')
        self.member=User.objects.create(email='template-member@example.test',username='template-member')
        self.guest=User.objects.create(email='template-guest@example.test',username='template-guest')
        self.workspace=Workspace.objects.create(name='Templates',slug='templates-test',owner=self.admin)
        for user,role in [(self.admin,20),(self.member,15),(self.guest,5)]:
            WorkspaceMember.objects.create(workspace=self.workspace,member=user,role=role)
        self.client=APIClient();self.client.force_authenticate(self.admin)
        self.base='/api/workspaces/templates-test/wiki/'
        self.url=self.base+'templates/'
        cid=self.client.post(self.base+'collections/',{'name':'Engineering'},format='json').data['id']
        self.pages=f'/api/workspaces/templates-test/projects/{cid}/pages/'

    def create(self):
        result=self.client.post(self.url,{'name':'Custom','description':'Reusable','content_html':'<h2>Original section</h2><p>Original body</p>'},format='json')
        self.assertEqual(result.status_code,201,result.data)
        return result.data

    def test_seeded_defaults_and_admin_crud_snapshot_independence(self,*mocks):
        self.assertEqual({t['key'] for t in self.client.get(self.url).data},{'prd','technical-design','adr','runbook'})
        row=self.create();detail=self.url+row['id']+'/'
        created=self.client.post(self.pages,{'name':'Snapshot','wiki_template':row['key']},format='json')
        self.assertEqual(created.status_code,201,created.data)
        page=Page.objects.get(id=created.data['id']);original=page.description_html
        updated=self.client.patch(detail,{'version':row['version'],'name':'Updated','content_html':'<h2>Updated section</h2>'},format='json')
        self.assertEqual(updated.status_code,200,updated.data)
        self.assertNotEqual(updated.data['version'],row['version'])
        page.refresh_from_db();self.assertEqual(page.description_html,original)
        next_page=self.client.post(self.pages,{'name':'New snapshot','wiki_template':row['key']},format='json')
        self.assertIn('Updated section',Page.objects.get(id=next_page.data['id']).description_html)
        self.assertEqual(self.client.delete(detail,{'version':updated.data['version']},format='json').status_code,204)
        self.assertEqual(self.client.get(detail).status_code,404)
        self.assertEqual(self.client.post(self.pages,{'name':'Unavailable','wiki_template':row['key']},format='json').status_code,400)
        page.refresh_from_db();self.assertEqual(page.description_html,original)

    def test_duplicate_inactive_toggle_and_stale_versions(self,*mocks):
        row=self.create();url=self.url+row['id']+'/'
        copy=self.client.post(url,{'version':row['version']},format='json')
        self.assertEqual(copy.status_code,201,copy.data)
        clone=copy.data;self.assertNotEqual(clone['key'],row['key']);self.assertFalse(clone['is_active'])
        self.assertEqual(clone['content_html'],row['content_html'])
        self.assertNotIn(clone['key'],[r['key'] for r in self.client.get(self.url).data])
        self.assertEqual(self.client.post(self.pages,{'name':'Inactive','wiki_template':clone['key']},format='json').status_code,400)
        active=self.client.patch(self.url+clone['id']+'/',{'version':clone['version'],'is_active':True},format='json').data
        self.assertIn(clone['key'],[r['key'] for r in self.client.get(self.url).data])
        self.assertEqual(self.client.patch(self.url+clone['id']+'/',{'version':clone['version'],'name':'Stale'},format='json').status_code,409)
        self.assertEqual(self.client.delete(self.url+clone['id']+'/',{'version':clone['version']},format='json').status_code,409)
        self.assertEqual(self.client.post(self.url+clone['id']+'/',{'version':clone['version']},format='json').status_code,409)
        self.assertEqual(self.client.get(self.url+clone['id']+'/').data['version'],active['version'])

    def test_members_can_use_but_cannot_manage_cross_workspace_or_unsafe_html(self,*mocks):
        row=self.create();detail=self.url+row['id']+'/'
        for user in [self.member,self.guest]:
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url).status_code,200)
            self.assertEqual(self.client.get(self.url,{'manage':'1'}).status_code,403)
            self.assertEqual(self.client.get(detail).status_code,403)
            self.assertEqual(self.client.post(self.url,{'name':'Denied'},format='json').status_code,403)
            self.assertEqual(self.client.patch(detail,{'version':row['version'],'name':'Denied'},format='json').status_code,403)
            self.assertEqual(self.client.delete(detail,{'version':row['version']},format='json').status_code,403)
            self.assertEqual(self.client.post(detail,{'version':row['version']},format='json').status_code,403)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.post(self.pages,{'name':'Member page','wiki_template':row['key']},format='json').status_code,201)
        self.client.force_authenticate(self.admin)
        other=Workspace.objects.create(name='Other',slug='templates-other',owner=self.admin)
        WorkspaceMember.objects.create(workspace=other,member=self.admin,role=20)
        self.assertEqual(self.client.get('/api/workspaces/templates-other/wiki/templates/'+row['id']+'/').status_code,404)
        sanitized=self.client.post(self.url,{'name':'Sanitized','content_html':'<script>alert(1)</script>'},format='json')
        self.assertEqual(sanitized.status_code,201)
        self.assertNotIn('<script',sanitized.data['content_html'].lower())
        self.assertEqual(len(self.client.get('/api/workspaces/templates-other/wiki/templates/').data),4)
