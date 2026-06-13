# MCP DEV HUB v3

## Overview

MCP DEV HUB v3 is a Cloudflare Workers and D1 based MCP server for shared multi-agent development state.

Codex, Cursor, Claude Code, and OpenCode can use the same `dev-hub` MCP endpoint to share sessions, tasks, discussions, votes, handoffs, file changes, events, dashboard status, and the agent start guard.

Current verified runtime:

- Worker entrypoint: `src/index.ts`
- D1 schema source: `src/db/schema.sql`
- Tool registry: `src/tools/index.ts`
- Tool count: `32`
- Tool contract version: `v3.1`
- Package manager: `npm`

## Core Capabilities

- Session lifecycle: active -> retro -> voting -> next active session.
- Task coordination: D1 task records plus TTL task locks.
- Agent start guard: `validate_agent_start` returns `PASS`, `ZERO-T1`, `ZERO-T2`, or `ZERO-T3`.
- Discussion, consensus, and vote tracking.
- Retrospective review and leader election.
- Handoff, event, and file-change logging.
- Dashboard shell plus authenticated dashboard/status APIs.
- Tool schema contract metadata: `schema_version` and `contract_hash` on every tool.
- Secret leak scan for docs, source, and tests.

## Documentation Map

| Document                                                                         | Purpose                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md)                       | Runtime architecture, data flow, components, external dependencies |
| [docs/LAYOUT.md](docs/LAYOUT.md)                                                 | Repository tree, directory responsibilities, entrypoints           |
| [docs/GUIDE.md](docs/GUIDE.md)                                                   | User quickstart, developer workflow, operations, troubleshooting   |
| [docs/CHANGELOG.md](docs/CHANGELOG.md)                                           | Verified current-state changelog and recent evidence               |
| [docs/traceability/tool-inventory-v3.md](docs/traceability/tool-inventory-v3.md) | Tool inventory with contract hashes                                |

## Quick Start

Prerequisites:

- Node.js compatible with the checked-in lockfile and Wrangler toolchain.
- Cloudflare Wrangler access for D1 migration and deployment commands.
- A local or user environment variable named `MCP_DEV_HUB_API_KEY` when calling authenticated MCP routes.

Install:

```powershell
npm install
```

Validate locally:

```powershell
npm run validate
npm run test:coverage
```

Run the Worker locally:

```powershell
npm run dev
```

Health check:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing
```

Dry-run deploy:

```powershell
npx wrangler deploy --dry-run --env="" --outdir .wrangler\dry-run
```

## Configuration

Runtime configuration is split across:

- `wrangler.toml`: Worker name, entrypoint, compatibility date, D1 binding, non-secret vars.
- `src/db/schema.sql`: D1 table contract.
- `.dev.vars`: local secrets for Wrangler dev. This file must not be committed.
- Cloudflare Secret `API_KEY`: production authentication secret.
- `MCP_DEV_HUB_API_KEY`: local client-side environment variable used by MCP clients.
- `DASHBOARD_AUTOFILL`: local-only dashboard convenience flag.
- `DB` and `ENVIRONMENT`: Worker binding and environment variable surfaced by Wrangler.

Do not print API keys in logs, docs, screenshots, or chat.

## Development Commands

Shared command set: `npm install`, `npm run dev`, `npm run validate`.

```powershell
npm run type-check
npm run lint
npm test
npm run security:secrets
npm run validate
npm run test:coverage
npm run format:check
```

`npm run validate` runs type-check, lint, tests, and the secret scan.

## Safe Remote Verification

Use placeholders or environment variables only.
This pattern sends the key but prints only the response body or status code:

```powershell
$headers = @{
  Authorization = "Bearer " + $env:MCP_DEV_HUB_API_KEY
  "content-type" = "application/json"
  accept = "application/json, text/event-stream"
}

$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
$response = Invoke-WebRequest `
  -Uri "https://mcp-dev-hub.mscho715.workers.dev/mcp" `
  -Method POST `
  -Headers $headers `
  -Body $body `
  -UseBasicParsing

($response.Content | ConvertFrom-Json).result.tools.Count
```

Expected tool count: `32`.

## Agent Start Guard

Before an agent starts task work:

```text
get_handoff(agent, status="all")
ack_handoff(handoff_id, agent)
lock_task(task_id, agent)
validate_agent_start(agent, task_id)
```

Only start work when `validate_agent_start` returns `PASS`.

ZERO mapping:

| Result    | Meaning                                    | Trigger                                                                         |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------- |
| `PASS`    | Work may start                             | Active session, acknowledged handoff, owned lock, blocked count below threshold |
| `ZERO-T1` | Handoff or task context is not confirmed   | Missing task, wrong active session, missing or pending handoff                  |
| `ZERO-T2` | Ownership or blocked-work escalation issue | Missing lock, another lock owner, 2 or more blocked tasks                       |
| `ZERO-T3` | Session lifecycle issue                    | No active session                                                               |

## Key Directories

- `src/`: active Worker source.
- `src/tools/`: MCP tool definitions, handlers, and tool tests.
- `src/lib/`: shared MCP, auth, CORS, DB, and error helpers.
- `src/db/`: D1 schema and query-group map.
- `src/dashboard/`: dashboard data and HTML shell.
- `tests/helpers/`: D1 test double.
- `docs/`: generated project documentation and traceability docs.
- `scripts/security/`: no-secret-leak scanner.

## Consistency Vocabulary

Shared documentation terms: API, API_KEY, CHANGELOG, CORS, DASHBOARD_AUTOFILL, DEV, ENVIRONMENT, GUIDE, HTML, HUB, LAYOUT, MCP, MCP_DEV_HUB_API_KEY, PASS, POST, SYSTEM_ARCHITECTURE, TTL, YOUR_API_KEY, ZERO.

## Current Validation Snapshot

Last local validation in this workspace:

```text
npm run validate        PASS
npm run test:coverage   PASS
npx wrangler deploy --dry-run --env="" --outdir .wrangler\dry-run   PASS
```

The dry run does not deploy or update the remote Worker.
