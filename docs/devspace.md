# Devspace customization notes

Based on Plane Community v1.4.3, commit `37a15d9`.

## Source map

- Wiki API: `apps/api/plane/app/views/wiki*.py`
- Timesheet API: `apps/api/plane/app/views/timesheet.py`
- Milestone API: `apps/api/plane/app/views/milestone.py`
- Read-only integration API: `apps/api/plane/api/views/workspace_tools.py`
- Web: `apps/web/core/components/{wiki,timesheet,milestones}`
- Diagram editor: `packages/editor/src/core/extensions/code`
- Custom migrations: `apps/api/plane/db/migrations/0123_*` through `0128_*`

## Verification

From the repository root:

```sh
pnpm --filter web check:types
node --test apps/web/tests/*.test.mjs
```

Django tests require an isolated test database and the project dependencies. Within a configured API container:

```sh
python manage.py test plane.tests.test_workspace_wiki plane.tests.test_wiki_search plane.tests.test_wiki_graph plane.tests.test_wiki_review plane.tests.test_wiki_templates plane.tests.test_wiki_diagrams plane.tests.test_timesheet plane.tests.test_milestones plane.tests.test_mcp_workspace_tools plane.tests.test_mcp_milestones --settings=plane.settings.test --noinput
```

Run migrations on new instances before using custom features. Back up databases and uploads before upgrading existing instances. Do not reuse demo identities or tokens as production credentials.

## Local runtime boundary

The current local runtime and launchers are outside this checkout. Its default URL is port 8089; port 8088 is a legacy GET/HEAD redirect. Do not use port 8088 for API or MCP requests.

Custom web builds require `VITE_LIVE_BASE_PATH=/live`, `VITE_ADMIN_BASE_PATH=/god-mode` and `VITE_SPACE_BASE_PATH=/spaces`; `build-wiki.sh` sets these values. PlantUML rendering requires an internal-only local renderer. Runtime environment files, database backups and MCP credentials must not be committed.
