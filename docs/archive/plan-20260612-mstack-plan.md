# mstack-plan: MCP DEV HUB v3 마감 계획

작성일: 2026-06-12

## Phase 1: Business Review

### 1.1 문제 정의

현재 상태: `src/` 구조 마이그레이션과 핵심 검증은 대부분 완료됐지만, `npm run test:coverage`가 coverage threshold 때문에 실패한다.

목표 상태: 기존 v3 tool 동작을 유지한 상태로 coverage 기준까지 통과시키고, 리팩터링 완료 판정을 재현 가능한 증거로 남긴다.

영향 범위:

- Worker entrypoint 1개: `src/index.ts`
- tool domain 파일 12개: `src/tools/*.ts`
- 테스트 파일 9개: 현재 `20 passed`
- 남은 실패 명령 1개: `npm run test:coverage`

### 1.2 제안 옵션

| 옵션 | 설명                                                                                             | 공수(일) | 리스크                                                 | 비용(AED) |
| ---- | ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------ | --------- |
| A    | 현재 80% statements/functions/lines, 75% branches 기준을 유지하고 누락 branch 테스트를 추가한다. | 0.5      | 테스트 수가 늘지만 품질 게이트와 가장 일치한다.        | 0         |
| B    | 첨부 계획의 60%+ 목표에 맞춰 coverage threshold를 낮추고 부족한 branch만 소폭 보강한다.          | 0.25     | 전역 품질 게이트의 80% 원칙과 충돌할 수 있다.          | 0         |
| C    | coverage를 이번 리팩터링의 필수 완료 조건에서 제외하고 `validate` 통과 상태로 마감한다.          | 0.1      | 사용자가 요구한 coverage 검증을 완료로 보고할 수 없다. | 0         |

### 1.3 추천 & 근거

추천: 옵션 A.

이유: 프로젝트 AGENTS 기준은 coverage 80% 이상이고, 현재 `type-check`, `lint`, `test`, `wrangler deploy --dry-run`, `/health` smoke는 이미 통과했다.
남은 차이는 coverage 테스트 보강이므로 threshold를 낮추기보다 누락 branch를 채우는 편이 완료 판정에 안전하다.

롤백 전략: 새 테스트만 제거하면 현재 `npm run validate` 통과 상태로 즉시 되돌릴 수 있다.

### 1.4 승인 요청

- [ ] Phase 1 승인

승인되면 Phase 2에서 파일별 테스트 보강 목록, 실행 순서, 검증 명령을 확정한다.

## Coordinator Input Packet

objective: MCP DEV HUB v3 `src/` 마이그레이션을 coverage 포함 완료 상태로 마감한다.

non-negotiables:

- 공개 tool 이름과 inputSchema는 v3 기준선과 일치해야 한다.
- `src/db/schema.sql`은 `_legacy/root/v3_schema.sql`과 SHA256이 같아야 한다.
- 레거시 파일은 삭제하지 않고 `_legacy/`에 보존한다.
- DONE 판정은 `type-check`, `lint`, `test`, coverage, dry-run, smoke evidence가 있을 때만 가능하다.

acceptance criteria:

- `npm run type-check` 통과
- `npm run lint` 통과
- `npm test` 통과
- `npm run test:coverage` 통과
- `npx wrangler deploy --dry-run --outdir .wrangler\dry-run` 통과
- `/health` smoke 응답 `status=ok`, `version=3.0.0`

option set:

- A: 80/75 coverage gate 유지 + 테스트 보강
- B: 첨부 계획의 60%+로 threshold 조정 + 테스트 소폭 보강
- C: coverage 제외 마감

required evidence:

- changed files list
- generated files list
- test command outputs
- schema hash equality
- tool count equality
- wrangler dry-run result
- local health smoke result

test expectations:

- 기존 20개 테스트는 계속 통과해야 한다.
- 추가 테스트는 failure branch와 uncovered handler를 직접 호출한다.
- Worker fetch 경로는 최소 health, initialize, tools/list, tools/call error path를 유지한다.
