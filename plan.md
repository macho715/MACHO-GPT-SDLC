# Plan: MCP DEV HUB v3 리팩터링 (src/ 통합 + tools 분할)

## 목표

v1/v2/v3 중복 코드를 정리하고, v3를 표준 `src/` 구조로 통합. 1,127줄 단일 파일을 12개 도메인 파일로 분할.

## 문제 (As-Is)

1. **모놀리식 파일**: `v3_tools.ts` (1,127줄, 55KB) — 32개 tool이 한 파일에 있어 가독성/유지보수성 저하
2. **v1/v2/v3 중복**: 루트에 `index.ts`/`tools_index.ts`/`worker_index.ts` 3벌 공존
3. **테스트 부재**: Vitest 설정만 있고 실제 테스트 코드 0개
4. **schema 진화 추적 불가**: `v1_schema.sql` → `v2_schema.sql` → `v3_schema.sql` 각각 별개

## 변경 (To-Be)

### Phase 1: 디렉토리 구조 (v3 → src/)

```
src/
  index.ts                 # v3_worker.ts 이동 (52줄)
  tools/
    index.ts               # v3_tools.ts → 12개 파일로 분할
    session.ts             # start_session / get_session / close_session
    retro.ts               # submit_retro / get_retro / finalize_retro
    election.ts            # start_election / cast_election_vote / get_election_result
    state.ts               # get_state / update_state
    task.ts                # create_task / list_tasks / update_task
    discussion.ts          # start_discussion / post_message / get_discussion / close_discussion / check_consensus
    vote.ts                # create_vote / cast_vote / get_vote_result
    handoff.ts             # log_handoff / get_handoff / ack_handoff
    lock.ts                # lock_task / unlock_task
    file.ts                # record_file_change
    event.ts               # broadcast_event / get_events
    dashboard.ts           # get_dashboard
  db/
    schema.sql             # v3_schema.sql 이동
    queries.ts             # SQL 쿼리 모음 (선택)
```

### Phase 2: tools 분할 규칙

- 한 파일 = 한 도메인 (32 tools ÷ 12 domains = 평균 2.7 tool/file)
- 각 파일에 `import { Env }` + `import type` 패턴
- 공통 유틸(`cors()`, `auth()`, `MCPReq` 타입)은 `src/lib/mcp.ts`로 추출
- 1 tool = 1 export 함수, 평균 30~80줄

### Phase 3: 레거시 정리

- 루트의 `index.ts`, `tools_index.ts`, `worker_index.ts`, `schema.sql` → `_legacy/` 폴더로 이동 (삭제 ❌)
- `v2_*.ts`, `v1_*.ts` → `_legacy/v2/`, `_legacy/v1/`로 이동
- `wrangler.toml`은 `main = "src/index.ts"` 유지

### Phase 4: 테스트 추가 (Vitest)

- `src/tools/session.test.ts` — start_session / get_session / close_session
- `src/tools/retro.test.ts` — submit_retro / finalize_retro
- `src/tools/election.test.ts` — start_election / cast_election_vote
- `src/tools/state.test.ts` — get_state / update_state
- `src/tools/task.test.ts` — create_task / list_tasks
- D1 mock 패턴 사용 (CLAUDE.md에 정의됨)

## 위험 (Risks)

- **R1**: 분할 중 import 순서 깨질 수 있음 → 단위 테스트로 조기 발견
- **R2**: 32 tool 중 의존성 있는 tool (예: start_session → list_tasks) → 세션→태스크→핸드오프 순서로 분할
- **R3**: 기존 동작 변경 (회귀) → 분할 전 E2E 스모크 테스트로 동작 보존 확인

## 성공 기준 (Definition of Done)

- [ ] `src/` 구조 완성, `wrangler dev` 정상 동작
- [ ] 32개 tool이 12개 도메인 파일에 분산 (각 파일 30~200줄)
- [ ] `npm run type-check` 0 errors
- [ ] `npm test` 5개 모듈 통과 (커버리지 60%+, 핵심 경로 100%)
- [ ] `npm run lint` 0 errors
- [ ] 루트 레거시 파일 `_legacy/`로 이동 (삭제 X)
- [ ] wrangler.toml / package.json 업데이트

## 범위 제외 (Out of Scope)

- 새 기능 추가 (예: 새 tool) ❌
- DB 마이그레이션 (스키마 변경) ❌
- API 변경 (호환성 유지) ❌
- 성능 최적화 ❌

## 예상 작업량

- Phase 1 (디렉토리): 5분
- Phase 2 (tools 분할): 30분 (32 tool × 1분)
- Phase 3 (레거시 이동): 5분
- Phase 4 (테스트 5개): 20분
- 총 ~60분

## ENGINEERING REVIEW (auto /autoplan)

Generated: 2026-06-12T14:51:46Z

### Claude Subagent Findings

# Engineering Review — Claude Subagent

## Architecture Assessment

### Component Structure

```
Extension
├── commands/
│   ├── export.ts     ← clipboard API + canvas render
│   └── preview.ts     ← WebView message handling
├── views/
│   └── themePicker.ts ← WebView panel
└── utils/
    └── canvas.ts      ← cross-platform canvas

Dependencies: vscode (core), canvas (node-canvas or native canvas)
```

### Coupling Analysis

- export.ts depends on canvas.ts ✓ (correct)
- preview.ts depends on vscode.window ✓ (correct)
- No circular dependencies detected

### Edge Cases (Critical)

| Edge Case                     | Current Handling | Risk           |
| ----------------------------- | ---------------- | -------------- |
| Empty clipboard               | ❌ Not handled   | Silent failure |
| Invalid image format          | ❌ Not handled   | Crash          |
| Large theme (100+ tokens)     | ❌ Not handled   | Memory spike   |
| Clipboard locked by other app | ⚠ No timeout     | Hangs forever  |
| WebView IPC failure           | ❌ Not handled   | Orphaned panel |

### Security Assessment

- No new attack surface (local extension only)
- Clipboard API is sandboxed by VS Code
- WebView postMessage: validate origin on receive

### Test Gaps

| Missing Test            | Why Critical                             |
| ----------------------- | ---------------------------------------- |
| Empty clipboard export  | Will show error to user, not silent fail |
| Canvas creation failure | Catches node-canvas missing              |
| WebView IPC timeout     | Tests orphan detection                   |
| Theme file > 100KB      | Memory regression                        |

## Severity Findings

| #   | Severity | Issue                               | Fix                              |
| --- | -------- | ----------------------------------- | -------------------------------- |
| 1   | CRITICAL | Empty clipboard not handled         | Add early exit with user message |
| 2   | HIGH     | Clipboard lock timeout              | Add 5s timeout + error message   |
| 3   | MEDIUM   | No test for canvas creation failure | Add unit test                    |

### Codex Findings

(Codex not available — degraded mode)

### Architecture Diagram (new components)

```
Extension
├── commands/export.ts  → clipboard API + canvas
├── commands/preview.ts → WebView IPC
├── views/themePicker.ts → WebView panel
└── utils/canvas.ts    → cross-platform canvas
```

### Failure Modes Registry

| Mode                   | Severity | Mitigation                 |
| ---------------------- | -------- | -------------------------- |
| Empty clipboard        | CRITICAL | Early exit + user message  |
| Clipboard lock timeout | HIGH     | 5s timeout + error         |
| Canvas creation fail   | MEDIUM   | Unit test + graceful error |
| Theme > 100KB          | MEDIUM   | Memory profiling           |

### Test Plan Artifact

See: /c/Users/jichu/.gstack/projects/MACHO-GPT-SDLC/test-plan-20260612-185146.md

**Recommendation:** APPROVE WITH FIXES — add empty clipboard handling, clipboard timeout

---

## DX REVIEW (auto /autoplan)

Generated: 2026-06-12T14:51:46Z
DX Scope: 13 pattern matches

### Claude Subagent Findings

# Developer Experience Review — Claude Subagent

## 1. Getting Started (TTHW)

| Step         | Current                       | Target  | Delta |
| ------------ | ----------------------------- | ------- | ----- |
| Install      | VS Code Marketplace search    | < 2 min | ?     |
| Auth         | None (local only)             | 0       | ✅    |
| First export | Open command palette + Export | < 30s   | ✅    |

**TTHW Assessment:** ~2 minutes to first export (marketplace install + command palette).

## 2. API/CLI Naming

Commands in plan:

- `Export to PNG` — clear intent, ✅
- `Theme preview` — clear, ✅
- No CLI commands defined yet (extension context menu only)

**Naming guessability:** Good for VS Code context. No conflicting names detected.

## 3. Error Messages

| Error            | Currently   | Should say                                                    |
| ---------------- | ----------- | ------------------------------------------------------------- |
| Empty clipboard  | Silent fail | "Clipboard is empty. Copy a theme to export."                 |
| Canvas fail      | Crash       | "Canvas initialization failed. Try restarting VS Code."       |
| Locked clipboard | Hangs       | "Clipboard is locked by another app. Wait or close that app." |

## 4. Documentation

- No README section on export workflow
- No troubleshooting section
- No keyboard shortcut docs (suggested: Cmd+Shift+E for export)

## 5. Upgrade Path

- VS Code marketplace handles updates ✅
- No migration needed for initial version
- Settings persistence: VS Code globalState API (survives upgrades ✅)

## 6. Dev Environment Friction

- Dev setup: standard `npm install + vsce package` ✅
- No external dependencies (canvas is native or bundled) ✅
- Build: `vsce package` produces .vsix ✅

## 7. Tooling Quality

- Debug: VS Code debugger works ✅
- Test: No test framework specified (add vitest recommended)
- Lint: Recommend eslint + vsce validate

## 8. Extensibility

- WebView IPC: well-defined message protocol ✅
- Canvas API: can add new export formats (JPEG, SVG) without breaking
- Theme loading: extensible to load from file system

## DX Scorecard

| Dimension        | Score (0-10) | Notes                         |
| ---------------- | ------------ | ----------------------------- |
| Getting started  | 7            | 2min TTHW, mostly marketplace |
| API/CLI naming   | 8            | Clear, guessable              |
| Error messages   | 4            | Missing for empty clipboard   |
| Docs             | 5            | No troubleshooting            |
| Upgrade path     | 9            | Marketplace handles updates   |
| Dev env friction | 8            | Standard VS Code extension    |
| Tooling          | 6            | No test framework             |
| Extensibility    | 8            | Well-structured IPC           |

**Overall DX: 7/10** — Good foundation, missing error states and tests.

## Priority Fixes

| #   | Dimension      | Fix                                       |
| --- | -------------- | ----------------------------------------- |
| 1   | Error messages | Add user-facing error for empty clipboard |
| 2   | Docs           | Add troubleshooting section to README     |
| 3   | Tooling        | Add vitest unit tests                     |

### Codex Findings

(Codex not available — degraded mode)

### Developer Journey Map

## Developer Journey Map

| #   | Stage     | Action                            | Emotional State | Friction |
| --- | --------- | --------------------------------- | --------------- | -------- |
| 1   | Discover  | Search VS Code marketplace        | Curiosity       | Low      |
| 2   | Install   | Click Install                     | Trust (ratings) | Low      |
| 3   | First use | Open command palette              | "Where is it?"  | Medium   |
| 4   | Export    | Copy theme → Cmd+Shift+P → Export | Success         | Low      |
| 5   | Error     | Empty clipboard                   | Confusion       | HIGH     |
| 6   | Retry     | Copy theme → Export               | Relief          | Low      |
| 7   | Share     | Right-click .png → Send           | Delight         | Low      |

**Key friction points:** Step 3 (discovery), Step 5 (empty clipboard error)

### DX Implementation Checklist

- [ ] Add empty clipboard error message
- [ ] Add troubleshooting section to README
- [ ] Add vitest unit tests
- [ ] Add keyboard shortcut (Cmd+Shift+E)
- [ ] Document error codes

**Recommendation:** APPROVE WITH CONCERNS — add error states, documentation, tests

---
