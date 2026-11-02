from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Project, ProjectMember, Page
from plane.app.serializers.project import ProjectSerializer


class WorkspaceWikiTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create(email="wiki-owner@example.test", username="wiki-owner")
        self.member = User.objects.create(email="wiki-member@example.test", username="wiki-member")
        self.outsider = User.objects.create(email="wiki-outsider@example.test", username="wiki-outsider")
        self.workspace = Workspace.objects.create(name="Wiki test", slug="wiki-test", owner=self.owner)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.owner, role=20)
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.member, role=15)
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.base = "/api/workspaces/wiki-test/wiki/"

    def collection(self, name="Engineering"):
        response = self.client.post(self.base + "collections/", {"name": name}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def test_collection_is_persistent_and_project_api_cannot_convert_work(self):
        pk = self.collection()
        self.assertTrue(Project.objects.get(id=pk).is_wiki_collection)
        self.assertEqual(ProjectMember.objects.filter(project_id=pk).count(), 2)
        self.assertEqual(self.client.get(self.base + "collections/").data[0]["name"], "Engineering")
        response = self.client.patch(self.base + f"collections/{pk}/", {"name": "Product"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(Project.objects.get(id=pk).name, "Product")
        self.assertTrue(ProjectSerializer().fields["is_wiki_collection"].read_only)

    def test_guest_outsider_and_invalid_name_cannot_create(self):
        self.assertEqual(self.client.post(self.base + "collections/", {"name": " "}, format="json").status_code, 400)
        WorkspaceMember.objects.filter(member=self.member).update(role=5)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.post(self.base + "collections/", {"name": "Denied"}, format="json").status_code, 403)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.base + "collections/").status_code, 403)

    def test_duplicate_collection_does_not_leave_members_or_projects(self):
        self.collection()
        response = self.client.post(self.base + "collections/", {"name": "Engineering"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Project.objects.filter(workspace=self.workspace).count(), 1)

    @patch("plane.app.views.page.base.page_transaction.delay")
    @patch("plane.app.views.page.base.track_page_version.delay")
    def test_existing_pages_pipeline_creates_edits_and_keeps_private_pages_private(self, _versions, _transaction):
        pk = self.collection()
        base = f"/api/workspaces/wiki-test/projects/{pk}/pages/"
        response = self.client.post(base, {"name": "คู่มือทีม", "access": 0}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        page_id = response.data["id"]
        self.assertEqual(self.client.patch(base + f"{page_id}/", {"name": "คู่มือที่แก้ไข"}, format="json").status_code, 200)
        response = self.client.patch(base + f"{page_id}/description/", {"description_html": "<p>เนื้อหาที่บันทึกจริง</p>"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("เนื้อหาที่บันทึกจริง", Page.objects.get(id=page_id).description_html)
        private = self.client.post(base, {"name": "Private", "access": 1}, format="json").data
        self.client.force_authenticate(self.member)
        results = self.client.get(self.base + "pages/").data
        self.assertEqual([p["name"] for p in results], ["คู่มือที่แก้ไข"])
        self.assertEqual(self.client.get(base + f"{private['id']}/").status_code, 403)
        # Removed workspace membership must override a stale collection-project grant.
        WorkspaceMember.objects.filter(member=self.member).update(is_active=False)
        self.assertEqual(self.client.get(base + f"{page_id}/").status_code, 403)
        self.assertEqual(self.client.get(self.base + "pages/").status_code, 403)
        WorkspaceMember.objects.filter(member=self.owner).update(role=5)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.patch(base + f"{private['id']}/", {"name": "Denied"}, format="json").status_code, 403)

    def test_new_member_joins_collection_with_workspace_role(self):
        pk = self.collection()
        WorkspaceMember.objects.create(workspace=self.workspace, member=self.outsider, role=5)
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get(self.base + "collections/").status_code, 200)
        self.assertEqual(ProjectMember.objects.get(project_id=pk, member=self.outsider).role, 5)

    @patch("plane.app.views.page.base.page_transaction.delay")
    @patch("plane.app.views.page.base.track_page_version.delay")
    def test_nested_pages_cycles_and_private_ancestors(self, _versions, _transaction):
        pk = self.collection()
        base = f"/api/workspaces/wiki-test/projects/{pk}/pages/"
        def create(name, parent=None, access=0):
            response=self.client.post(base,{'name':name,'access':access,'parent':parent},format='json')
            self.assertEqual(response.status_code,201,response.data)
            return str(response.data['id'])
        root=create('Root')
        child=create('Child',root)
        grand=create('Grandchild',child)
        self.assertEqual(self.client.get(base+f'{grand}/').status_code,200)
        self.assertEqual(self.client.patch(base+f'{root}/',{'parent':grand},format='json').status_code,400)
        self.assertEqual(self.client.patch(base+f'{child}/',{'parent':child},format='json').status_code,400)
        rows=self.client.get(self.base+'pages/').data
        self.assertEqual(next(p for p in rows if p['id']==child)['parent_id'],root)
        private=create('Private',access=1)
        secret=create('Private child',private,1)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get(base+f'{secret}/').status_code,403)
        self.assertNotIn(secret,[p['id'] for p in self.client.get(self.base+'pages/').data])

    def wiki_rows(self):
        return self.client.get(self.base+'pages/').data

    def move(self, collection, page, target=None, position='inside', revision=None):
        revision = revision or next(p['tree_revision'] for p in self.wiki_rows() if p['id']==str(page))
        return self.client.post(self.base+f'collections/{collection}/pages/{page}/move/',
            {'target_id':str(target) if target else None,'position':position,'revision':revision},format='json')

    @patch("plane.app.views.page.base.page_transaction.delay")
    @patch("plane.app.views.page.base.track_page_version.delay")
    def test_drag_reorders_reparents_and_keeps_subtree_content(self, _versions, _transaction):
        pk=self.collection()
        base=f'/api/workspaces/wiki-test/projects/{pk}/pages/'
        def create(name,parent=None):
            return str(self.client.post(base,{'name':name,'parent':parent,'access':0},format='json').data['id'])
        a,b,c=create('A'),create('B'),create('C')
        child=create('Child',a)
        Page.objects.filter(id=child).update(description_html='<p>Keep content</p>',description_binary=b'keep')
        self.assertEqual(self.move(pk,c,a,'before').status_code,200)
        self.assertEqual([p['id'] for p in self.wiki_rows() if not p['parent_id']],[c,a,b])
        self.assertEqual(self.move(pk,a,b).status_code,200)
        self.assertEqual(str(Page.objects.get(id=a).parent_id),b)
        self.assertEqual(str(Page.objects.get(id=child).parent_id),a)
        saved=Page.objects.get(id=child)
        self.assertEqual(saved.description_html,'<p>Keep content</p>')
        self.assertEqual(bytes(saved.description_binary),b'keep')
        self.assertEqual(self.move(pk,b,child).status_code,400)
        self.assertEqual(self.move(pk,a,position='root').status_code,200)
        self.assertIsNone(Page.objects.get(id=a).parent_id)
        self.assertEqual([p['id'] for p in self.wiki_rows() if not p['parent_id']],[c,b,a])
        revision=next(p['tree_revision'] for p in self.wiki_rows() if p['id']==a)
        self.assertEqual(self.move(pk,b,c,'before').status_code,200)
        self.assertEqual(self.move(pk,a,c,'after',revision).status_code,409)

    @patch("plane.app.views.page.base.page_transaction.delay")
    @patch("plane.app.views.page.base.track_page_version.delay")
    def test_drag_permissions_private_locked_and_collection_boundaries(self, _versions, _transaction):
        pk=self.collection()
        base=f'/api/workspaces/wiki-test/projects/{pk}/pages/'
        a=str(self.client.post(base,{'name':'Public','access':0},format='json').data['id'])
        secret=str(self.client.post(base,{'name':'Secret','access':1},format='json').data['id'])
        self.assertEqual(self.move(pk,a,secret).status_code,400)
        other=self.collection('Other')
        target=str(self.client.post(f'/api/workspaces/wiki-test/projects/{other}/pages/',{'name':'Other','access':0},format='json').data['id'])
        self.assertEqual(self.move(pk,a,target).status_code,403)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.move(pk,a,secret).status_code,403)
        WorkspaceMember.objects.filter(member=self.member).update(role=5)
        self.assertEqual(self.move(pk,a,position='root').status_code,403)
        self.client.force_authenticate(self.owner)
        Page.objects.filter(id=a).update(is_locked=True)
        self.assertEqual(self.move(pk,a,position='root').status_code,400)

    @patch("plane.app.views.page.base.page_transaction.delay")
    @patch("plane.app.views.page.base.track_page_version.delay")
    def test_new_page_appends_after_reordered_siblings(self, _versions, _transaction):
        pk=self.collection()
        base=f'/api/workspaces/wiki-test/projects/{pk}/pages/'
        first=self.client.post(base,{'name':'Old','access':0},format='json').data['id']
        Page.objects.filter(id=first).update(sort_order=1000000)
        new=self.client.post(base,{'name':'New','access':0},format='json')
        self.assertEqual(new.status_code,201)
        self.assertGreater(Page.objects.get(id=new.data['id']).sort_order,1000000)
