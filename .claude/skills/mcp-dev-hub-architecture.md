---
name: mcp-dev-hub-architecture
description: mcp-dev-hub v3 아키텍처 — Cloudflare Workers + D1 + MCP 서버 구조. Use when "designing tools", "adding new MCP methods", "understanding session lifecycle".
---

# MCP DEV HUB Architecture

## 개요

GitHub/Linear 의존성 없이 **Codex·Claude·OpenCode·MiniMax** 4개 AI 간 개발 상황을 실시간 공유하는 **독립형 MCP 서버**. Cloudflare Workers + D1 만으로 완결.

## 4계층 구조

```
┌─────────────────────────────────────────────────┐
│  Layer 1: MCP Client (Codex/Claude/OpenCode/Mx) │  JSON-RPC 2.0 over HTTPS
└────────────────────┬────────────────────────────┘
                     │ x-api-key
┌────────────────────▼────────────────────────────┐
│  Layer 2: Cloudflare Worker (src/index.ts)      │  인증 + 라우팅 + CORS
└────────────────────┬────────────────────────────┘
                     │ Env.DB
┌────────────────────▼────────────────────────────┐
│  Layer 3: Tool Handlers (src/tools/*.ts)        │  32개 tools, 도메인별 분리
└────────────────────┬────────────────────────────┘
                     │ prepared statements
┌────────────────────▼────────────────────────────┐
│  Layer 4: D1 Database (SSOT)                    │  ai_state, tasks, handoff_log, ...
└─────────────────────────────────────────────────┘
```

## 핵심 파일

| 파일                    | 역할                             |
| ----------------------- | -------------------------------- |
| `src/index.ts`          | Worker 메인 (인증, 라우팅, CORS) |
| `src/tools/index.ts`    | Tool 레지스트리 (32개)           |
| `src/tools/session.ts`  | 세션 시작/종료                   |
| `src/tools/retro.ts`    | 회고 + MVP 선정                  |
| `src/tools/election.ts` | 리더 선출                        |
| `src/db/schema.sql`     | D1 스키마 (SSOT)                 |
| `wrangler.toml`         | Workers + D1 설정                |

## 의존성 방향

```
index.ts → tools/index.ts → tools/{domain}.ts → db/queries.ts → D1
```

순방향만 허용. 역방향 import 금지.

## 32개 Tool 카테고리

- **대시보드** (1): `get_dashboard`
- **세션** (3): `start_session`, `get_session`, `close_session`
- **회고** (3): `submit_retro`, `get_retro`, `finalize_retro`
- **선거** (3): `start_election`, `cast_election_vote`, `get_election_result`
- **상태** (2): `get_state`, `update_state`
- **태스크** (3): `create_task`, `list_tasks`, `update_task`
- **토론** (5): `start_discussion`, `post_message`, `get_discussion`, `close_discussion`, `check_consensus`
- **투표** (3): `create_vote`, `cast_vote`, `get_vote_result`
- **핸드오프** (3): `log_handoff`, `get_handoff`, `ack_handoff`
- **잠금** (2): `lock_task`, `unlock_task`
- **파일** (1): `record_file_change`
- **이벤트** (2): `broadcast_event`, `get_events`

## 자주 사용하는 명령어

```bash
npm run dev                # 로컬 워커
npm run db:init:local      # D1 로컬 스키마
npm run deploy             # 프로덕션 배포
npx wrangler tail          # 실시간 로그
npx wrangler d1 execute mcp-dev-hub-db --local --command="SELECT * FROM sessions"
```
