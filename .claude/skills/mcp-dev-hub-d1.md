---
name: mcp-dev-hub-d1
description: D1 스키마 + 쿼리 패턴. SSOT 원칙. Use when "designing tables", "writing D1 queries", "schema migration".
---

# D1 Schema & Query Patterns

## SSOT 원칙

- **모든 상태는 D1에 저장** (메모리/파일 캐시 ❌)
- **메모리 = 휘발성, D1 = 영구**
- 동시성: D1은 트랜잭션 + batch() 지원

## 스키마 (12개 테이블)

| 테이블           | 용도                          | 핵심 컬럼                              |
| ---------------- | ----------------------------- | -------------------------------------- |
| `ai_state`       | 에이전트 현재 상태            | agent, status, current_task            |
| `tasks`          | 태스크 레지스트리             | id, session_id, status, assigned_to    |
| `task_lock`      | 충돌 방지 잠금                | task_id, agent, expires_at             |
| `sessions`       | v3 세션 (active/retro/voting) | id, leader, status, goals              |
| `retrospectives` | 회고 결과                     | session_id, agent, went_well, mvp_vote |
| `elections`      | 리더 선출                     | session_id, winner, tally              |
| `discussions`    | AI 간 토론                    | task_id, title, status                 |
| `messages`       | 토론 메시지                   | discussion_id, agent, content          |
| `votes`          | 투표                          | target_id, voter, choice               |
| `handoff_log`    | AI 간 인수인계                | from_agent, to_agent, reason           |
| `file_changes`   | 파일 변경 이력                | task_id, path, action                  |
| `event_log`      | 브로드캐스트 이벤트           | type, payload, created_at              |

## 쿼리 패턴

### 단일 조회

```typescript
const session = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?')
  .bind(sessionId)
  .first<Session>();
```

### 다중 조회 (배치)

```typescript
const [tasks, state, handoffs] = await env.DB.batch([
  env.DB.prepare('SELECT * FROM tasks WHERE session_id = ?').bind(sessionId),
  env.DB.prepare('SELECT * FROM ai_state WHERE agent = ?').bind(agent),
  env.DB.prepare('SELECT * FROM handoff_log WHERE to_agent = ? AND acked = 0').bind(agent),
]);
```

### INSERT + RETURNING

```typescript
const result = await env.DB.prepare(
  'INSERT INTO tasks (id, title, assigned_to) VALUES (?, ?, ?) RETURNING *'
)
  .bind(taskId, title, agent)
  .first<Task>();
```

### 트랜잭션 (batch)

```typescript
await env.DB.batch([
  env.DB.prepare('UPDATE tasks SET status = ? WHERE id = ?').bind('done', taskId),
  env.DB.prepare('INSERT INTO handoff_log (...) VALUES (...)').bind(...),
  env.DB.prepare('UPDATE ai_state SET status = ? WHERE agent = ?').bind('idle', agent)
]);
```

## 인덱스 가이드

- `WHERE`에 자주 쓰이는 컬럼 → 인덱스
- `ORDER BY`에 자주 쓰이는 컬럼 → 인덱스
- 외래키 (`session_id`, `task_id`) → 인덱스

```sql
CREATE INDEX idx_tasks_session ON tasks(session_id, status);
CREATE INDEX idx_handoff_to ON handoff_log(to_agent, acked);
CREATE INDEX idx_events_time ON event_log(created_at DESC);
```

## 마이그레이션 절차

1. `src/db/schema.sql` 수정
2. `npm run db:init:local` (로컬 검증)
3. `npx wrangler d1 execute mcp-dev-hub-db --local --command="<검증 쿼리>"`
4. 프로덕션 백업: `wrangler d1 export ... --output=backups/...`
5. `npm run db:init:prod`

## 금지 사항

- ❌ `SELECT *` (필요한 컬럼만)
- ❌ `LIKE '%...'` (인덱스 사용 불가)
- ❌ 문자열 결합으로 SQL 생성 (injection 위험)
- ❌ `await env.DB.exec()` (prepared statement 미사용)
