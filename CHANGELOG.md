# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/)를 따르며,
버전은 [Semantic Versioning](https://semver.org/)을 따릅니다.

## [Unreleased] - 2026-06-13

### Added

- **상태 대시보드** (`GET /dashboard`): AI 상태·세션 라이프사이클·태스크·토론/투표·핸드오프·이벤트 피드를 5초 polling으로 표시하는 자체 완결 HTML 셸 (`src/dashboard/page.ts`, `data.ts`)
- **프로젝트별 세션 패널**: `start_session`에 `project`(로컬 폴더 경로) 인자 추가 + `session.project` 컬럼·`idx_session_project` 인덱스. 폴더 기준으로 세션을 그룹화해 표시 (`src/dashboard/projects.ts`, `buildProjectSessions`)
- **Collapsible 카드 패널**: 각 패널 헤더(button) 클릭/Enter/Space로 본문 접기·펴기. `grid-template-rows 1fr↔0fr` 트랜지션, chevron 회전, `aria-expanded`/`aria-controls` 접근성, 접힘 상태 `localStorage` 영속화 (commit `926bf33`)
- 로딩 skeleton·빈 상태 아이콘·서버 연결 끊김 자동 재시도 배너 (`prefers-reduced-motion` 준수)
- 데스크톱 런처 스크립트 `start-dashboard.cmd` / `stop-dashboard.cmd` / `make-shortcuts.ps1`
- **에이전트 heartbeat 가이드** (`docs/agent-heartbeat.md`): codex 등 AI가 `update_state`로 대시보드에 `online` 보고하는 MCP 등록·호출법 + 기존 seed 행 정리 SQL (commit `52518ee`)
- presence 한글 라벨(`온라인`/`지연`/`오프라인`/`미연결`) (`src/dashboard/page.ts`, commit `52518ee`)
- **dev hub 작업 이어받기 트리거** (`docs/dev-hub-pickup.md`): 채팅에 `dev hub`/`/dev-hub` 입력 시 `get_handoff`→`get_dashboard`→`list_tasks` 고정 시퀀스로 인계 작업을 이어받음. codex·opencode 공유 `AGENTS.md`, `CLAUDE.md`, `.claude/commands/dev-hub.md` 트리거 + codex 전역 `~/.codex/AGENTS.md`·`prompts/dev-hub.md` (commit `ee977ef`)
- **세션 헤더 로컬 폴더 칩**: 활성 세션 헤더에 `session.project` 경로의 폴더명(basename)을 칩으로 표시 — 어느 폴더 세션인지 한눈에 식별. 미지정 시 안내 툴팁 달린 "폴더 미지정" 회색 칩 (`src/dashboard/page.ts`, commit `fc8b656`)
- **대시보드 dev hub 사용법 패널 + 사용자 편의성**: 헤더 아래 접이식 사용법 패널(트리거·3단계·분기), 트리거 칩 클릭→클립보드 복사(복사됨 피드백), 헤더 "전체 접기/펼치기" 1버튼, 키보드 단축키(`r`=새로고침·`?`=도움말 토글) (`src/dashboard/page.ts`, commit `4e9cfd2`)

### Changed

- **대시보드 데이터 API를 공개 읽기 전용으로 전환**: `GET /api/dashboard`·`/api/mcp-status`·`/api/projects`는 인증 없이 조회 가능(키 입력 프롬프트 제거). 쓰기(POST·MCP 도구)는 `x-api-key` 인증 유지 (commit `ddf365d`)
- **4번째 협업 AI를 `minimax` → `hermes`로 교체**: seed 행·도구 enum(`agent` 파라미터)·전방 참조 문서를 모두 `hermes`로 변경. `src/db/schema.sql` seed `updated_at=NULL`, 도구 계약 스냅샷 재생성. 과거 마이그레이션·이력 기록은 보존(historical). 프로덕션 D1은 `UPDATE ai_state SET agent='hermes' WHERE agent='minimax'`로 이관

### Fixed

- **미연결 에이전트가 `offline`(빨강)으로 오인되던 문제**: seed 행을 `updated_at=NULL`로 등록해 한 번도 heartbeat가 없는 에이전트는 `unknown`(회색·미연결)으로 표시, `offline`(연결됐다 끊김)과 구분. 첫 `update_state` 호출 시 `online`으로 전환 (`src/db/schema.sql`, `src/dashboard/data.ts`, commit `52518ee`). 배포 `391f073d` + 프로덕션 D1 seed 행(codex·minimax) `updated_at=NULL` 일회성 마이그레이션 적용

### Removed

- `DASHBOARD_AUTOFILL` 환경 플래그 — 대시보드가 공개 읽기 전용이 되어 로컬 키 자동주입이 불필요해짐 (commit `ddf365d`)

## [3.0.1] - 2026-06-13

### Fixed

- `nextId`가 `COUNT(*)+1` 대신 `MAX(suffix)+1`을 사용하도록 수정 — 중간 행 삭제(gap) 시 기존 ID를 재생성해 `start_session`에서 `UNIQUE constraint failed`가 발생하던 P0 버그 해결 (`src/lib/mcp.ts`, commit `c150810`)
- 비-UTF-8(CP949 등) 요청 body가 `U+FFFD`로 손상된 채 D1에 저장되던 문제 — 진입점(`src/index.ts`)에서 `U+FFFD` 포함 body를 `-32602`로 거부 (commit `91f7846`)

### Added

- dev-hub MCP 프로젝트 연결: `.mcp.json` (시크릿은 `${MCP_DEV_HUB_API_KEY}` 환경변수 참조)
- `nextId` 단위 테스트(`src/lib/mcp.test.ts`) 및 UTF-8 가드 테스트(`src/index.test.ts`)

### Changed

- `compatibility_date` `2025-01-01` → `2026-06-13` (Cloudflare Workers Best Practices 권장: 현재 날짜) (`wrangler.toml`, commit `405db42`)
- `vitest.config.ts`가 런타임 호환 설정을 `wrangler.toml`에서 상속(single source of truth) — 테스트/프로덕션 런타임 drift 방지
- 리뷰어 서브에이전트(`cloudflare-d1-reviewer`, `mcp-protocol-reviewer`)를 읽기 전용 도구(`Read, Glob, Grep, Bash`)로 스코핑 (commit `df27664`)

### Removed

- 레거시 v1/v2/root-v3 참조 코드(`_legacy/`) 완전 제거 (commit `c1557bb`)

## [3.0.0] - 2026-06-12

### Added

- MCP DEV HUB v3 초기 릴리스 — Session Lifecycle + Retro + Leader Election
- 31개 MCP 도구 (session/retro/election/state/task/discussion/vote/handoff/file/event/dashboard)
- Cloudflare Workers + D1 (SSOT) 아키텍처, 브랜치 커버리지 83.38%
