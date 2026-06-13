---
description: dev-hub에서 내게 온 핸드오프·태스크를 체크하고 작업을 이어받는다
---

dev-hub 작업 이어받기 트리거를 실행한다. ME = `claude`.

다음 고정 시퀀스를 **순서대로** 호출한다 (상세 규칙: `docs/dev-hub-pickup.md`):

1. `get_handoff { agent: "claude", status: "pending" }` — 나에게 온 인계 작업 확인
2. `get_dashboard` — 활성 세션·blocked·태스크 맥락
3. `list_tasks { assigned_to: "claude" }` — 내 할당 태스크 (open/in_progress)

분기 처리:

- **pending 핸드오프 있음** → `ack_handoff { handoff_id, agent: "claude", accepted: true }` → `update_state { agent: "claude", status: "working", task_title: <요약>, progress: 0 }` → 핸드오프 instructions/changed_files/risks 수행 → 완료 시 `update_state { status: "review" 또는 "done", progress: 100 }` → 다음 담당 있으면 `log_handoff`.
- **할당 태스크만 있음** → `update_state { status: "working", task_id, task_title }` → 해당 태스크 계속.
- **둘 다 없음** → "이어받을 작업 없음" 보고 후 멈춤. 임의 작업 생성 금지 (ZERO-T1). `update_state` 호출하지 않음.

가드:

- `lock_task` 가 `locked: true` (다른 AI 점유) → 대기 (ZERO-T2), 강제 진행 금지.
- `get_dashboard` 에서 `blocked >= 2` → 에스컬레이션 보고.
- 작업 중 **120초 안에** `update_state` 로 `progress` 갱신.
- dev-hub MCP 도구가 없으면 호출하지 말고 "dev-hub 미연결" 보고.

마지막에 아래 형식으로 한눈에 보고:

```
dev hub [claude] 체크 결과
- 핸드오프: <건수> (from <에이전트> · task <id> · "<요약>")
- 내 태스크: <건수>
- 활성 세션: <SESS-xxx 또는 없음> · blocked <n>
→ 이어받음: <무엇을 / 또는 "이어받을 작업 없음">
```
