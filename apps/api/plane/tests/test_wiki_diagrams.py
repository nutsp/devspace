from unittest.mock import MagicMock, patch
import requests
from django.test import TestCase
from rest_framework.test import APIClient
from plane.db.models import User, Workspace, WorkspaceMember, Page


class WikiDiagramsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create(email='diagram@example.test', username='diagram')
        workspace = Workspace.objects.create(name='Diagrams', slug='diagram-test', owner=self.user)
        self.membership = WorkspaceMember.objects.create(workspace=workspace, member=self.user, role=15)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = '/api/workspaces/diagram-test/wiki/diagrams/plantuml/'
        self.source = '@startuml\nAlice -> Bob: Hello\n@enduml'

    def renderer(self, post, status=200, headers=None, content=b'<svg xmlns="http://www.w3.org/2000/svg"/>'):
        response = MagicMock()
        response.status_code = status
        response.headers = headers or {'Content-Type': 'image/svg+xml'}
        response.iter_content.return_value = [content]
        post.return_value.__enter__.return_value = response
        return response

    @patch('plane.app.views.wiki_diagrams.requests.post')
    def test_preview_is_scoped_and_stateless(self, post):
        self.renderer(post)
        before = Page.objects.count()
        response = self.client.post(self.url, {'source': self.source, 'dark': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['image'].startswith('data:image/svg+xml;base64,'))
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(Page.objects.count(), before)
        self.assertIn(b'!theme cyborg', post.call_args.kwargs['data'])
        self.assertEqual(post.call_args.args[0], 'http://plantuml:8080/svg/')
        self.assertFalse(post.call_args.kwargs['allow_redirects'])
        self.client.force_authenticate(None)
        self.assertIn(self.client.post(self.url, {'source': self.source}, format='json').status_code, [401, 403])
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post(self.url.replace('diagram-test', 'other'), {'source': self.source}, format='json').status_code, 403)
        self.membership.is_active = False
        self.membership.save()
        self.assertEqual(self.client.post(self.url, {'source': self.source}, format='json').status_code, 403)
        self.assertEqual(post.call_count, 1)

    @patch('plane.app.views.wiki_diagrams.requests.post')
    def test_invalid_and_external_sources_are_rejected_before_rendering(self, post):
        sources = ['', 'x' * 20001, 'Alice -> Bob', self.source + '\n' + self.source,
            '@startuml\n!include https://example.test/private\n@enduml',
            '@startuml\n!include /etc/passwd\n@enduml',
            '@startuml\n!theme plain from https://example.test\n@enduml',
            '@startuml\nAlice: %getenv("SECRET")\n@enduml']
        for source in sources:
            self.assertEqual(self.client.post(self.url, {'source': source}, format='json').status_code, 400)
        self.assertEqual(self.client.post(self.url, {'source': self.source, 'dark': 'invalid'}, format='json').status_code, 400)
        post.assert_not_called()

    @patch('plane.app.views.wiki_diagrams.requests.post')
    def test_syntax_failures_and_unavailable_renderer(self, post):
        self.renderer(post, headers={'X-PlantUML-Diagram-Error': 'Syntax error', 'X-PlantUML-Diagram-Error-Line': '5, 5'})
        response = self.client.post(self.url, {'source': self.source}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['line'], 4)
        self.assertIn('Syntax error', response.data['error'])
        post.side_effect = requests.Timeout()
        self.assertEqual(self.client.post(self.url, {'source': self.source}, format='json').status_code, 503)

    @patch('plane.app.views.wiki_diagrams.requests.post')
    def test_invalid_or_oversized_renderer_response(self, post):
        self.renderer(post, status=302)
        self.assertEqual(self.client.post(self.url, {'source': self.source}, format='json').status_code, 503)
        self.renderer(post, headers={'Content-Type': 'text/html'})
        self.assertEqual(self.client.post(self.url, {'source': self.source}, format='json').status_code, 503)
        self.renderer(post, content=b'x' * 2000001)
        self.assertEqual(self.client.post(self.url, {'source': self.source}, format='json').status_code, 400)
