# Plan — mcp-dev-hub v3 (현행 상태 + 로드맵)

> 최종 갱신: 2026-06-14 · 상태: **v3 안정화·프로덕션 운영 중**
> 이 문서는 완료된 리팩터 계획서가 아니라 **현재 상태 스냅샷 + 다음 작업**이다.
> 구조 상세는 [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)·[SYSTEM_LAYOUT.md](SYSTEM_LAYOUT.md), 이력은 [CHANGELOG.md](CHANGELOG.md) 참조.

## 1. 현재 상태 (As-Is, 검증됨)

| 영역           | 상태                                                             | 근거                                                           |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| 코드 구조      | `src/` 단일 트리, 루트 레거시 v1/v2/v3 **0개**                   | commit `c1557bb` (제거 완료)                                   |
| 도구           | 로컬 registry **37 tools** / 계약 해시·`schema_version` 부착     | `src/tools/index.ts`, `tool-contract.test.ts`                  |
| 데이터         | Cloudflare D1 SSOT, 16 테이블, prepared statement                | `src/db/schema.sql`                                            |
| 배포           | 프로덕션 운영 중                                                 | `https://mcp-dev-hub.mscho715.workers.dev`, Version `475bdfff` |
| 대시보드       | 공개 읽기 전용 GET(`/dashboard`·`/api/*`), 5초 polling           | `src/dashboard/`                                               |
| 협업 AI        | **codex · claude · opencode · hermes** (4번째 = hermes)          | `ef9c97e`·`06f08cc` (minimax→hermes 전환 완료)                 |
| Presence       | heartbeat 모델 (online≤120s·stale≤600s·offline·unknown=미연결)   | `src/dashboard/data.ts` `derivePresence`                       |
| dev hub 트리거 | `dev hub` 입력 → `get_handoff`→`get_dashboard`→`list_tasks` 픽업 | [docs/dev-hub-pickup.md](docs/dev-hub-pickup.md)               |
| 게이트         | type-check 0 · test 76/76 · lint 0 · wrangler dry-run 빌드 OK    | `npm run validate`                                             |

핵심 불변식: D1 SSOT(외부 캐시 금지) · 쓰기 POST는 API_KEY 필수 · MCP JSON-RPC 2.0 · UTF-8 경계 가드(`-32602`) · `nextId = MAX(suffix)+1`.

## 2. 최근 완료 (2026-06-13)

- 대시보드 + 프로젝트별 세션 패널 + collapsible UI + presence 한글 라벨
- 세션 헤더 로컬 폴더 칩 / dev hub 사용법 패널·트리거 복사·전체접기·키보드 단축키
- dev hub 작업 이어받기 트리거 (codex·claude·opencode·hermes 공유)
- **minimax → hermes 4번째 AI 전환** (코드·prod D1·문서 전 계층)
- hermes 런타임 연동 (`~/.hermes` config·skill·SOUL.md, dev-hub MCP 정식 등록)
- 루트 폴더 정리 (dated plan/report 9개 → `docs/archive/`)
- `run_deliberation` MCP 도구 로컬 구현: 기존 `discussion`/`vote` 스키마를 재사용해 토론 열기, 응답 대기, 합의 종료, 투표 생성 경로를 단일 도구로 오케스트레이션.

## 3. 열린 작업 (To-Do)

### T1. 문서 구조 중복 해소 — ✅ 해소됨 (2026-06-13, 옵션 A)

**결정**: 루트 한국어 세트를 단일 정식본으로 확정. README Documentation Map을 루트(`SYSTEM_ARCHITECTURE.md`·`SYSTEM_LAYOUT.md`·`CHANGELOG.md`)로 재링크하고, 오래된 `docs/` 영문 사본 3개(`docs/SYSTEM_ARCHITECTURE.md`·`docs/LAYOUT.md`·`docs/CHANGELOG.md`)를 제거. `docs/GUIDE.md`·`docs/dev-hub-pickup.md`·`docs/agent-heartbeat.md`·`docs/traceability/`·`docs/archive/`는 고유 문서라 유지.

### T2. hermes 종단 검증 — P2

새 hermes 세션에서 `dev hub` 실행 → `update_state` idle 핑 → 대시보드 `online` 전환 실측. (연동·키·MCP 등록은 완료, 세션 reload만 남음.)

### T3. 정리 후속 (선택) — P3

- [x] `docs/archive/` 인덱스 `docs/archive/README.md` 추가 ✅ 2026-06-13
- [ ] gitignored 산출물 `coverage/`·`out/` 로컬 정리 — **보류**(사용자가 삭제 거부, gitignored라 저장소 영향 없음).

### T4. `run_deliberation` MCP 도구 — ✅ 로컬 구현됨 (2026-06-14)

**목표**: 에이전트들이 한 주제에 대해 각자 의견을 남기고, 합의가 되면 결론을 닫고, 합의가 안 되면 투표 또는 추가 의견 요청으로 넘어가는 과정을 단일 MCP 도구로 자동 진행한다.

**벤치마크 요약**:

| 출처 | 핵심 패턴 | dev-hub 반영 아이디어 |
| ---- | --------- | --------------------- |
| [AutoGen Group Chat](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/group-chat.html) | 공통 메시지 스레드, 순차 발언, manager가 다음 발언자를 선택, 종료 조건으로 중단 | 기존 `discussion_thread`를 공통 스레드로 쓰고, `run_deliberation`이 다음 발언자·종료 조건을 반환 |
| [OpenAI Agents SDK Orchestration](https://developers.openai.com/api/docs/guides/agents/orchestration) | manager가 책임을 유지하는 "agents as tools"와 specialist에게 넘기는 handoff를 구분 | dev-hub는 최종 결론 소유권을 hub에 두는 manager-style 도구로 설계 |
| [LangChain Multi-agent](https://docs.langchain.com/oss/python/langchain/multi-agent) | 복잡한 작업은 전문 컴포넌트로 분리하되, 병렬 검토와 context isolation을 중시 | 참여 에이전트별 의견을 독립 메시지로 저장하고 합의 판정만 집계 |
| [CrewAI Collaboration](https://docs.crewai.com/en/concepts/collaboration) | delegation과 question-to-coworker를 명시적 협업 도구로 제공 | 막힌 항목은 `next_actions`에 "질문/위임 필요"로 구조화 |
| [OpenAI Swarm](https://github.com/openai/swarm) | agent와 handoff를 작고 테스트 가능한 primitive로 유지 | 새 도구는 LLM 실행기가 아니라 기존 `discussion`·`vote`·`handoff`를 묶는 얇은 오케스트레이터로 제한 |

**구현 설계**: `run_deliberation` 단일 도구.

입력:

- `session_id`, `task_id`, `title`, `question`
- `participants`: `codex | claude | opencode | hermes` 배열
- `initiated_by`
- `strategy`: `consensus_first | vote_if_split | vote_only`
- `consensus_threshold`: 기본 `0.75`
- `max_rounds`: 기본 `2`

출력:

- `thread_id`
- `status`: `opened | waiting_for_responses | consensus_reached | vote_recommended | vote_created`
- `summary`
- `required_responses`
- `next_actions`

운영 흐름:

1. 새 질문이면 `start_discussion`으로 스레드를 만들고 opening message를 기록한다.
2. 기존 스레드면 `get_discussion`으로 메시지 수와 참여자 응답을 확인한다.
3. `check_consensus`로 합의율을 계산한다.
4. 합의가 충분하면 `close_discussion`으로 결론과 action items를 남긴다.
5. 합의가 부족하고 전략이 `vote_if_split` 또는 `vote_only`면 `create_vote`를 제안하거나 생성한다.
6. 아직 응답하지 않은 에이전트가 있으면 `next_actions`에 에이전트별 응답 요청을 반환한다.

수용 기준:

- 기존 `discussion`/`vote` 스키마를 우선 재사용한다.
- D1 SSOT 원칙을 유지한다.
- 새 도구는 AI 응답 내용을 생성하지 않는다. 토론 상태를 만들고, 모으고, 판정한다.
- 합의 전에는 DONE으로 보고하지 않는다.
- 단위 테스트는 opened, waiting, consensus, vote path를 포함한다.

## 4. 범위 제외 (Out of Scope)

- T4 외 임의 새 도구/기능 추가
- D1 스키마 파괴적 변경 · API 호환성 깨는 변경
- 성능 최적화 (측정 전 비최적화 금지)

## 5. 성공 기준 (Definition of Done — 현행)

- [x] `src/` 단일 구조, 레거시 0 (`c1557bb`)
- [x] 로컬 registry 37 tools, 계약 스냅샷 갱신
- [x] `npm run validate` 통과 (type 0 · test 76/76 · lint 0 · secrets 0)
- [x] minimax→hermes 전 계층 전환
- [x] 루트 dated 문서 `docs/archive/` 이관
- [x] T1 문서 중복 해소 → 옵션 A (루트 정식본 확정, docs/ 영문 사본 제거) ✅ 2026-06-13
- [ ] T2 hermes 종단 검증
- [x] T4 `run_deliberation` MCP 도구 로컬 구현 및 단위 테스트
- [ ] T4 프로덕션 배포 및 `/health` 기준 원격 도구 목록 확인
