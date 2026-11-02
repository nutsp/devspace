import os
import unittest
from unittest.mock import patch
from config import connections, origin, public_links

class ConfigTests(unittest.TestCase):
    def test_explicit_public_and_internal_origins(self):
        with patch.dict(os.environ, {'DEVSPACE_URL': 'https://team.example.test', 'DEVSPACE_API_URL': 'http://api:8000'}):
            work, docs = connections()
        self.assertEqual(work['API_URL'], 'http://api:8000')
        self.assertEqual(docs['PLANE_BASE_URL'], 'https://team.example.test')
        self.assertNotEqual(work['PLANE_API_KEY'], docs['PLANE_API_KEY'])

    def test_missing_identity_or_scope_fails_closed(self):
        for key in ('DEVSPACE_PROJECT_IDS', 'DEVSPACE_WORK_API_KEY', 'DEVSPACE_DOCS_API_KEY', 'DEVSPACE_DOCS_USER_ID'):
            with self.subTest(key=key), patch.dict(os.environ, {key: ''}), self.assertRaises(ValueError):
                connections()

    def test_url_credentials_paths_and_legacy_port_are_rejected(self):
        for value in ('ftp://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test?q=x', 'http://localhost:8088'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                origin(value)

    def test_internal_links_are_rebased_without_touching_document_text(self):
        value = {'results': [{'url': 'http://api:8000/team/wiki/x/', 'milestone_url': 'http://api:8000/team/milestones/', 'description_html': '<p>http://api:8000/private</p>'}], 'url': 'http://api:8000.evil.test/'}
        result = public_links(value, 'http://api:8000', 'https://devspace.example.test')
        self.assertEqual(result['results'][0]['url'], 'https://devspace.example.test/team/wiki/x/')
        self.assertEqual(result['results'][0]['milestone_url'], 'https://devspace.example.test/team/milestones/')
        self.assertEqual(result['results'][0]['description_html'], value['results'][0]['description_html'])
        self.assertEqual(result['url'], value['url'])
        self.assertEqual(value['results'][0]['url'], 'http://api:8000/team/wiki/x/')
