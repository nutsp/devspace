from django.test import TestCase
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Project, Page, ProjectPage
from plane.app.views.wiki_graph import saved_page_links


class WikiGraphTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create(email='graph-owner@example.test', username='graph-owner')
        self.member = User.objects.create(email='graph-member@example.test', username='graph-member')
        self.workspace = Workspace.objects.create(name='Graph', slug='graph-test', owner=self.owner)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.owner, role=20)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.member, role=15)
        self.collection = Project.objects.create(workspace=self.workspace, name='Engineering', identifier='GRAPH', is_wiki_collection=True)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.url = '/api/workspaces/graph-test/wiki/graph/'

    def page(self, name, **kwargs):
        page = Page.objects.create(workspace=self.workspace, owned_by=self.owner, name=name, **kwargs)
        ProjectPage.objects.create(project=self.collection, page=page, workspace=self.workspace)
        return page

    def link(self, source, target):
        source.description_html = f'<p><a href="/graph-test/wiki/{self.collection.id}/pages/{target.id}/">Link</a></p>'
        source.save()

    def test_saved_links_backlinks_depth_and_removal(self):
        a, b, c = self.page('A'), self.page('B'), self.page('C')
        self.link(a, b)
        self.link(b, c)
        data = self.client.get(self.url, {'page_id': str(a.id), 'include_hierarchy': 'false'}).data
        self.assertEqual(len(data['nodes']), 2)
        self.assertEqual(data['outgoing'][0]['id'], str(b.id))
        data = self.client.get(self.url, {'page_id': str(a.id), 'depth': 2}).data
        self.assertEqual(len(data['nodes']), 3)
        data = self.client.get(self.url, {'page_id': str(b.id)}).data
        self.assertEqual(data['incoming'][0]['id'], str(a.id))
        a.description_html = '<p>Removed link</p>'
        a.save()
        self.assertEqual(self.client.get(self.url, {'page_id': str(b.id)}).data['incoming'], [])

    def test_private_ancestor_and_hidden_links_never_leak(self):
        public = self.page('Public')
        private = self.page('Secret', access=1)
        child = self.page('Secret child', parent=private)
        self.link(child, public)
        self.link(public, private)
        self.client.force_authenticate(self.member)
        data = self.client.get(self.url).data
        self.assertEqual([n['name'] for n in data['nodes']], ['Public'])
        self.assertEqual(data['edges'], [])
        self.assertEqual(data['total_nodes'], 1)
        self.assertEqual(self.client.get(self.url, {'page_id': str(private.id)}).status_code, 404)
        WorkspaceMember.objects.filter(member=self.member).delete()
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_hierarchy_validation_empty_collection_and_parser(self):
        a = self.page('Parent')
        self.page('Child', parent=a)
        self.assertEqual(len(self.client.get(self.url).data['edges']), 1)
        self.assertEqual(self.client.get(self.url, {'include_hierarchy': 'false'}).data['edges'], [])
        self.assertEqual(self.client.get(self.url, {'depth': 3}).status_code, 400)
        href = f'/graph-test/wiki/{self.collection.id}/pages/{a.id}/'
        html = f'<a href="{href}">A</a><a href="{href}">Duplicate</a><a href="https://evil.test{href}">External</a>'
        self.assertEqual(saved_page_links(html, 'graph-test', 'testserver'), {(str(self.collection.id), str(a.id))})
        self.assertEqual(saved_page_links('<a href="http://[">Invalid</a>', 'graph-test', 'testserver'), set())

    def test_cross_collection_links_rename_and_empty_scope(self):
        a, b = self.page('Source'), self.page('Target')
        other = Project.objects.create(workspace=self.workspace, name='Product', identifier='PROD', is_wiki_collection=True)
        ProjectPage.objects.filter(page=b).update(project=other)
        a.description_html = f'<a href="/graph-test/wiki/{other.id}/pages/{b.id}/">Old title</a>'
        a.save()
        b.name = 'Renamed target'
        b.save()
        data = self.client.get(self.url, {'page_id': str(a.id)}).data
        self.assertEqual(data['outgoing'][0]['name'], 'Renamed target')
        scoped = self.client.get(self.url, {'collection_id': str(self.collection.id)}).data
        self.assertEqual(len(scoped['nodes']), 1)
        self.assertEqual(scoped['edges'], [])
        from django.utils import timezone
        b.archived_at = timezone.now()
        b.save()
        self.assertEqual(self.client.get(self.url, {'page_id': str(a.id)}).data['outgoing'], [])
        self.assertEqual(self.client.get(self.url, {'collection_id': str(other.id)}).data['nodes'], [])
