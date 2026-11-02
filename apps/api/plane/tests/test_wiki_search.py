from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectPage, Page


@patch('plane.app.views.page.base.page_transaction.delay')
@patch('plane.app.views.page.base.track_page_version.delay')
class WikiSearchTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create(email='search-owner@example.test', username='search-owner')
        self.member = User.objects.create(email='search-member@example.test', username='search-member')
        self.guest = User.objects.create(email='search-guest@example.test', username='search-guest')
        self.outsider = User.objects.create(email='search-outside@example.test', username='search-outside')
        self.workspace = Workspace.objects.create(name='Wiki search', slug='search-test', owner=self.owner)
        for user, role in [(self.owner, 20), (self.member, 15), (self.guest, 5)]:
            WorkspaceMember.objects.create(workspace=self.workspace, member=user, role=role)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.base = '/api/workspaces/search-test/wiki/'
        self.collection = self.client.post(self.base+'collections/', {'name':'Engineering'}, format='json').data['id']
        self.other = self.client.post(self.base+'collections/', {'name':'Product'}, format='json').data['id']

    def document(self, name, body='<p>Searchable body</p>', parent=None, access=0, owner=None, collection=None):
        page = Page.objects.create(workspace=self.workspace, owned_by=owner or self.owner,
            name=name, description_html=body, parent=parent, access=access)
        ProjectPage.objects.create(workspace=self.workspace, project_id=collection or self.collection, page=page)
        return page

    def search(self, q, **params):
        response = self.client.get(self.base+'search/', {'q':q, **params})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_text_diagram_source_thai_and_breadcrumbs(self, *_):
        root = self.document('Architecture')
        parent = self.document('Decisions', parent=root)
        body = self.document('Release guide', '<p>คู่มือทดสอบ และ rollback policy</p><pre><code class="language-mermaid">flowchart LR\nReleaseGate--&gt;Done</code></pre><pre><code class="language-plantuml">@startuml\nAlice -&gt; Bob: ApprovalMarker\n@enduml</code></pre>', parent=parent)
        title = self.document('Rollback policy', '<p>Title match</p>')
        self.assertEqual(self.search('คู่มือทดสอบ')['results'][0]['id'], str(body.id))
        for term in ['ReleaseGate', 'ApprovalMarker']:
            hit = self.search(term)['results'][0]
            self.assertEqual(hit['id'], str(body.id))
            self.assertEqual(hit['path'], ['Engineering', 'Architecture', 'Decisions'])
            self.assertIn(term, hit['snippet'])
            self.assertEqual(hit['match'], 'content')
            self.assertNotIn('description_html', hit)
        self.assertEqual(self.search('ROLLBACK policy')['results'][0]['id'], str(title.id))
        self.assertEqual(self.search('Release policy')['results'][0]['id'], str(body.id))
        self.assertEqual(self.search('missingterm')['count'], 0)

    def test_private_ancestors_cycles_archive_and_deleted_links_do_not_leak(self, *_):
        public = self.document('Public', '<p>SecretNeedle</p>')
        private = self.document('Private ancestor label', access=1)
        self.document('Hidden child', '<p>SecretNeedle</p>', parent=private, owner=self.member)
        self.document('Hidden private', '<p>SecretNeedle</p>', access=1)
        archived = self.document('Archived', '<p>SecretNeedle</p>')
        Page.objects.filter(id=archived.id).update(archived_at=timezone.now())
        self.document('Archived child', '<p>SecretNeedle</p>', parent=archived)
        deleted = self.document('Detached', '<p>SecretNeedle</p>')
        ProjectPage.objects.filter(page=deleted).update(deleted_at=timezone.now())
        work = Project.objects.create(workspace=self.workspace, name='Work', identifier='WRK', is_wiki_collection=False)
        ProjectPage.objects.create(workspace=self.workspace, project=work, page=deleted)
        gone = Project.objects.create(workspace=self.workspace, name='Deleted collection', identifier='GONE', is_wiki_collection=True)
        self.document('Deleted collection page', '<p>SecretNeedle</p>', collection=gone.id)
        Project.objects.filter(id=gone.id).update(deleted_at=timezone.now())
        cycle = self.document('Cycle', '<p>SecretNeedle</p>')
        Page.objects.filter(id=cycle.id).update(parent=cycle)
        for user in [self.member, self.guest]:
            self.client.force_authenticate(user)
            result = self.search('SecretNeedle')
            self.assertEqual(result['count'], 1, result)
            self.assertEqual([row['id'] for row in result['results']], [str(public.id)])
            self.assertNotIn('Private ancestor label', str(result))
        membership = WorkspaceMember.objects.get(workspace=self.workspace, member=self.member)
        membership.is_active=False; membership.save()
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(self.base+'search/', {'q':'SecretNeedle'}).status_code, 403)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.base+'search/', {'q':'SecretNeedle'}).status_code, 403)

    def test_collection_workspace_scope_and_pagination(self, *_):
        expected = {str(self.document(f'Doc {i:02}', '<p>PageMarker</p>').id) for i in range(30)}
        self.document('Other collection', '<p>PageMarker</p>', collection=self.other)
        response = self.search('PageMarker', collection_id=self.collection)
        second = self.search('PageMarker', collection_id=self.collection, page=2)
        self.assertEqual(response['count'], 30)
        self.assertEqual(len(response['results']), 25)
        self.assertEqual(len(second['results']), 5)
        ids=[row['id'] for row in response['results']+second['results']]
        self.assertEqual(set(ids), expected); self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(self.search('PageMarker')['count'], 31)
        self.assertEqual(self.client.get('/api/workspaces/elsewhere/wiki/search/', {'q':'PageMarker'}).status_code, 403)
        self.assertEqual(self.client.get(self.base+'search/', {'q':'PageMarker','collection_id':'00000000-0000-0000-0000-000000000000'}).status_code, 404)

    def test_native_save_updates_search_and_literal_snippets(self, *_):
        page = self.document('Operations', '<p>BeforeSaveNeedle</p>')
        self.assertEqual(self.search('BeforeSaveNeedle')['count'], 1)
        response=self.client.patch(f'/api/workspaces/search-test/projects/{self.collection}/pages/{page.id}/description/',
            {'description_html':'<p>&lt;script&gt;AfterSaveNeedle&lt;/script&gt; 100% _literal_</p>'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.search('BeforeSaveNeedle')['count'], 0)
        hit=self.search('AfterSaveNeedle')['results'][0]
        self.assertIn('<script>AfterSaveNeedle</script>', hit['snippet'])
        self.assertEqual(self.search('%')['count'], 1)
        self.assertEqual(self.search('_literal_')['count'], 1)
        self.assertEqual(self.search('%notpresent%')['count'], 0)
        for params in [{'q':' '},{'q':'x'*201},{'q':'valid','page':0},{'q':'valid','collection_id':'invalid'},{'q':'valid','review':'invalid'}]:
            self.assertEqual(self.client.get(self.base+'search/',params).status_code,400)

    def test_review_filter_and_read_only_behavior(self, *_):
        self.document('Unassigned', '<p>ReviewMarker</p>')
        page=self.document('Overdue', '<p>ReviewMarker</p>')
        page.wiki_review={'owner_id':str(self.owner.id),'due_date':'2000-01-01'}
        page.save(update_fields=['wiki_review'])
        self.assertEqual(self.search('ReviewMarker', review='attention')['count'],1)
        self.assertEqual(self.search('ReviewMarker', review='unassigned')['count'],1)
        before=ProjectPage.objects.count()
        response=self.client.get(self.base+'search/', {'q':'ReviewMarker'})
        self.assertEqual(response['Cache-Control'],'no-store')
        self.assertEqual(ProjectPage.objects.count(),before)
