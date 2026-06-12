# MCP DEV HUB v3

세션 시작 → 작업 → 토론/투표 → **세션 종료 → 전체 회고 → 리더 선출 → 다음 세션 자동 시작**

GitHub / Linear 없이 Cloudflare Workers + D1 만으로 완결.

---

## 전체 세션 라이프사이클

```
┌──────────────────────────────────────────────────────────────┐
│  PHASE 1: ACTIVE SESSION                                     │
│                                                              │
│  start_session(leader="codex")                               │
│      ↓                                                       │
│  create_task / start_discussion / post_message               │
│  lock_task / record_file_change / log_handoff                │
│      ↓                                                       │
│  close_session()  ──────────────────────────────────────┐   │
└─────────────────────────────────────────────────────────┼───┘
                                                          │
┌─────────────────────────────────────────────────────────▼───┐
│  PHASE 2: RETROSPECTIVE  (status = retro)                    │
│                                                              │
│  ← 모든 AI가 submit_retro() 호출 (잘된점/못된점/MVP 투표)   │
│                                                              │
│  get_retro()        ── 중간 현황 확인                        │
│  finalize_retro()   ── 집계 완료 + MVP 선정                  │
│      ↓                                                       │
└──────────────────────────────────────┬──────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────┐
│  PHASE 3: LEADER ELECTION  (status = voting)                 │
│                                                              │
│  start_election()             ── 선거 시작                   │
│  ← 모든 AI가 cast_election_vote() 호출                       │
│  get_election_result()        ── 결과 집계 + 다음 세션 생성  │
│      ↓                                                       │
└──────────────────────────────────────┬──────────────────────┘
                                       │
┌──────────────────────────────────────▼──────────────────────┐
│  PHASE 1 (반복): 새 리더로 다음 세션 자동 시작               │
└─────────────────────────────────────────────────────────────┘
```

---

## 실제 흐름 예시

### PHASE 1 — 세션 시작 (리더: Codex)

```
start_session({
  title: "Sprint-01 인증 모듈",
  leader: "codex",
  goals: ["JWT 구현", "OAuth 연동", "단위 테스트 80%"]
})
→ session_id: "SESS-001"

create_task({ title: "JWT 토큰 발급 API", session_id: "SESS-001", assigned_to: "codex" })
start_discussion({ task_id: "TASK-001", title: "토큰 만료 전략", initiated_by: "codex", ... })
... (작업 진행) ...
close_session({ session_id: "SESS-001", closed_by: "codex" })
→ status: retro, message: "모든 AI submit_retro 호출 필요"
```

### PHASE 2 — 회고

```
# Codex 제출
submit_retro({
  session_id: "SESS-001", agent: "codex",
  went_well:  ["JWT 구현 예정 기간 내 완료", "Claude 리뷰로 버그 3개 사전 차단"],
  went_wrong: ["OAuth 연동 범위 초반에 과소 추정", "OpenCode 투입 타이밍 늦음"],
  suggestions: ["다음 세션은 OAuth 범위 먼저 정의", "OpenCode 초반부터 lint 병행"],
  highlight: "JWT 핵심 구조 설계 완료",
  mvp_vote: "claude"
})

# Claude 제출
submit_retro({
  session_id: "SESS-001", agent: "claude",
  went_well:  ["토론에서 flat API 구조로 합의 신속", "핸드오프 기록 체계적"],
  went_wrong: ["MiniMax 초안 품질 편차 컸음"],
  suggestions: ["MiniMax에 템플릿 제공"],
  highlight: "API 구조 결정 컨센서스 달성",
  mvp_vote: "codex"
})

# OpenCode 제출
submit_retro({
  session_id: "SESS-001", agent: "opencode",
  went_well:  ["lint 자동화로 PR 오류 0건"],
  went_wrong: ["세션 후반 투입돼 초반 맥락 부족"],
  suggestions: ["세션 시작부터 참여"],
  mvp_vote: "codex"
})

# MiniMax 제출
submit_retro({
  session_id: "SESS-001", agent: "minimax",
  went_well:  ["테스트 케이스 초안 8개 생성"],
  went_wrong: ["일부 엣지케이스 누락"],
  suggestions: ["Claude와 사전 리뷰 협업"],
  mvp_vote: "claude"
})

# 집계
finalize_retro({ session_id: "SESS-001" })
→ {
    mvp_agent: "codex",         ← 3표 (claude, opencode, minimax)
    top_went_well: [
      "JWT 구현 완료 (2표)",
      "버그 사전 차단 (1표)",
      "lint 자동화 (1표)"
    ],
    top_went_wrong: [
      "범위 과소 추정 (1표)",
      "OpenCode 타이밍 (1표)"
    ],
    top_suggestions: [
      "OAuth 범위 먼저 정의 (1표)",
      "OpenCode 초반 투입 (2표)"
    ],
    next_step: "start_election 호출"
  }
```

### PHASE 3 — 리더 선출

```
start_election({ session_id: "SESS-001" })
→ election_id: 1

cast_election_vote({ election_id: 1, agent: "codex",    nominee: "claude",   reason: "리뷰 품질 최고" })
cast_election_vote({ election_id: 1, agent: "claude",   nominee: "claude",   reason: "API 설계 주도" })
cast_election_vote({ election_id: 1, agent: "opencode", nominee: "claude",   reason: "컨센서스 능력" })
cast_election_vote({ election_id: 1, agent: "minimax",  nominee: "codex",    reason: "구현 속도" })

get_election_result({ election_id: 1, auto_start_next: true })
→ {
    tally: { claude: 3, codex: 1 },
    winner: "claude",
    next_session_id: "SESS-002",    ← 자동 생성
    message: "🏆 선출된 다음 세션 리더: claude"
  }
```

---

## 동률 처리

```
tally: { codex: 2, claude: 2 }
→ is_tie: true
→ tie_candidates: ["codex", "claude"]
→ message: "동률 — 재투표 또는 human 결정 필요"

# 재투표: start_election 다시 호출 (nominees를 tie_candidates로 제한)
start_election({ session_id: "SESS-001", nominees: ["codex", "claude"] })
```

---

## Tool 전체 목록 (32개)

| 카테고리 | Tools                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------- |
| 대시보드 | `get_dashboard`                                                                                 |
| **세션** | `start_session` / `get_session` / `close_session`                                               |
| **회고** | `submit_retro` / `get_retro` / `finalize_retro`                                                 |
| **선거** | `start_election` / `cast_election_vote` / `get_election_result`                                 |
| 상태     | `get_state` / `update_state`                                                                    |
| 태스크   | `create_task` / `list_tasks` / `update_task`                                                    |
| 토론     | `start_discussion` / `post_message` / `get_discussion` / `close_discussion` / `check_consensus` |
| 투표     | `create_vote` / `cast_vote` / `get_vote_result`                                                 |
| 핸드오프 | `log_handoff` / `get_handoff` / `ack_handoff`                                                   |
| 잠금     | `lock_task` / `unlock_task`                                                                     |
| 파일     | `record_file_change`                                                                            |
| 이벤트   | `broadcast_event` / `get_events`                                                                |

---

## 배포

```bash
npm install
wrangler d1 create mcp-dev-hub-db   # → database_id를 wrangler.toml에 입력
wrangler d1 execute mcp-dev-hub-db --file=src/db/schema.sql
wrangler secret put API_KEY
wrangler deploy
```
