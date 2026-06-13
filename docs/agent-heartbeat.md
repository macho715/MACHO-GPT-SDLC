# 에이전트 Heartbeat — 대시보드에서 codex를 "온라인"으로 켜기

> 대시보드 AI 상태 패널은 **`ai_state` 테이블을 그대로 반영**한다. 어떤 에이전트가
> "온라인(초록)"으로 보이려면 그 에이전트가 직접 `update_state` MCP 툴을 호출해
> heartbeat를 보내야 한다. 대시보드가 에이전트를 대신 켜주지 않는다.

## presence 규칙 (`src/dashboard/data.ts`)

| presence  | 색                | 조건 (`updated_at` 기준 경과시간)            |
| --------- | ----------------- | -------------------------------------------- |
| `online`  | 초록              | ≤ 120초                                      |
| `stale`   | 노랑              | ≤ 600초                                      |
| `offline` | 빨강              | > 600초 (연결됐다 끊김)                      |
| `unknown` | 회색 = **미연결** | `updated_at`이 NULL (한 번도 heartbeat 없음) |

seed 직후 codex/claude/opencode/minimax는 `updated_at = NULL`(미연결, 회색)이다.
첫 `update_state` 호출 시 `updated_at`이 채워지며 `online`으로 전환된다.

## 1) codex CLI에 dev-hub MCP 등록

codex가 사용하는 MCP 클라이언트 설정에 dev-hub 서버를 추가한다 (URL 트랜스포트):

```json
{
  "mcpServers": {
    "dev-hub": {
      "type": "url",
      "url": "https://mcp-dev-hub.mscho715.workers.dev",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

- 로컬 개발은 `http://localhost:8787`.
- `x-api-key`는 쓰기(POST/MCP 툴 호출)에 필수다. 읽기 전용 대시보드 GET 라우트는 키가
  없어도 되지만, `update_state`는 쓰기이므로 키가 반드시 필요하다.
- 키는 코드/설정 파일에 하드코딩하지 말고 환경변수·시크릿 매니저로 주입한다.

## 2) 작업 중 `update_state` 호출

codex가 작업을 시작·진행·완료할 때 `update_state`를 호출한다.

| 파라미터                 | 필수 | 값                                                                                |
| ------------------------ | ---- | --------------------------------------------------------------------------------- |
| `agent`                  | ✅   | `'codex'`                                                                         |
| `status`                 | ✅   | `idle` \| `working` \| `blocked` \| `review` \| `discussing` \| `retro` \| `done` |
| `task_id` / `task_title` |      | 진행 중 작업 식별                                                                 |
| `session_id`             |      | 활성 세션 ID                                                                      |
| `current_file`           |      | 편집 중 파일                                                                      |
| `progress`               |      | 0–100                                                                             |
| `note`                   |      | 짧은 메모                                                                         |

예 (작업 시작):

```json
{
  "name": "update_state",
  "arguments": {
    "agent": "codex",
    "status": "working",
    "task_title": "invoice audit 파서 리팩터",
    "progress": 10
  }
}
```

`online` 유지에는 120초 안에 한 번씩 갱신이 필요하다. 장시간 작업이면 진행 중간에
`progress`만 올려 다시 호출하거나, 주기적 heartbeat(예: 60초)를 보낸다. 작업이 끝나면
`status: 'done'`으로 마무리한다.

## 3) 확인

```bash
curl -s https://mcp-dev-hub.mscho715.workers.dev/api/mcp-status \
  | python -c "import sys,json;[print(a['agent'],a['presence'],a['age_sec']) for a in json.load(sys.stdin)['agents']]"
```

codex가 `online`(초록), `age_sec`가 작은 값으로 보이면 정상이다. 호출이 멈추면
120초 뒤 `stale`(노랑), 600초 뒤 `offline`(빨강)으로 내려간다.

## 참고: 이미 seed된 프로덕션 DB

기존 프로덕션 D1은 codex/claude/minimax 행에 seed 시각 타임스탬프가 박혀 있어
`offline`(빨강)으로 보인다. 신규 NULL-seed는 `INSERT OR IGNORE`라 기존 행에 적용되지
않으므로, 한 번만 아래 정리를 적용해 "미연결(회색)"로 되돌릴 수 있다 (idle·미보고 행 한정):

```sql
UPDATE ai_state SET updated_at = NULL
WHERE agent IN ('codex','claude','minimax') AND status = 'idle';
```

> ⚠️ 이는 프로덕션 데이터 변경이다. 실제로 작업 중인 에이전트(opencode 등)나
> idle이 아닌 행은 건드리지 않는다. 적용 전 백업/확인을 권장한다.
