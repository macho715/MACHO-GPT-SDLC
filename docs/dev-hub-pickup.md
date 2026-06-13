# dev hub — 작업 이어받기 트리거 (Pickup Protocol)

> 채팅창에 **`dev hub`** (또는 `devhub` · `데브허브` · `/dev-hub`)라고 입력하면,
> 어느 에이전트(codex · claude · opencode · minimax)든 **이 고정 시퀀스**를 실행해
> 다른 에이전트가 넘긴 작업을 자동으로 이어받는다.
>
> 이 문서가 단일 기준(SSOT)이다. 각 에이전트의 지시 파일(`AGENTS.md` · `CLAUDE.md`)은
> 이 시퀀스를 그대로 복제해 두고, 상세는 여기를 가리킨다.

## 트리거 문구

다음 중 하나가 사용자 메시지에 포함되면 즉시 실행한다(대소문자·공백 무시):

- `dev hub` · `devhub` · `dev-hub` · `데브허브` · `/dev-hub`

## 0. 나(ME) 식별

각 에이전트는 자신의 고정 이름을 ME로 쓴다: `codex` | `claude` | `opencode` | `minimax`.
(추측 금지 — 자신이 어느 런타임인지 모르면 사용자에게 1회 확인.)

## 1. 고정 시퀀스 (순서 고정)

```
1) get_handoff   { agent: ME, status: "pending" }     # 나에게 온 인계 작업?
2) get_dashboard                                        # 활성 세션·blocked·태스크 맥락
3) list_tasks    { assigned_to: ME }                    # 내 할당 태스크 (open/in_progress)
```

이 3개는 **읽기 전용**이므로 무조건 먼저 호출한다. 호출 결과로 분기한다.

## 2. 분기 — 이어받기 결정

### (A) pending 핸드오프가 있다

```
ack_handoff   { handoff_id, agent: ME, accepted: true }
update_state  { agent: ME, status: "working", task_title: <핸드오프 요약>, progress: 0 }
→ 핸드오프 instructions / changed_files / risks 를 그대로 수행
→ 끝나면: update_state { agent: ME, status: "review" 또는 "done", progress: 100 }
→ 다음 담당이 있으면: log_handoff { from_agent: ME, to_agent: <다음>, task_id, summary, changed_files, risks }
```

### (B) 핸드오프는 없지만 내게 할당된 open/in_progress 태스크가 있다

```
update_state { agent: ME, status: "working", task_id, task_title, progress }
→ 해당 태스크 계속 수행
```

### (C) 핸드오프도 할당 태스크도 없다

```
"이어받을 작업 없음" 을 보고하고 멈춘다.
임의로 새 작업을 만들지 않는다.   # ZERO-T1: 핸드오프 미확인 상태에서 작업 시작 금지
update_state 는 호출하지 않는다(상태를 지어내지 않는다).
```

## 3. ZERO 가드 (필수 준수)

| 조건                                         | 동작                              |
| -------------------------------------------- | --------------------------------- |
| `lock_task` 가 `locked: true` (다른 AI 점유) | **ZERO-T2**: 대기. 강제 진행 금지 |
| `get_handoff` 비어 있는데 작업 시작하려 함   | **ZERO-T1**: 중단 → (C)로 처리    |
| `get_dashboard` 에서 `blocked >= 2`          | **ZERO-T2**: 에스컬레이션 보고    |

## 4. Heartbeat (작업 중)

긴 작업은 **120초 안에** `update_state` 로 `progress` 만 올려 다시 호출한다.
안 하면 대시보드에서 120초 뒤 `지연`, 600초 뒤 `오프라인`으로 표시된다.

## 5. 연결 확인 / 미연결 처리

- dev-hub MCP 도구(`get_handoff` 등)가 **없으면** 호출하지 않고, "dev-hub 미연결"이라고 정직하게 보고한다.
- 연결 확인: `GET https://mcp-dev-hub.mscho715.workers.dev/api/mcp-status` 에서 ME presence 가 `online` 이면 정상.
- 등록 위치: codex `~/.codex/config.toml [mcp_servers.dev-hub]` · opencode `~/.config/opencode/opencode.jsonc` · claude `.mcp.json`. 모두 `MCP_DEV_HUB_API_KEY` 환경변수 사용(키 하드코딩 금지).

## 6. 응답 형식 (사용자에게)

실행 후 아래를 한눈에 보고한다:

```
dev hub [ME] 체크 결과
- 핸드오프: <건수> (있으면: from <에이전트> · task <id> · "<요약>")
- 내 태스크: <건수> (open/in_progress)
- 활성 세션: <SESS-xxx 또는 없음> · blocked <n>
→ 이어받음: <무엇을 / 또는 "이어받을 작업 없음">
```
