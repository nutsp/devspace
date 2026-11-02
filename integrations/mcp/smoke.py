"""Read-only stdio smoke test against an already configured Devspace deployment."""
import asyncio
import json
import os
from pathlib import Path
import sys
from fastmcp import Client
from fastmcp.client.transports import StdioTransport
from config import connections


async def main():
    work, _ = connections()
    server = Path(__file__).with_name('server.py')
    async with Client(StdioTransport(command=sys.executable, args=[str(server)], env=dict(os.environ))) as client:
        tools = await client.list_tools()
        assert len(tools) == 13 and all(tool.annotations.readOnlyHint for tool in tools)

        async def read_all(name, args):
            rows, seen, pages = [], set(), 0
            while True:
                result = await client.call_tool(name, args)
                data = json.loads('\n'.join(block.text for block in result.content if hasattr(block, 'text')))
                for row in data.get('results', []):
                    if name in ('wiki', 'timesheet', 'milestone') and row.get('url'):
                        assert row['url'].startswith(work['PLANE_BASE_URL'] + '/')
                rows.extend(data.get('results', []))
                pages += 1
                if not data.get('next_page_results'):
                    break
                cursor = data.get('next_cursor')
                assert cursor and cursor not in seen
                seen.add(cursor)
                args = {**args, 'cursor': cursor}
            print(f'PASS {name}/{args["action"]}: {len(rows)} list records across {pages} pages')
            return rows

        await read_all('member', {'action': 'me'})
        await read_all('project', {'action': 'list', 'per_page': 1})
        for project_id in work['project_ids']:
            await read_all('state', {'action': 'list', 'project_id': project_id})
            await read_all('workitem', {'action': 'list', 'project_id': project_id, 'per_page': 1})
        for name, args in [('wiki', {'action': 'collections'}), ('wiki', {'action': 'list'}), ('timesheet', {'action': 'list'}), ('milestone', {'action': 'portfolio'})]:
            await read_all(name, {**args, 'per_page': 1})
        denied = await client.call_tool('workitem', {'action': 'create'}, raise_on_error=False)
        assert denied.is_error
        print('PASS write action rejected; 13 read-only tools advertised')


if __name__ == '__main__':
    asyncio.run(main())
