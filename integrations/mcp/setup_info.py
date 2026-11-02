"""Read identity/project UUIDs for MCP setup; never print API tokens."""
import os
import httpx
from config import origin, required


def main():
    base = origin(os.environ.get('DEVSPACE_API_URL') or required('DEVSPACE_URL'))
    slug = required('DEVSPACE_WORKSPACE_SLUG')
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        response = client.get(base + '/api/v1/users/me/', headers={'X-Api-Key': required('DEVSPACE_DOCS_API_KEY')})
        if response.status_code != 200:
            raise SystemExit(f'Document reader check failed: HTTP {response.status_code}')
        print('DEVSPACE_DOCS_USER_ID=' + str(response.json()['id']))
        cursor = ''
        seen = set()
        while True:
            response = client.get(base + f'/api/v1/workspaces/{slug}/projects/', params={'per_page': 100, **({'cursor': cursor} if cursor else {})}, headers={'X-Api-Key': required('DEVSPACE_WORK_API_KEY')})
            if response.status_code != 200:
                raise SystemExit(f'Work project check failed: HTTP {response.status_code}')
            data = response.json()
            for row in data['results']:
                print(f"Project {row.get('identifier', '')}: {row['id']}")
            if not data.get('next_page_results'):
                break
            cursor = data.get('next_cursor')
            if not cursor or cursor in seen:
                raise SystemExit('Invalid project pagination response')
            seen.add(cursor)


if __name__ == '__main__':
    main()
