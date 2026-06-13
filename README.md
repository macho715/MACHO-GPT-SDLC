# MCP DEV HUB v3

Cloudflare Workers + D1 기반의 다중 AI 개발 조정용 MCP 서버입니다.

Codex, Cursor, Claude Code, OpenCode가 같은 `dev-hub` MCP 서버를 바라보며 세션, 태스크, 토론, 투표, 핸드오프, 파일 변경 기록을 공유합니다.

## Features

- **세션 라이프사이클** — active → retro → leader election → 새 세션 자동 체인
- **태스크 조정** — 등록·할당 + TTL 잠금으로 멀티-AI 동시 작업 충돌 방지
- **토론 & 합의** — 스레드·발언·consensus 추적, 투표 기반 의사결정
- **회고 & 리더 선거** — AI 4인 회고 집계(MVP) 후 다음 세션 리더 선출
- **핸드오프 & 이벤트** — AI 간 작업 인계, 브로드캐스트 이벤트·파일 변경 로그
- **D1 SSOT** — 모든 공유 상태가 Cloudflare D1 단일 원장에 (16 테이블)
- **31개 MCP 도구** — JSON-RPC 2.0, `x-api-key`/`Bearer` 인증, UTF-8 경계 가드

## Documentation

| 문서                                             | 내용                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- |
| [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) | 시스템 구조·요청 흐름·데이터 모델(16 테이블)·세션 상태 기계 |
| [SYSTEM_LAYOUT.md](SYSTEM_LAYOUT.md)             | 파일·폴더 배치와 각 파일 책임                               |
| [CHANGELOG.md](CHANGELOG.md)                     | 버전별 변경 이력 (Keep a Changelog)                         |
| [CLAUDE.md](CLAUDE.md) · [AGENTS.md](AGENTS.md)  | 개발 워크플로우·코딩 컨벤션·멀티-AI 규칙                    |

## Table of Contents

- [Current Deployment](#current-deployment)
- [Local Setup](#local-setup)
- [Deploy](#deploy)
- [MCP Client Configuration](#mcp-client-configuration)
- [Remote Verification](#remote-verification)
- [Tool Inventory](#tool-inventory)
- [Agent Workflow](#agent-workflow)
- [MACHO-GPT ZERO Rules](#macho-gpt-zero-rules)
- [Development Commands](#development-commands)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)

상세 구조/배치는 위 **Documentation** 표의 전용 문서를 참조하세요 (README에는 중복 기재하지 않습니다).

## Current Deployment

| 항목        | 값                                                 |
| ----------- | -------------------------------------------------- |
| Worker      | `mcp-dev-hub`                                      |
| URL         | `https://mcp-dev-hub.mscho715.workers.dev/mcp`     |
| Health      | `https://mcp-dev-hub.mscho715.workers.dev/health`  |
| D1 database | `mcp-dev-hub-db`                                   |
| D1 binding  | `env.DB`                                           |
| Auth        | `x-api-key` 또는 `Authorization: Bearer <API_KEY>` |
| Tool count  | 31                                                 |

API 키는 Cloudflare Secret `API_KEY`로 관리합니다.
키 값을 README, Git, 채팅, 로그에 남기지 마세요.

## Architecture

요청 흐름·계층 구조·데이터 모델(16 테이블)·세션 상태 기계는 **[SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)** 참조.

## Project Layout

파일·폴더 배치와 각 파일의 책임은 **[SYSTEM_LAYOUT.md](SYSTEM_LAYOUT.md)** 참조. 활성 엔트리포인트는 `src/index.ts`이며, 레거시 v1/v2/root-v3는 2026-06-13 완전히 제거되었습니다.

## Local Setup

```powershell
npm install
npm run validate
npm run test:coverage
```

Run the Worker locally:

```powershell
npm run dev
```

Local health check:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8787/health" -UseBasicParsing
```

## Deploy

Production D1 schema:

```powershell
npm run db:init:prod
```

Deploy Worker:

```powershell
npm run deploy
```

Dry-run deploy:

```powershell
npx wrangler deploy --dry-run --env="" --outdir .wrangler\dry-run
```

Set or rotate the production API key:

```powershell
$apiKey = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
Set-Content -LiteralPath "$env:USERPROFILE\.codex\secrets\mcp-dev-hub-api-key.txt" -Value $apiKey -NoNewline -Encoding ascii
[Environment]::SetEnvironmentVariable("MCP_DEV_HUB_API_KEY", $apiKey, "User")
$env:MCP_DEV_HUB_API_KEY = $apiKey
$apiKey | npx wrangler secret put API_KEY --env=""
```

Do not print the key after creation.

## MCP Client Configuration

Use this server name everywhere:

```text
dev-hub
```

Use this URL everywhere:

```text
https://mcp-dev-hub.mscho715.workers.dev/mcp
```

### Codex

Codex global MCP config lives in:

```text
C:\Users\jichu\.codex\config.toml
```

Register the server:

```powershell
codex mcp add dev-hub --url "https://mcp-dev-hub.mscho715.workers.dev/mcp" --bearer-token-env-var MCP_DEV_HUB_API_KEY
```

Verify:

```powershell
codex mcp get dev-hub
codex mcp list
```

Expected shape:

```text
dev-hub
  enabled: true
  transport: streamable_http
  url: https://mcp-dev-hub.mscho715.workers.dev/mcp
  bearer_token_env_var: MCP_DEV_HUB_API_KEY
```

Restart Codex after adding the MCP server so the current session can load it.

### Cursor

Project-local config:

```text
C:\Users\jichu\Downloads\MACHO-GPT SDLC\.cursor\mcp.json
```

Example:

```json
{
  "mcpServers": {
    "dev-hub": {
      "type": "url",
      "url": "https://mcp-dev-hub.mscho715.workers.dev/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY",
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}
```

`.cursor/mcp.json` is ignored by Git because it contains a real key.

### Claude Code

Claude Code user config is:

```text
C:\Users\jichu\.claude.json
```

Register with a header:

```powershell
claude mcp add --transport http --scope user dev-hub "https://mcp-dev-hub.mscho715.workers.dev/mcp" --header "Authorization: Bearer YOUR_API_KEY"
```

Verify without printing headers:

```powershell
claude mcp list
```

Expected result:

```text
dev-hub: https://mcp-dev-hub.mscho715.workers.dev/mcp (HTTP) - ✓ Connected
```

Warning: some Claude Code versions print configured headers in `claude mcp get`.
Avoid running `claude mcp get dev-hub` when the static header contains a real token.

### OpenCode

Global config:

```text
C:\Users\jichu\.config\opencode\opencode.jsonc
```

Example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "dev-hub": {
      "type": "remote",
      "url": "https://mcp-dev-hub.mscho715.workers.dev/mcp",
      "oauth": false,
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:MCP_DEV_HUB_API_KEY}",
      },
    },
  },
}
```

Restart OpenCode after editing this file.

## Remote Verification

Health:

```powershell
Invoke-WebRequest -Uri "https://mcp-dev-hub.mscho715.workers.dev/health" -UseBasicParsing
```

MCP ping:

```powershell
$apiKey = (Get-Content -LiteralPath "$env:USERPROFILE\.codex\secrets\mcp-dev-hub-api-key.txt" -Raw).Trim()
$body = '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}'
Invoke-WebRequest `
  -Uri "https://mcp-dev-hub.mscho715.workers.dev/mcp" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $apiKey"; "content-type" = "application/json"; accept = "application/json, text/event-stream" } `
  -Body $body `
  -UseBasicParsing
```

Tool list:

```powershell
$apiKey = (Get-Content -LiteralPath "$env:USERPROFILE\.codex\secrets\mcp-dev-hub-api-key.txt" -Raw).Trim()
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
$response = Invoke-WebRequest `
  -Uri "https://mcp-dev-hub.mscho715.workers.dev/mcp" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $apiKey"; "content-type" = "application/json"; accept = "application/json, text/event-stream" } `
  -Body $body `
  -UseBasicParsing
($response.Content | ConvertFrom-Json).result.tools.Count
```

Expected tool count:

```text
31
```

Unauthenticated calls must fail:

```powershell
Invoke-WebRequest `
  -Uri "https://mcp-dev-hub.mscho715.workers.dev/mcp" `
  -Method POST `
  -Headers @{ "content-type" = "application/json" } `
  -Body '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' `
  -UseBasicParsing
```

Expected status is `401`.

## Tool Inventory

| Domain     | Tools                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------- |
| Dashboard  | `get_dashboard`                                                                             |
| Session    | `start_session`, `get_session`, `close_session`                                             |
| Retro      | `submit_retro`, `get_retro`, `finalize_retro`                                               |
| Election   | `start_election`, `cast_election_vote`, `get_election_result`                               |
| State      | `get_state`, `update_state`                                                                 |
| Task       | `create_task`, `list_tasks`, `update_task`                                                  |
| Discussion | `start_discussion`, `post_message`, `get_discussion`, `close_discussion`, `check_consensus` |
| Vote       | `create_vote`, `cast_vote`, `get_vote_result`                                               |
| Handoff    | `log_handoff`, `get_handoff`, `ack_handoff`                                                 |
| Lock       | `lock_task`, `unlock_task`                                                                  |
| File       | `record_file_change`                                                                        |
| Event      | `broadcast_event`, `get_events`                                                             |

`get_file_history` is not part of v3.
It existed only in older README/root references.

## Agent Workflow

### 1. Start Work

```text
get_dashboard()
get_handoff(agent)
list_tasks(status?)
lock_task(task_id, agent)
update_state(agent, "working", task_id)
```

### 2. During Work

```text
record_file_change(task_id, path, agent, action)
post_message(thread_id, agent, message)
broadcast_event(event_type, agent, message)
```

### 3. Handoff

```text
log_handoff(from_agent, to_agent, task_id, summary)
ack_handoff(handoff_id, agent)
unlock_task(task_id, agent)
update_state(agent, "idle")
```

### 4. Session Lifecycle

```text
start_session(title, leader, goals)
close_session(session_id, summary)
submit_retro(session_id, agent, ...)
finalize_retro(session_id)
start_election(session_id)
cast_election_vote(election_id, agent, nominee)
get_election_result(election_id, auto_start_next=true)
```

## MACHO-GPT ZERO Rules

| Condition                                                     | Action                                          |
| ------------------------------------------------------------- | ----------------------------------------------- |
| `lock_task` returns `locked: true`                            | ZERO-T2: wait because another AI owns the task  |
| Work starts without checking `get_handoff`                    | ZERO-T1: stop because handoff was not confirmed |
| `get_dashboard` shows 2 or more blocked tasks                 | ZERO-T2: escalate                               |
| `finalize_retro` completes but `start_election` is not called | ZERO-T3: warn about session deadlock            |

## Development Commands

```powershell
npm run type-check
npm test
npm run lint
npm run format:check
npm run validate
npm run test:coverage
```

Quality gate:

```powershell
npm run validate
npm run test:coverage
npx wrangler deploy --dry-run --env="" --outdir .wrangler\dry-run
```

## Current Validation Snapshot

Last verified in this workspace:

```text
npm run validate        PASS
npm run test:coverage   PASS
npm run deploy          PASS
remote /health          200
remote ping             200
remote tools/list       31 tools
claude mcp list         dev-hub ✓ Connected
```

Last deployed Worker version:

```text
6e7a9320-4905-4ee2-85f7-b9bf6533ec19
```

## Security Notes

- Never commit `.cursor/mcp.json`.
- Never commit `.claude.json` if it contains a static `Authorization` header.
- Prefer `MCP_DEV_HUB_API_KEY` environment variable where the client supports it.
- Rotate Cloudflare Secret `API_KEY` immediately if a key appears in terminal output, chat, screenshots, or logs.
- Keep D1 as the single source of truth. Do not add file or memory caches for shared state.

## Troubleshooting

### `401 Unauthorized`

The client did not send the same key stored in Cloudflare Secret `API_KEY`.
Rotate and reapply the key across all clients.

### Claude shows `Failed to connect`

Check:

```powershell
claude mcp list
```

Then verify the Worker supports `ping`:

```powershell
$apiKey = (Get-Content -LiteralPath "$env:USERPROFILE\.codex\secrets\mcp-dev-hub-api-key.txt" -Raw).Trim()
Invoke-WebRequest `
  -Uri "https://mcp-dev-hub.mscho715.workers.dev/mcp" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $apiKey"; "content-type" = "application/json" } `
  -Body '{"jsonrpc":"2.0","id":1,"method":"ping","params":{}}' `
  -UseBasicParsing
```

### Cursor or OpenCode does not show `dev-hub`

Restart the app after editing config.
MCP clients usually load config at startup.

### D1 schema did not apply to production

Make sure `db:init:prod` includes `--remote`:

```powershell
npm run db:init:prod
```

Expected line:

```text
Resource location: remote
```
