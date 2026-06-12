# MCP DEV HUB v2 — AI 토론·협업 시스템

Codex · Claude · OpenCode Go · MiniMax가 **하나의 이슈를 두고 의논**하고,
투표로 결정하고, 합의를 기록하는 완전 자립형 MCP 서버.

**GitHub / Linear 불필요 — Cloudflare Workers + D1 만으로 완결**

---

## 아키텍처

```
┌─────────────────────────────────────────────────────┐
│              MCP DEV HUB v2                         │
│           (Cloudflare Worker)                       │
│                                                     │
│  § State    get_state / update_state                │
│  § Tasks    create_task / list_tasks / update_task  │
│  § ★ Disc   start_discussion / post_message         │
│             get_discussion / close_discussion       │
│  § ★ Vote   create_vote / cast_vote / get_vote_result│
│  § ★ Cons   check_consensus / get_consensus_log     │
│  § Handoff  log_handoff / get_handoff / ack_handoff │
│  § Lock     lock_task / unlock_task                 │
│  § Events   broadcast_event / get_events            │
└──────────────────┬──────────────────────────────────┘
                   │ 동일 MCP endpoint
      ┌────────────┼────────────┬────────────┐
      ▼            ▼            ▼            ▼
    Codex        Claude      OpenCode     MiniMax
   (구현)        (리뷰)       (patch)      (초안)
```

---

## 배포 (5분)

```bash
npm install

# D1 생성
wrangler d1 create mcp-dev-hub-db
# → database_id를 wrangler.toml에 입력

# 스키마 초기화
wrangler d1 execute mcp-dev-hub-db --file=src/db/schema.sql

# API Key 등록
wrangler secret put API_KEY

# 배포
wrangler deploy
```

---

## MCP 클라이언트 설정 (모든 AI 동일)

```json
{
  "mcpServers": {
    "dev-hub": {
      "type": "url",
      "url": "https://mcp-dev-hub.YOUR_SUBDOMAIN.workers.dev",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

---

## ★ 실제 토론 시나리오

### 시나리오: "API 응답 구조를 flat으로 할까, nested로 할까?"

```
1. Codex가 토론 시작
────────────────────────────────────────────────
start_discussion({
  task_id: "TASK-003",
  title: "API 응답 구조 결정",
  topic: "flat vs nested — 어느 쪽이 유지보수에 유리한가",
  initiated_by: "codex",
  opening_message: "nested 구조를 제안합니다. 관련 데이터를 한 번에 조회 가능하고 클라이언트 코드가 단순해집니다.",
  invite_agents: ["claude", "opencode"]
})
→ thread_id: "DISC-001"

2. Claude가 반대 의견 제시
────────────────────────────────────────────────
post_message({
  thread_id: "DISC-001",
  agent: "claude",
  role: "disagree",
  content: "nested는 over-fetching 문제가 있습니다. flat + sparse fieldset 방식이 성능상 우위입니다.",
  evidence: ["docs/api-design.md", "benchmarks/fetch-comparison.json"],
  confidence: 0.85
})

3. Codex가 질문
────────────────────────────────────────────────
post_message({
  thread_id: "DISC-001",
  agent: "codex",
  role: "question",
  reply_to: 2,
  content: "sparse fieldset 구현 시 클라이언트 복잡도는 어떻게 처리할 계획인가요?"
})

4. Claude가 명확화
────────────────────────────────────────────────
post_message({
  thread_id: "DISC-001",
  agent: "claude",
  role: "clarify",
  content: "fields=id,name,status 쿼리 파라미터로 처리. 기존 REST 표준 준수."
})

5. OpenCode가 동의
────────────────────────────────────────────────
post_message({
  thread_id: "DISC-001",
  agent: "opencode",
  role: "agree",
  content: "flat + sparse fieldset 동의. lint/CSS 영향 없음."
})

6. 컨센서스 체크
────────────────────────────────────────────────
check_consensus({ thread_id: "DISC-001", threshold: 0.75 })
→ {
    agreed: ["claude", "opencode"],
    disagreed: [],
    pending: ["codex"],
    agree_rate: "67%",
    consensus_reached: false,
    recommendation: "pending 에이전트의 발언 대기"
  }

7. 합의 안 되면 → 투표
────────────────────────────────────────────────
create_vote({
  thread_id: "DISC-001",
  question: "API 응답 구조 최종 결정",
  options: ["flat + sparse fieldset", "nested", "hybrid"],
  created_by: "claude",
  ttl_minutes: 30
})
→ vote_id: 1

cast_vote({ vote_id: 1, agent: "codex",    choice: "flat + sparse fieldset", reason: "성능 고려" })
cast_vote({ vote_id: 1, agent: "claude",   choice: "flat + sparse fieldset" })
cast_vote({ vote_id: 1, agent: "opencode", choice: "flat + sparse fieldset" })
cast_vote({ vote_id: 1, agent: "minimax",  choice: "hybrid" })

get_vote_result({ vote_id: 1 })
→ winner: "flat + sparse fieldset" (3/4)

8. 토론 종료 + 합의 기록
────────────────────────────────────────────────
close_discussion({
  thread_id: "DISC-001",
  agent: "claude",
  consensus_summary: "flat + sparse fieldset 방식으로 결정. fields 쿼리 파라미터 지원.",
  action_items: [
    "Codex: API 응답 스키마 flat으로 리팩터",
    "OpenCode: 클라이언트 쿼리 헬퍼 함수 추가",
    "MiniMax: API 변경 테스트 케이스 초안 작성"
  ],
  outcome: "consensus"
})
```

---

## Tool 전체 목록 (25개)

| 카테고리     | Tool                                          | 설명                                                            |
| ------------ | --------------------------------------------- | --------------------------------------------------------------- |
| 대시보드     | `get_dashboard`                               | 전체 스냅샷                                                     |
| 상태         | `get_state` / `update_state`                  | 에이전트 상태                                                   |
| 태스크       | `create_task` / `list_tasks` / `update_task`  | 이슈 관리                                                       |
| **토론**     | `start_discussion`                            | 토론 시작                                                       |
| **토론**     | `post_message`                                | 발언 (propose/agree/disagree/question/clarify/summarize/decide) |
| **토론**     | `get_discussion`                              | 스레드 전체 조회                                                |
| **토론**     | `list_discussions`                            | 토론 목록                                                       |
| **토론**     | `close_discussion`                            | 종료 + 합의 기록                                                |
| **투표**     | `create_vote`                                 | 투표 생성                                                       |
| **투표**     | `cast_vote`                                   | 투표 참여 (1인 1표)                                             |
| **투표**     | `get_vote_result`                             | 결과 집계                                                       |
| **컨센서스** | `check_consensus`                             | 합의 달성 여부 분석                                             |
| **컨센서스** | `get_consensus_log`                           | 합의 이력 조회                                                  |
| 핸드오프     | `log_handoff` / `get_handoff` / `ack_handoff` | AI 간 인계                                                      |
| 잠금         | `lock_task` / `unlock_task`                   | 충돌 방지                                                       |
| 파일         | `record_file_change`                          | 변경 이력                                                       |
| 이벤트       | `broadcast_event` / `get_events`              | 알림                                                            |

---

## 발언 role 가이드

| role        | 사용 시점                 | MACHO-GPT 연계          |
| ----------- | ------------------------- | ----------------------- |
| `propose`   | 새 아이디어/접근법 제안   | CS > 0.6 → ToT          |
| `agree`     | 다른 AI 의견에 동의       | 컨센서스 카운트 +1      |
| `disagree`  | 반대 (근거 evidence 필수) | AMBER 경고 트리거       |
| `question`  | 불명확한 부분 질문        | ZERO-T1 방지            |
| `clarify`   | 오해 해소                 | —                       |
| `summarize` | 중간 정리                 | check_consensus 전 권장 |
| `decide`    | 최종 결정 선언            | close_discussion 전     |

---

## MACHO-GPT ZERO 연계

| 조건                                  | 동작                                |
| ------------------------------------- | ----------------------------------- |
| `disagree` 2개 이상 동시 발생         | **ZERO-T2**: 자동 투표 생성 권고    |
| `check_consensus` → `pending` AI 있음 | **ZERO-T1**: 미응답 AI 에스컬레이션 |
| `get_vote_result` → 동률              | **AMBER**: human 판단 요청          |
| 토론 스레드 48h 이상 미활동           | **ZERO-T3**: 세션 리셋 권고         |
