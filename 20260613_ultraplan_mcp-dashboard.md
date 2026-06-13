# Ultraplan: MCP 전용 대시보드 (mcp-dev-hub v3)

> drafted: 2026-06-13 10:55 · status: **NEEDS REVIEW** · pipeline: ultraplan Phase 1

## Objective

Cloudflare Worker가 직접 서빙하는 **단일 HTML 대시보드**. AI(Codex·Claude·OpenCode·MiniMax) 간
작업/진행 상황을 실시간으로 보고, MCP 서버 자체의 헬스/상태를 한눈에 점검한다.
빌드 스텝·외부 의존성·프레임워크 없이(Workers 철학 유지) 순수 HTML+JS 문자열로 구현.

## Scope

### In

- `GET /dashboard` → 자체완결 HTML 페이지 (인증 불필요, 읽기 전용 셸)
- `GET /api/dashboard` → JSON (x-api-key 헤더 인증) — 페이지가 polling
- `GET /api/mcp-status` → MCP 헬스 (서버 버전·tool 수·D1 연결·이벤트 신선도)
- 기존 `getDashboard` 로직을 `buildDashboardData(db)`로 추출 → 라우트와 MCP tool이 공유 (중복 제거)
- 단위/통합 테스트 (라우트 200/401, JSON 스키마, mcp-status)

### Out

- 외부 차트 라이브러리·npm 패키지 (CSS/JS 인라인만)
- 쓰기 액션(태스크 생성·투표 등) — 읽기 전용 대시보드 (v2에서 검토)
- 실시간 push(WebSocket/SSE) — 우선 5s polling, 추후 과제
- 인증 로그인 화면 — API_KEY를 UI에서 1회 입력 → localStorage 저장

## Steps

1. **`src/dashboard/data.ts`** (신규) — `buildDashboardData(db)` + `buildMcpStatus(db)`
   - data: 기존 7개 쿼리(agents/session/tasks/discussions/votes/handoffs/events) 이전
   - mcpStatus: `SELECT 1` D1 ping, tool 개수, 최근 event age(초), 세션 stage,
     AI별 heartbeat(`updated_at` 경과 → online/stale/offline), **blocked≥2 / pending handoff 플래그**(ZERO 규칙 가시화)
2. **`src/tools/dashboard.ts`** 리팩터 — `getDashboard`가 `buildDashboardData` 재사용 (동작 불변, 회귀 테스트로 보증)
3. **`src/dashboard/page.ts`** (신규) — HTML 문자열 1개 export (`renderDashboardPage()`)
   - 다크 테마, 반응형, 인라인 CSS/JS, 0 외부 요청
   - 패널: ① AI 상태 그리드(heartbeat 점·progress 바) ② MCP 헬스 배지 ③ 활성 태스크
     ④ 토론/투표 ⑤ 대기 핸드오프 경고 ⑥ 이벤트 피드 ⑦ 세션 라이프사이클 단계
   - 5s auto-refresh + 수동 새로고침, API_KEY localStorage 입력 모달
4. **`src/index.ts`** — 라우트 3개 추가 (POST/MCP 경로보다 먼저, GET 분기)
   - `/dashboard` HTML, `/api/dashboard`·`/api/mcp-status` JSON(auth)
   - 기존 `/health`·`tools/call` 경로 불변
5. **테스트** `src/dashboard/*.test.ts` — page 200·CSP안전, api 401(무키)/200(유키), mcp-status 필드 검증
6. **검증** `npm run type-check && npm test && npm run lint` (0 에러 + 커버리지 80%)

## 추가 아이디어 (그외 — 채택/보류 표시)

| #   | 아이디어                                                | 가치                          | 이번 포함?  |
| --- | ------------------------------------------------------- | ----------------------------- | ----------- |
| 1   | AI heartbeat 점(online<2m/stale/offline)                | 누가 실제 살아있나 즉시 식별  | ✅ 포함     |
| 2   | ZERO 규칙 가시화 (blocked≥2 빨강, pending handoff 노랑) | CLAUDE.md MACHO 게이트를 UI로 | ✅ 포함     |
| 3   | task progress 바 (0–100)                                | 진행률 한눈에                 | ✅ 포함     |
| 4   | 세션 stage 타임라인 (active→retro→voting)               | 라이프사이클 위치             | ✅ 포함     |
| 5   | 이벤트 활동 피드(최근 15)                               | 무슨 일이 있었나              | ✅ 포함     |
| 6   | MCP tool 카탈로그 카운트 + /health 미러                 | 서버 상태 점검                | ✅ 포함     |
| 7   | SSE 실시간 push (polling 대체)                          | 지연 0                        | ⏸ v2        |
| 8   | 대시보드에서 직접 unlock/escalate 버튼                  | 운영 액션                     | ⏸ v2 (쓰기) |
| 9   | KPI 집계(평균 핸드오프 ACK 시간 등)                     | 회고 인사이트                 | ⏸ v2        |

## Design System (ui-ux-pro-max 도출)

- **Pattern**: Real-Time / Operations — Hero(상태)→핵심 지표→활동 피드
- **Style**: Dark Mode (OLED), WCAG AAA. light 미지원(ops 대시보드라 dark-only가 정답)
- **Color tokens** (CSS vars, semantic — 컴포넌트에 raw hex 금지)
  | 토큰 | 값 | 용도 |
  |------|-----|------|
  | `--bg` | `#0F172A` | 배경(deep slate) |
  | `--surface` | `#1E293B` | 카드/패널 |
  | `--muted` | `#272F42` | 보조 표면 |
  | `--border` | `#475569` | 구분선 |
  | `--fg` | `#F8FAFC` | 본문 |
  | `--accent` | `#22C55E` | online/run green(CTA·정상) |
  | `--danger` | `#EF4444` | blocked≥2·offline(ZERO 빨강) |
  | `--warn` | `#F59E0B` | stale·pending handoff(노랑, 팔레트 보강) |
- **Typography**: Fira Code(ID·태스크·수치 = tabular mono) / Fira Sans(라벨·본문). `font-display: swap`, **셀프호스트 불가 시 1회 CDN import**(외부요청 1개만 허용 — page.ts 상단 주석으로 명시)
- **Effects**: minimal glow(`text-shadow: 0 0 10px` 상태 점), 150–300ms 트랜지션, 가시 focus ring
- **a11y 게이트** (CRITICAL — 구현 시 필수)
  - 색만으로 의미 전달 금지 → heartbeat 점에 **텍스트/아이콘 동반**(online/stale/offline)
  - 대비 4.5:1↑, focus ring 2px, `prefers-reduced-motion` → auto-refresh 펄스·트랜지션 정지
  - SVG 아이콘만(이모지 금지), tabular figures로 수치 컬럼 정렬
  - 반응형 375/768/1024/1440, 가로 스크롤 0

## Risk / Assumptions

- **인증**: API_KEY를 쿼리스트링에 절대 안 넣음(보안 규칙) → x-api-key 헤더 + localStorage. `/dashboard` 셸 자체는 공개(민감정보 0, 데이터는 인증된 fetch로만).
- **vitest-pool-workers**: HTML 라우트 응답·헤더 테스트 가능 (기존 /health 테스트와 동일 패턴) — 가정, 1차 테스트로 확인.
- **index.ts 크기**: 라우트 추가로 800줄 안 넘음(현재 129줄). HTML은 별 파일로 분리해 비대화 방지.
- **D1 SSOT 유지**: 캐시·globalThis 0. 모든 데이터 매 요청 D1에서.
- **CORS**: 기존 `cors()` 재사용.

## Estimated

- 신규 4파일(data/page + 2 test), 수정 2파일(index/dashboard tool)
- ~10–15 tool calls, 큰 외부 리서치 불필요 (Workers HTML 서빙은 표준 패턴)

## EXECUTE? [yes / edit: <변경> / abort]
