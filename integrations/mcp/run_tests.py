"""Isolated policy tests: synthetic tokens only; no live requests."""
import os
import unittest
from unittest.mock import patch

FIXTURE = {
    'XDG_DATA_HOME': '/tmp/devspace-mcp-test-data',
    'XDG_CACHE_HOME': '/tmp/devspace-mcp-test-cache',
    'XDG_CONFIG_HOME': '/tmp/devspace-mcp-test-config',
    'XDG_STATE_HOME': '/tmp/devspace-mcp-test-state',
    'DEVSPACE_URL': 'http://localhost:8089',
    'DEVSPACE_WORKSPACE_SLUG': 'test-team',
    'DEVSPACE_WORK_API_KEY': 'work-test-key',
    'DEVSPACE_PROJECT_IDS': '11111111-1111-4111-8111-111111111111',
    'DEVSPACE_DOCS_API_KEY': 'docs-test-key',
    'DEVSPACE_DOCS_USER_ID': '44444444-4444-4444-8444-444444444444',
}
if __name__ == '__main__':
    with patch.dict(os.environ, FIXTURE, clear=True):
        suite = unittest.defaultTestLoader.discover(os.path.dirname(__file__), pattern='test_*.py')
        result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(not result.wasSuccessful())
