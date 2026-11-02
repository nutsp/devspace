import asyncio
import unittest
from types import SimpleNamespace
from fastmcp.exceptions import ToolError
from server import WorkReadOnly, validate_read, PROJECTS

class ReadOnlyTests(unittest.IsolatedAsyncioTestCase):
    async def test_forbidden_calls_never_reach_upstream(self):
        calls=[]
        async def upstream(context): calls.append(context)
        for name,args in [('workitem',{'action':'create'}),('workitem_comment',{'action':'create'}),('project',{'action':'delete'}),('create_work_item',{}),('page',{'action':'list'}),('milestone',{'action':'create'}),('milestone',{'action':'link'}),('milestone',{'action':'portfolio','user_id':'someone-else'}),('milestone',{'action':'portfolio','project_ids':['outside']}),('milestone',{'action':'list','project_id':'00000000-0000-0000-0000-000000000000'}),('wiki',{'action':'create'}),('timesheet',{'action':'approve'}),('timesheet',{'action':'list','user_id':'someone-else'}),('workitem',{'action':'list','project_id':'00000000-0000-0000-0000-000000000000'}),('workitem',{'action':'list','pql':'stateGroup = "started"'})]:
            with self.subTest(name=name,args=args), self.assertRaises(ToolError):
                await WorkReadOnly().on_call_tool(SimpleNamespace(message=SimpleNamespace(name=name,arguments=args)),upstream)
        self.assertEqual(calls,[])
    def test_scoped_read_is_permitted(self):
        validate_read('workitem',{'action':'list','project_id':next(iter(PROJECTS))})
        validate_read('milestone',{'action':'portfolio'})
        validate_read('milestone',{'action':'list','project_id':next(iter(PROJECTS))})

if __name__=='__main__': unittest.main()
