# Plan — mcp-dev-hub v3 (현행 상태 + 로드맵)

> 최종 갱신: 2026-06-13 · 상태: **v3 안정화·프로덕션 운영 중**
> 이 문서는 완료된 리팩터 계획서가 아니라 **현재 상태 스냅샷 + 다음 작업**이다.
> 구조 상세는 [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)·[SYSTEM_LAYOUT.md](SYSTEM_LAYOUT.md), 이력은 [CHANGELOG.md](CHANGELOG.md) 참조.

## 1. 현재 상태 (As-Is, 검증됨)

| 영역           | 상태                                                             | 근거                                                           |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------- |
| 코드 구조      | `src/` 단일 트리, 루트 레거시 v1/v2/v3 **0개**                   | commit `c1557bb` (제거 완료)                                   |
| 도구           | **36 tools** / 10 도메인, 계약 해시·`schema_version` 부착        | `/health`, `src/tools/index.ts`                                |
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
- hermes 런타임 연동 (`~/.hermes` config·skill·SOUL.md, dev-hub MCP 정식 등록 36 tools)
- 루트 폴더 정리 (dated plan/report 9개 → `docs/archive/`)

## 3. 열린 작업 (To-Do)

### T1. 문서 구조 중복 해소 (의사결정 필요) — P1

**문제**: `README.md`의 Documentation Map은 **docs/ 영문 세트**(`docs/SYSTEM_ARCHITECTURE.md`·`docs/LAYOUT.md`·`docs/CHANGELOG.md`)를 가리키는데, 실제로 유지·갱신되는 정식본은 **루트 한국어 세트**(`SYSTEM_ARCHITECTURE.md`·`SYSTEM_LAYOUT.md`·`CHANGELOG.md`, 더 최신)다. 두 세트가 병존해 혼란.

**옵션**:

- **A (권장)**: 루트 한국어 세트를 정식본으로 확정 → README Documentation Map을 루트로 재링크 → 오래된 docs/ 영문 사본 3개 제거. `docs/GUIDE.md`·`docs/dev-hub-pickup.md`·`docs/agent-heartbeat.md`·`docs/traceability/`는 고유 문서라 유지.
- **B**: docs/ 영문 세트를 정식본으로 유지 → 루트 세트 내용을 docs/로 동기화/이관.
- ⚠ 어느 쪽이든 README 링크와 실제 파일이 일치해야 함. **사용자 승인 후 실행** (README 구조 변경 + 파일 제거 포함).

### T2. hermes 종단 검증 — P2

새 hermes 세션에서 `dev hub` 실행 → `update_state` idle 핑 → 대시보드 `online` 전환 실측. (연동·키·MCP 등록은 완료, 세션 reload만 남음.)

### T3. 정리 후속 (선택) — P3

- gitignored 산출물 `coverage/`(687K)·`out/`(5K) 로컬 정리 (재생성됨, 저장소 영향 없음).
- `docs/archive/` 인덱스(README 한 줄) 추가 여부.

## 4. 범위 제외 (Out of Scope)

- 새 도구/기능 추가 (현 36 tools 안정화 우선)
- D1 스키마 파괴적 변경 · API 호환성 깨는 변경
- 성능 최적화 (측정 전 비최적화 금지)

## 5. 성공 기준 (Definition of Done — 현행)

- [x] `src/` 단일 구조, 레거시 0 (`c1557bb`)
- [x] 36 tools, 프로덕션 배포·`/health` OK
- [x] `npm run validate` 통과 (type 0 · test 76/76 · lint 0 · secrets 0)
- [x] minimax→hermes 전 계층 전환
- [x] 루트 dated 문서 `docs/archive/` 이관
- [ ] T1 문서 중복 해소 (사용자 의사결정)
- [ ] T2 hermes 종단 검증
