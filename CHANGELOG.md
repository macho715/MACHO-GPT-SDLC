# Changelog

이 프로젝트의 주요 변경 사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/)를 따르며,
버전은 [Semantic Versioning](https://semver.org/)을 따릅니다.

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
