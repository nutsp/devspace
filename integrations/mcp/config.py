"""Environment-only connection settings shared by all read tools."""
import os
import re
from urllib.parse import urlsplit
from uuid import UUID


def required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError(f'{name} is required; configure the private mcp.env file.')
    return value


def origin(value):
    parsed = urlsplit(value)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        raise ValueError('Devspace URLs must be HTTP(S) origins without credentials, paths or query parameters.')
    if parsed.hostname in ('localhost', '127.0.0.1') and parsed.port == 8088:
        raise ValueError('Port 8088 is legacy redirect-only; use 8089 directly.')
    return value.rstrip('/')


def connections():
    public = origin(required('DEVSPACE_URL'))
    api = origin(os.environ.get('DEVSPACE_API_URL') or public)
    slug = required('DEVSPACE_WORKSPACE_SLUG')
    if not re.fullmatch(r'[a-zA-Z0-9_-]+', slug):
        raise ValueError('DEVSPACE_WORKSPACE_SLUG must be a workspace slug, not a URL.')
    project_ids = sorted({str(UUID(p.strip())) for p in required('DEVSPACE_PROJECT_IDS').split(',')})
    common = {'PLANE_BASE_URL': public, 'API_URL': api, 'PLANE_WORKSPACE_SLUG': slug}
    work = {**common, 'PLANE_API_KEY': required('DEVSPACE_WORK_API_KEY'), 'project_ids': project_ids}
    docs = {**common, 'PLANE_API_KEY': required('DEVSPACE_DOCS_API_KEY'), 'user_id': str(UUID(required('DEVSPACE_DOCS_USER_ID')))}
    return work, docs


def public_links(value, api, public):
    """Keep returned source links usable when the container calls an internal API origin."""
    if isinstance(value, list):
        return [public_links(item, api, public) for item in value]
    if isinstance(value, dict):
        return {
            key: public + item[len(api):] if key in ('url', 'milestone_url') and isinstance(item, str) and item.startswith(api + '/') else public_links(item, api, public)
            for key, item in value.items()
        }
    return value
