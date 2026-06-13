---
name: multi-ai-coordination
description: 4-AI 협업 패턴 (Codex/Claude/OpenCode/Hermes). 세션 라이프사이클 + ZERO 규칙. Use when "coordinating AIs", "session lifecycle", "leader election".
---

# Multi-AI Coordination

## 지원 AI

| AI           | 역할           | 트리거                       |
| ------------ | -------------- | ---------------------------- |
| **Codex**    | 구현 (primary) | `task.assigned_to = "codex"` |
| **Claude**   | 리뷰/검증      | handoff 도착 시              |
| **OpenCode** | patch/lint/CSS | handoff 도착 시              |
| **Hermes**   | 초안/test case | `task.status = "draft"`      |

## 세션 라이프사이클 (v3)

```
PHASE 1: ACTIVE
  start_session(leader, title, goals)
    ↓
  loop:
    create_task → lock_task → [작업] → record_file_change
    log_handoff (필요 시)
    unlock_task
  close_session
    ↓
PHASE 2: RETROSPECTIVE
  4명 모두 submit_retro(went_well, went_wrong, suggestions, mvp_vote)
  finalize_retro → { mvp_agent, top_went_well, next_step }
    ↓
PHASE 3: LEADER ELECTION
  start_election
  4명 cast_election_vote
  get_election_result(auto_start_next=true) → 새 세션 자동 시작
    ↻ PHASE 1 반복
```

## ZERO 규칙 (필수 준수)

| 규칙        | 조건                                               | 동작            |
| ----------- | -------------------------------------------------- | --------------- |
| **ZERO-T1** | `get_handoff` 결과 없는데 작업 시작                | ❌ 중단 + 경고  |
| **ZERO-T2** | `lock_task` 반환 `locked: true`                    | ⏸ 대기          |
| **ZERO-T2** | dashboard에 `blocked` ≥ 2                          | 🚨 에스컬레이션 |
| **ZERO-T3** | `finalize_retro` 후 5분 내 `start_election` 미호출 | ⚠ deadlock 경고 |

## 표준 작업 루틴

### Codex (구현)

```
1. get_dashboard()
2. get_handoff("codex")
3. lock_task(task_id, "codex")
4. update_state("codex", "working", task_id)
5. [구현]
6. record_file_change(...)
7. log_handoff("codex", "claude", "리뷰 요청")
8. unlock_task(task_id, "codex")
9. update_state("codex", "idle")
```

### Claude (리뷰)

```
1. get_handoff("claude")
2. ack_handoff(id, "claude")
3. get_file_history(task_id)
4. update_state("claude", "review", task_id)
5. [리뷰]
6. log_handoff("claude", "codex", "수정 요청" or "승인")
7. update_state("claude", "idle")
```

### OpenCode (patch)

```
1. get_state("codex") → "idle" 확인
2. lock_task(task_id, "opencode")
3. update_state("opencode", "working", task_id)
4. [lint / small fix]
5. record_file_change(...)
6. unlock_task
7. update_state("opencode", "done")
```

### Hermes (초안)

```
1. list_tasks(status="draft")
2. update_state("hermes", "working", task_id)
3. [test case / checklist 초안]
4. log_handoff("hermes", "claude", "검토 요청")
5. update_state("hermes", "idle")
```

## 동률 처리

```typescript
// finalize_retro 결과
{ tally: { codex: 2, claude: 2 }, is_tie: true, tie_candidates: ["codex", "claude"] }

// 재투표 (tie_candidates로 제한)
start_election({ session_id, nominees: ["codex", "claude"] })
```

## 회고 항목

```typescript
submit_retro({
  session_id: 'SESS-001',
  agent: 'codex',
  went_well: ['JWT 완료', 'Claude 리뷰로 버그 3건 차단'],
  went_wrong: ['OAuth 범위 과소 추정'],
  suggestions: ['OAuth 범위 먼저 정의'],
  highlight: 'JWT 핵심 구조 설계',
  mvp_vote: 'claude',
});
```

## 체크리스트

- [ ] 모든 task에 `assigned_to` 명시
- [ ] 모든 작업 시작 시 `update_state(working)`
- [ ] 모든 작업 완료 시 `update_state(idle/done)` + `unlock_task`
- [ ] handoff 시 `reason` 필수
- [ ] 회고 시 4명 모두 `submit_retro` 후 `finalize_retro`
- [ ] 선거 시 모든 AI `cast_election_vote` 후 `get_election_result`
