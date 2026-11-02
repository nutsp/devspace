import json
import unittest
from unittest.mock import patch
import httpx
from fastmcp import FastMCP, Client
from workspace_tools import register_workspace_tools

class WorkspacePolicyTests(unittest.IsolatedAsyncioTestCase):
    async def test_docs_identity_get_only_and_redirect_denial(self):
        from config import connections
        _, docs = connections()
        status = 200
        reader = docs['user_id']
        calls = []
        def serve(request):
            calls.append(request)
            self.assertEqual(request.method, 'GET')
            self.assertEqual(request.headers['X-Api-Key'], docs['PLANE_API_KEY'])
            return httpx.Response(status, json={'reader': {'id': reader}, 'results': []}, headers={'Location': 'https://example.invalid/redirect'})
        real = httpx.AsyncClient
        server = FastMCP('Wiki policy tests')
        register_workspace_tools(server)
        with patch('workspace_tools.httpx.AsyncClient', side_effect=lambda **kw: real(transport=httpx.MockTransport(serve), **kw)):
            async with Client(server) as client:
                result = await client.call_tool('wiki', {'action': 'list'})
                self.assertFalse(result.is_error)
                self.assertEqual(json.loads(result.content[0].text)['reader']['id'], docs['user_id'])
                reader = '55555555-5555-4555-8555-555555555555'
                self.assertTrue((await client.call_tool('wiki', {'action': 'list'}, raise_on_error=False)).is_error)
                status = 302
                self.assertTrue((await client.call_tool('wiki', {'action': 'list'}, raise_on_error=False)).is_error)
        self.assertEqual(len(calls), 3)
