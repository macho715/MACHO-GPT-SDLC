# User Guide

## User Guide

## Quick Start

Install dependencies:

```powershell
npm install
```

Run the local validation gate:

```powershell
npm run validate
```

Run the Worker locally:

```powershell
npm run dev
```

Check local health:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing
```

## Developer Workflow

Shared command set: `npm install`, `npm run dev`, `npm run validate`.

Use this order for code changes:

```powershell
npm run type-check
npm run lint
npm test
npm run security:secrets
npm run validate
npm run test:coverage
```

Use this command before deployment work:

```powershell
npx wrangler deploy --dry-run --env="" --outdir .wrangler\dry-run
```

Important configuration names:

- `MCP_DEV_HUB_API_KEY`
- `API_KEY`
- `DASHBOARD_AUTOFILL`
- `DB`
- `ENVIRONMENT`

Do not print `API_KEY` or `MCP_DEV_HUB_API_KEY` values.

## Operational Procedure

### Local Development

1. Confirm dependencies with the install command.
2. Run the validation command.
3. Start the local Worker command.
4. Open `/health` or `/dashboard`.
5. Keep `.dev.vars` local and uncommitted.

### D1 Schema

Local schema apply:

```powershell
npm run db:init:local
```

Production schema apply:

```powershell
npm run db:init:prod
```

Schema source of truth is `src/db/schema.sql`.

### Safe Remote Verification

Use an environment variable and do not print headers:

```powershell
$headers = @{
  Authorization = "Bearer " + $env:MCP_DEV_HUB_API_KEY
  "content-type" = "application/json"
  accept = "application/json, text/event-stream"
}

$body = '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'
$response = Invoke-WebRequest `
  -Uri "https://mcp-dev-hub.mscho715.workers.dev/mcp" `
  -Method POST `
  -Headers $headers `
  -Body $body `
  -UseBasicParsing

$response.StatusCode
```

## Agent Start Workflow

Before starting task work:

```text
get_handoff(agent, status="all")
ack_handoff(handoff_id, agent)
lock_task(task_id, agent)
validate_agent_start(agent, task_id)
```

Only continue when `validate_agent_start` returns `PASS`.

ZERO outcomes:

- `ZERO-T1`: task or handoff context is not confirmed.
- `ZERO-T2`: lock ownership or blocked-task threshold is unsafe.
- `ZERO-T3`: no active session exists.

## Troubleshooting

## Consistency Vocabulary

Shared documentation terms: API, API_KEY, CHANGELOG, CORS, DASHBOARD_AUTOFILL, DEV, ENVIRONMENT, GUIDE, HTML, HUB, LAYOUT, MCP, MCP_DEV_HUB_API_KEY, PASS, POST, SYSTEM_ARCHITECTURE, TTL, YOUR_API_KEY, ZERO.

### `401 Unauthorized`

The client did not send the same key as Cloudflare Secret `API_KEY`. Rotate and reapply the key if it was exposed.

### `tools/list` shows the wrong count

Expected count is `32`. Check `src/tools/index.ts` and `docs/traceability/tool-inventory-v3.md`.

### Dashboard does not show live data

The `/dashboard` HTML shell is public, but `/api/dashboard` and `/api/mcp-status` require auth.

### Secret scan fails

Replace raw values with one of the allowed placeholders:

- `YOUR_API_KEY`
- `<API_KEY>`
- `{env:MCP_DEV_HUB_API_KEY}`

### Wrangler dry-run fails with a filesystem permission error

Wrangler writes logs under the user profile. Re-run with a host context that can write Wrangler logs.
