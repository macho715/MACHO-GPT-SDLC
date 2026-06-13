# MCP DEV HUB v3 — Development Workflow

> **프로젝트명**: `mcp-dev-hub` (Cloudflare Workers + D1 + TypeScript)
> **현재 버전**: v3 (Session Lifecycle + Retro + Leader Election)
> **지원 AI**: Codex · Codex · OpenCode Go · MiniMax

## dev hub — 작업 이어받기 (트리거)

사용자 메시지에 **`dev hub`** (또는 `devhub` · `dev-hub` · `데브허브` · `/dev-hub`)가 포함되면
**즉시 아래 고정 시퀀스를 실행**한다. 추측하지 말고 그대로 따른다. (상세: `docs/dev-hub-pickup.md`)

ME = 자신의 이름(`codex` | `claude` | `opencode` | `minimax`).

```
1) get_handoff  { agent: ME, status: "pending" }   # 나에게 온 인계 작업?
2) get_dashboard                                     # 활성 세션·blocked 맥락
3) list_tasks   { assigned_to: ME }                  # 내 할당 태스크
```

분기:

- **핸드오프 있음** → `ack_handoff` → `update_state {status:"working"}` → instructions 수행 → 끝나면 `update_state {status:"done"}` (+ 다음 담당 있으면 `log_handoff`)
- **할당 태스크만 있음** → `update_state {status:"working"}` → 계속 수행
- **둘 다 없음** → "이어받을 작업 없음" 보고 후 멈춤 (**ZERO-T1**: 임의 작업 금지, `update_state` 호출 안 함)

가드: `lock_task` 가 `locked:true`면 대기(**ZERO-T2**) · `blocked>=2`면 에스컬레이션.
작업 중엔 **120초 안에** `update_state` 로 `progress` 갱신(미보고 시 지연→오프라인).
dev-hub MCP 도구가 없으면 호출하지 말고 "dev-hub 미연결"이라고 보고한다.

## 패키지 관리

- **항상 `npm` 사용** (Cloudflare Workers 표준)
- 설치: `npm install`
- 새 의존성: `npm install <pkg>` (런타임) / `npm install -D <pkg>` (개발)

## 개발 순서 (TDD 권장)

1. 변경 사항 작성 (`src/**/*.ts` 또는 `v3_*.ts`)
2. 타입체크: `npm run type-check`
3. 테스트: `npm test`
4. 린트: `npm run lint`
5. 포맷: `npm run format`
6. 로컬 실행: `npm run dev` (wrangler dev)
7. DB 마이그레이션: `npm run db:init:local`
8. 배포: `npm run deploy` (D1 + Workers)

## 코딩 컨벤션

### TypeScript

- **`type` 선호, `interface` 자제** (단, `Env`, MCP 메시지 타입처럼 외부 노출 시엔 `interface`)
- **`enum` 절대 금지** → 문자열 리터럴 유니온 사용
- **strict 모드** (`tsconfig.json`) - any, @ts-ignore 금지
- **ES2022** (top-level await, class fields)

### 프로젝트 구조 (v3 기준)

```
src/
  index.ts                 # Worker 메인 핸들러
  tools/
    index.ts               # Tool 레지스트리 + 라우터
    session.ts             # start_session / get_session / close_session
    retro.ts               # submit_retro / get_retro / finalize_retro
    election.ts            # start_election / cast_election_vote / get_election_result
    state.ts               # get_state / update_state
    task.ts                # create_task / list_tasks / update_task
    discussion.ts          # start_discussion / post_message / ...
    vote.ts                # create_vote / cast_vote
    handoff.ts             # log_handoff / get_handoff / ack_handoff
    lock.ts                # lock_task / unlock_task
    file.ts                # record_file_change
    event.ts               # broadcast_event / get_events
    dashboard.ts           # get_dashboard
  db/
    schema.sql             # D1 스키마 (SSOT)
    queries.ts             # SQL 쿼리 모음
```

### 코어 규칙

- ✅ **D1 SSOT 원칙**: 모든 상태는 D1에 저장 (메모리/파일 캐시 금지)
- ✅ **API_KEY 검증**: 모든 POST는 `x-api-key` 또는 `Bearer` 헤더 필수
- ✅ **MCP JSON-RPC 2.0**: 응답은 항상 `{jsonrpc:'2.0', id, result|error}`
- ✅ **에러 처리**: try/catch + MCP 에러 코드 (-32700 Parse, -32601 Method, -32603 Internal)
- ✅ **CORS**: 모든 응답에 CORS 헤더 (`Access-Control-Allow-Origin: *`)
- ✅ **로깅**: `console.log` 대신 구조화된 JSON 로그
- ✅ **UTF-8 경계 검증**: 요청 body 바이트를 fatal UTF-8 디코더로 검증하고 손상 payload는 `-32602`로 거부
- ❌ **하드코딩 비밀 금지**: API_KEY는 `env.API_KEY` (Cloudflare Secret)
- ❌ **SQL Injection 방지**: 반드시 prepared statement (`.bind()`)

## v3 아키텍처 — 세션 라이프사이클

```
PHASE 1: ACTIVE SESSION (status = active)
  start_session(leader, goals)
  ↳ create_task / start_discussion / lock_task / record_file_change / log_handoff
  close_session() → status = retro
  ↓
PHASE 2: RETROSPECTIVE (status = retro)
  모든 AI: submit_retro(went_well, went_wrong, suggestions, mvp_vote)
  finalize_retro() → MVP 선정 + 다음 단계
  ↓
PHASE 3: LEADER ELECTION (status = voting)
  start_election() → cast_election_vote() (전원)
  get_election_result(auto_start_next=true) → 새 세션 자동 시작
  ↻ PHASE 1 반복
```

## MACHO-GPT ZERO 연계 규칙 (필수 준수)

| 조건                                        | 동작                                |
| ------------------------------------------- | ----------------------------------- |
| `lock_task` 반환 `locked: true`             | **ZERO-T2**: 다른 AI 작업 중 → 대기 |
| `get_handoff` 결과 없이 작업 시작           | **ZERO-T1**: 핸드오프 미확인 → 중단 |
| `get_dashboard` 후 2개 이상 `blocked`       | **ZERO-T2**: 자동 에스컬레이션      |
| `finalize_retro` 후 `start_election` 미호출 | **ZERO-T3**: 세션 deadlock → 경고   |

## v1/v2/v3 동시 운영 시 주의

루트에 `index.ts`, `v2_*.ts`, `v3_*.ts`가 공존합니다.

- **메인 코드**: v3 (현재 활성) — `src/`로 이관 후 작업
- **레거시 v1/v2**: 새 기능 추가 ❌, 마이그레이션 시 참고만
- **wrangler.toml**: `main = "src/index.ts"` (v3) — 루트 `index.ts`로 덮어쓰기 금지

## 테스트

### 단위 테스트 (Vitest)

```bash
npm test                     # 전체 실행
npm test -- tools/session    # 모듈별
npm run test:coverage        # 커버리지
```

### 통합 테스트 (wrangler)

```bash
npm run dev                  # 로컬 워커 실행 (http://localhost:8787)
curl http://localhost:8787/health
```

### MCP 클라이언트 테스트

```json
{
  "mcpServers": {
    "dev-hub": {
      "type": "url",
      "url": "http://localhost:8787",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

## 빌드 & 배포

```bash
# 로컬 개발
npm run dev                  # wrangler dev (HMR)

# D1 마이그레이션
npm run db:create            # D1 DB 생성 (최초 1회)
npm run db:init:local        # 로컬 스키마 적용
npm run db:init:prod         # 프로덕션 스키마 적용

# 시크릿 등록
wrangler secret put API_KEY  # 강한 키 (openssl rand -hex 32)

# 배포
npm run deploy               # wrangler deploy
```

## 금지 사항

- ❌ `console.log` 디버깅 (구조화 로그 사용)
- ❌ `any` 타입 (정확한 타입 정의)
- ❌ 하드코딩된 비밀/URL/키
- ❌ D1 외부 캐시 (SSOT 원칙 위반)
- ❌ 동기식 I/O (Workers 환경은 비동기 강제)
- ❌ 글로벌 상태 (`globalThis` 등)
- ❌ v1/v2 직접 수정 (v3로 마이그레이션)

## 품질 게이트

- **테스트 커버리지**: 80% 이상
- **린트 에러**: 0개
- **타입 에러**: 0개
- **PR 전 검증**: `npm run type-check && npm test && npm run lint`
