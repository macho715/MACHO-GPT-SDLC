# SYSTEM LAYOUT — mcp-dev-hub v3

> 파일·폴더 배치와 각 파일의 책임 전용 문서. 시스템 구조·데이터 흐름은 [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md), 사용법·배포는 [README.md](README.md) 참조.
> 최종 갱신: 2026-06-13

## 디렉터리 트리

```text
mcp-dev-hub/
├─ src/
│  ├─ index.ts                # Worker fetch 엔트리포인트 + MCP 메서드 분기 + UTF-8 경계 가드
│  ├─ lib/                    # 횡단 관심사 (cross-cutting)
│  │  ├─ auth.ts              # API_KEY 인증 (x-api-key / Bearer)
│  │  ├─ cors.ts              # CORS 헤더 래퍼
│  │  ├─ errors.ts            # JSON-RPC 에러 코드 + jsonRpcError 재노출
│  │  ├─ db.ts                # DB 헬퍼 재노출 (nextId 등)
│  │  └─ mcp.ts               # MCP 타입·공유 헬퍼·nextId(MAX 기반 ID 생성)
│  ├─ db/
│  │  ├─ schema.sql           # D1 스키마 16테이블 (SSOT — 컬럼 정의 원본)
│  │  └─ queries.ts           # SQL 쿼리 모듈
│  ├─ tools/                  # 10개 도메인 × 31개 MCP 도구
│  │  ├─ index.ts             # 도구 레지스트리 + tools/call 라우터
│  │  ├─ dashboard.ts         # get_dashboard
│  │  ├─ session.ts           # start_session / get_session / close_session
│  │  ├─ retro.ts             # submit_retro / get_retro / finalize_retro
│  │  ├─ election.ts          # start_election / cast_election_vote / get_election_result
│  │  ├─ state.ts             # get_state / update_state
│  │  ├─ task.ts              # create_task / list_tasks / update_task
│  │  ├─ discussion.ts        # start_discussion / post_message / get_discussion / close_discussion / check_consensus
│  │  ├─ vote.ts              # create_vote / cast_vote / get_vote_result
│  │  ├─ handoff.ts           # log_handoff / get_handoff / ack_handoff
│  │  ├─ lock.ts              # lock_task / unlock_task
│  │  ├─ file.ts              # record_file_change
│  │  └─ event.ts             # broadcast_event / get_events
│  └─ dashboard/              # 상태 대시보드 렌더
│     ├─ data.ts              # 대시보드 데이터 집계 (buildDashboardData / buildMcpStatus)
│     ├─ projects.ts          # 프로젝트(로컬 폴더)별 세션 그룹 집계 (buildProjectSessions, 2026-06-13)
│     └─ page.ts              # 대시보드 HTML 셸 렌더 (공개 읽기, collapsible 패널)
├─ tests/
│  └─ helpers/d1Mock.ts       # D1 테스트 더블 (handler 기반)
├─ docs/
│  └─ traceability/
│     └─ tool-inventory-v3.md # v3 도구 인벤토리
├─ .mcp.json                  # 프로젝트 스코프 dev-hub MCP 연결 (시크릿은 env var 참조)
├─ wrangler.toml              # Worker 설정 (compatibility_date·D1 바인딩)
├─ vitest.config.ts           # 테스트 설정 (런타임 호환값을 wrangler.toml에서 상속 — single source)
├─ package.json               # npm 스크립트·의존성
├─ tsconfig.json              # TypeScript strict 설정
├─ CHANGELOG.md               # 변경 이력 (Keep a Changelog)
├─ CLAUDE.md                  # 개발 워크플로우·컨벤션
├─ AGENTS.md                  # 멀티-AI 협업 규칙
├─ README.md                  # 개요·설정·배포·도구 인벤토리
├─ SYSTEM_ARCHITECTURE.md     # 시스템 구조·요청 흐름·데이터 모델
└─ SYSTEM_LAYOUT.md           # (이 문서) 파일·폴더 배치
```

> `*.test.ts`는 각 소스 파일과 같은 위치에 둔다 (예: `src/lib/mcp.test.ts`, `src/index.test.ts`, `src/tools/*.test.ts`).

## 단위·통합 테스트 배치

| 테스트 파일               | 대상                                    |
| ------------------------- | --------------------------------------- |
| `src/index.test.ts`       | 엔트리포인트·인증·UTF-8 가드·tools/list |
| `src/lib/mcp.test.ts`     | `nextId` ID 생성 (충돌 방지)            |
| `src/tools/*.test.ts`     | 각 도메인 도구                          |
| `tests/helpers/d1Mock.ts` | D1 테스트 더블 (단위 테스트용)          |

## 설정 파일 한눈에

| 파일               | 핵심 내용                                                     |     git 추적     |
| ------------------ | ------------------------------------------------------------- | :--------------: |
| `wrangler.toml`    | `compatibility_date`, `nodejs_compat`, D1 바인딩 `env.DB`     |        ✅        |
| `vitest.config.ts` | `configPath`로 wrangler.toml 상속, 커버리지 임계(80/80/75/80) |        ✅        |
| `.mcp.json`        | dev-hub 엔드포인트 + `Bearer ${MCP_DEV_HUB_API_KEY}`          | ✅ (시크릿 없음) |
| `.dev.vars`        | 로컬 `API_KEY`                                                |   ❌ gitignore   |
| `.cursor/mcp.json` | Cursor 로컬 키                                                |   ❌ gitignore   |

## 레거시

레거시 v1/v2/root-v3 참조 코드는 **2026-06-13 완전히 제거**되었다(commit `c1557bb`). 활성 코드는 `src/`만 존재한다.
