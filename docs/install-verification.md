# Portable installation verification

Verified on 2026-11-02 from an export of repository source, without the original demo's node_modules, build artifacts, database, uploads or credentials. Host: macOS Docker Desktop; containers: linux/arm64.

- Built Web, Live, API and MCP images from the included Dockerfiles. Web/Live compile the shared editor inside Docker.
- Rendered Compose with generated private settings; blank required secrets fail configuration. The env generator test checks distinct secrets, mode 600 and refusal to overwrite an existing file.
- Started a separate `devspace-install-test` Compose project with fresh named volumes and port 18089. Database migrations, including custom migrations 0123–0128, completed successfully.
- Root page returned HTTP 200; Web/Admin/Space, database, queue and cache health checks passed.
- Created disposable test identities and records in the fresh database only: two Work projects, four work items, two Wiki pages, one Timesheet and two Milestones.
- MCP stdio client advertised 13 read-only tools, read Work/Wiki/Timesheet/Milestones with pagination across multiple pages and rejected a write request. Source URL assertions verified public links rather than container-only API links.
- Eleven isolated MCP tests passed in the container, including scope/identity validation, denied writes, redirect refusal and public-link conversion.
- PlantUML rendered SVG over its isolated network. Object storage write/read passed.
- Ran the documented DB/uploads backup commands. Restored the DB into a separate scratch database and verified the expected record counts (4 work items, 2 Wiki pages, 1 Timesheet). Restored uploads into a separate volume and read the proof object through another MinIO instance.
- The original demo on 8089 remained separate; its root page returned HTTP 200 after Docker Engine recovery.

The first concurrent build encountered a Docker Engine 500/EOF; Docker Desktop was restarted and the subsequent source builds and tests passed. The guide uses separate build commands to reduce concurrent resource use.

Limits: this verifies fresh containers on the current host, not a second physical host or linux/amd64. External TLS, SMTP, SSO, a production domain and the user's desktop MCP client configuration were not provisioned. Existing UI/browser verification remains separate from these deployment and stdio checks.
