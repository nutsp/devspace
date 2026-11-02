import json
import unittest
from unittest.mock import patch
import httpx
from fastmcp import FastMCP, Client
from milestone_tools import register_milestone_tool

PROJECT='11111111-1111-4111-8111-111111111111'
SECOND='22222222-2222-4222-8222-222222222222'
MILESTONE='33333333-3333-4333-8333-333333333333'
PM='44444444-4444-4444-8444-444444444444'
OUTSIDE='55555555-5555-4555-8555-555555555555'


class MilestonePolicyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.env = patch.dict('os.environ', {
            'DEVSPACE_URL': 'https://devspace.example.test',
            'DEVSPACE_API_URL': 'http://api:8000',
            'DEVSPACE_WORKSPACE_SLUG': 'test-team',
            'DEVSPACE_WORK_API_KEY': 'work-test-key',
            'DEVSPACE_PROJECT_IDS': PROJECT + ',' + SECOND,
            'DEVSPACE_DOCS_API_KEY': 'pm-test-key',
            'DEVSPACE_DOCS_USER_ID': PM,
        })
        self.env.start()
        self.server=FastMCP('Milestone tests')
        register_milestone_tool(self.server)
        self.requests=[]
        self.response_status=200
        self.response_reader=PM
        real_client=httpx.AsyncClient
        def serve(request):
            self.requests.append(request)
            assert request.method=='GET'
            assert request.headers['X-Api-Key']=='pm-test-key'
            return httpx.Response(self.response_status,json={'reader':{'id':self.response_reader},'results':[],'total_count':0,'count':0,'next_cursor':None,'next_page_results':False},headers={'Location':'https://example.invalid/forbidden-redirect'})
        self.patch=patch('milestone_tools.httpx.AsyncClient',side_effect=lambda **kwargs:real_client(transport=httpx.MockTransport(serve),**kwargs))
        self.patch.start()
        self.client=Client(self.server)
        await self.client.__aenter__()

    async def asyncTearDown(self):
        await self.client.__aexit__(None,None,None)
        self.patch.stop();self.env.stop()

    async def test_scope_identity_get_and_native_page_translation(self):
        tool=(await self.client.list_tools())[0]
        self.assertTrue(tool.annotations.readOnlyHint)
        self.assertFalse(tool.annotations.destructiveHint)
        result=await self.client.call_tool('milestone',{'action':'portfolio','cursor':'2','per_page':1})
        self.assertFalse(result.is_error)
        request=self.requests[-1]
        self.assertEqual(set(request.url.params.get_list('project_ids')),{PROJECT,SECOND})
        self.assertEqual(request.url.params['page'],'2')
        self.assertEqual(request.url.params['status'],'all')
        await self.client.call_tool('milestone',{'action':'list_workitems','project_id':PROJECT,'milestone_id':MILESTONE,'work_status':'late','cursor':'3','per_page':2})
        request=self.requests[-1]
        self.assertTrue(request.url.path.endswith('/milestone-work-items/'))
        self.assertEqual((request.url.params['page'],request.url.params['work_status'],request.url.params['milestone']),('3','late',MILESTONE))
        await self.client.call_tool('milestone',{'action':'retrieve','project_id':PROJECT,'milestone_id':MILESTONE})
        self.assertTrue(self.requests[-1].url.path.endswith(f'/milestones/{MILESTONE}/'))
        self.assertFalse(self.requests[-1].url.params)

    async def test_invalid_and_out_of_scope_requests_do_not_reach_http(self):
        cases=[{'action':'create'}, {'action':'delete'}, {'action':'list','project_id':OUTSIDE},
            {'action':'list'}, {'action':'retrieve','project_id':PROJECT,'milestone_id':'bad'},
            {'action':'portfolio','per_page':101}, {'action':'portfolio','window_days':0},
            {'action':'portfolio','cursor':'0'}, {'action':'portfolio','cursor':'-1'},
            {'action':'portfolio','cursor':'not-a-cursor'}, {'action':'portfolio','query':'a'*201},
            {'action':'portfolio','milestone_id':MILESTONE},
            {'action':'list','project_id':PROJECT,'status':'risk'},
            {'action':'retrieve','project_id':PROJECT,'milestone_id':MILESTONE,'cursor':'2'}]
        for args in cases:
            with self.subTest(args=args):
                result=await self.client.call_tool('milestone',args,raise_on_error=False)
                self.assertTrue(result.is_error)
        self.assertFalse(self.requests)

    async def test_identity_mismatch_and_redirect_are_refused(self):
        self.response_reader=OUTSIDE
        result=await self.client.call_tool('milestone',{'action':'portfolio'},raise_on_error=False)
        self.assertTrue(result.is_error)
        self.response_reader=PM;self.response_status=302
        count=len(self.requests)
        result=await self.client.call_tool('milestone',{'action':'portfolio'},raise_on_error=False)
        self.assertTrue(result.is_error)
        self.assertEqual(len(self.requests),count+1)
        self.assertTrue(all(r.url.host=='api' for r in self.requests))

    def test_empty_scope_cannot_become_all_projects(self):
        with patch.dict('os.environ', {'DEVSPACE_PROJECT_IDS': ''}):
            with self.assertRaises(ValueError):
                register_milestone_tool(FastMCP('Empty'))
