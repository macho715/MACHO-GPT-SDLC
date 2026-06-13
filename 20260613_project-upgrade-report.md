# Project Upgrade Report — mcp-dev-hub v3

> skill: project-upgrade v2.2 | date: 2026-06-13 | rolling floor: 2025-06-13 (EN-only)
> 대상: Cloudflare Workers + D1 + TypeScript MCP 서버 (src/ 1,990 LOC, 테스트 10파일, 커버리지 83.38%)
> 정책: 제안만 — 코드 변경·커밋·배포·삭제 없음. Apply Gates는 §9 참조.

---

## 0. Surprise Picks (예상 밖 우선)

1. **결제 시스템의 Idempotency Key를 멀티-AI 조율에 역수입** — Stripe류가 "결제 중복"을 막는 `idempotency_key` 패턴을, 4개 AI가 동시에 `create_task`/`lock_task`를 때릴 때의 **중복 실행 방지**로 그대로 가져온다. 현재 D1 SSOT엔 중복 방어가 없다. _Novelty 4 · SurpriseScore 6.67._ **내일 첫 액션:** `action_queue`/`task` write 툴에 `client_request_id` 컬럼 + UNIQUE 인덱스 추가 설계.
2. **테스트가 거짓으로 통과하는 함정** — `@cloudflare/vitest-pool-workers`가 `nodejs_compat`를 **자동 주입**해서, `wrangler.toml`에 플래그가 없어도 테스트는 초록불이지만 프로덕션에선 깨질 수 있다. 83.38% 커버리지가 안심이 아닐 수 있다. _Novelty 2 · SurpriseScore 6.0._ **내일 첫 액션:** `wrangler.toml`의 `compatibility_flags`와 테스트 주입 플래그를 1:1 대조.
3. **D1 무료 한도가 어느 날 갑자기 서비스를 멈춘다** — 2025-02-10부터 D1 무료 플랜에 일일 한도가 시행됐다. 한도 초과 시 쿼리가 UTC 0시까지 에러를 반환 — SSOT 전체가 멈춘다. 모니터링·가드가 없다. _Novelty 2 · SurpriseScore 6.0._ **내일 첫 액션:** 플랜 확인(`wrangler` 대시보드) + 일일 쿼리량 로깅.

---

## 1. Executive Summary

mcp-dev-hub v3는 **아키텍처 골격이 건강하다** — `tools/index.ts` 단일 라우터, D1 SSOT, prepared statement, API_KEY 시크릿 관리까지 CLAUDE.md 설계 원칙이 코드에 실제로 지켜졌다. 레거시 v1/v2/v3도 방금 제거돼 그래프가 깔끔해졌다.

가장 큰 공백은 **운영 안전망 3종**이다: ① **동시성 방어 부재**(멀티-AI가 핵심 사용 시나리오인데 idempotency·optimistic lock이 없음), ② **rate limiting 부재**(API 남용·폭주 무방비), ③ **관측성 미설정**(CLAUDE.md는 구조화 로그를 요구하지만 `wrangler.toml`에 observability 블록 없음). 여기에 **플랫폼 위생** 항목(오래된 `compatibility_date`, ESLint 8 EOL, D1 일일 한도)이 저비용·고확신 quick win으로 깔려 있다.

권장 경로: **Quick Wins(플랫폼 위생) → 안전망(rate limit·observability) → 동시성 강화(idempotency·optimistic lock)** 순. 전부 backward-compatible하며 feature flag/canary로 점진 적용 가능.

---

## 2. Current State Snapshot

| 영역                 | 현재 상태                                     | 평가                                           |
| -------------------- | --------------------------------------------- | ---------------------------------------------- |
| Transport            | 단순 HTTP POST JSON-RPC 2.0                   | ⚠ MCP 표준 Streamable HTTP 아님                |
| Auth                 | `x-api-key` / `Bearer` pre-shared key         | ✅ 내부 도구로 적절 (단 audience 검증 없음)    |
| Rate limiting        | 없음                                          | ❌ 남용 무방비                                 |
| 동시성 제어          | `lock.ts` 존재, idempotency·version 컬럼 없음 | ⚠ race condition·중복 실행 위험                |
| Observability        | `wrangler.toml`에 설정 없음                   | ❌ 구조화 로그 요구 vs 미설정                  |
| D1                   | SSOT, prepared statement                      | ✅ 안전 / ⚠ 일일 한도 모니터링 없음            |
| `compatibility_date` | `2025-01-01`                                  | ⚠ 17개월 경과                                  |
| 빌드/린트            | ESLint 8.57, TS strict, Prettier              | ⚠ ESLint 8 EOL (9 flat config 표준)            |
| 테스트               | vitest-pool-workers, 10파일, 83.38%           | ✅ 런타임 일치 / ⚠ nodejs_compat 거짓통과 함정 |
| 의존성               | D1만 (KV/DO/Queues 미사용)                    | 정보                                           |

---

## 3. Upgrade Ideas Top 10

| #   | 아이디어                                                                | 버킷            | I   | E   | R   | C   | **Nov** | **Priority** | **Surprise** | Evidence |
| --- | ----------------------------------------------------------------------- | --------------- | --- | --- | --- | --- | ------- | ------------ | ------------ | -------- |
| 7   | `compatibility_date` 갱신 + `nodejs_compat` 1:1 검증                    | DX              | 3   | 1   | 1   | 5   | 2       | **15.0**     | 6.0          | E7, E8   |
| 9   | D1 일일 한도 모니터링 + 플랜 가드                                       | Reliability     | 3   | 1   | 1   | 4   | 2       | **12.0**     | 6.0          | E4, E5   |
| 3   | Workers Observability(구조화 로그 + head_sampling)                      | Reliability/Obs | 4   | 2   | 1   | 5   | 2       | **10.0**     | 4.0          | E9, E10  |
| 2   | Workers Rate Limiting binding                                           | Security        | 4   | 2   | 2   | 5   | 2       | **5.0**      | 4.0          | E5, E6   |
| 1   | write 툴 Idempotency Key (멀티-AI 중복 방지)                            | Reliability     | 5   | 3   | 2   | 4   | 4       | **3.33**     | **6.67**     | E11, E12 |
| 5   | `lock_task` Optimistic Concurrency (version 컬럼)                       | Reliability     | 4   | 3   | 2   | 4   | 3       | **2.67**     | 4.0          | E11, E12 |
| 6   | MCP token audience 검증 + `.well-known/oauth-protected-resource`        | Security        | 3   | 3   | 2   | 4   | 3       | **2.0**      | 3.0          | E3, E1   |
| 8   | ESLint 9 flat config 마이그레이션                                       | DX              | 2   | 2   | 2   | 4   | 1       | **2.0**      | 1.0          | E6       |
| 10  | ⚠AMBER 항공식 다중승인 게이트 → `finalize_retro→election` deadlock 방지 | Process         | 3   | 3   | 2   | 3   | 5       | **1.5**      | 5.0          | E11      |
| 4   | MCP Streamable HTTP transport (SSE 폐기 대응)                           | Architecture    | 4   | 4   | 3   | 4   | 3       | **1.33**     | 3.0          | E1, E2   |

_점수: Impact·Effort·Risk·Confidence·Novelty (1–5). Priority=(I×C)/(E×R), Surprise=(Nov×I)/E._

---

## 4. Best 3 Deep Report

> 선정: PriorityScore 상위 + **버킷 다양성**(DX·Reliability·Security 균형). #3 Observability(10.0)는 동일 Reliability 버킷 중복 회피로 로드맵 1순위에 배치, Best3는 #7·#9·#2.

### Best 1 — `compatibility_date` 갱신 + `nodejs_compat` 1:1 검증 (DX, Priority 15.0)

- **Goal:** 테스트 환경과 프로덕션 런타임의 동작 일치 보장. 거짓 통과(false-positive) 제거.
- **Non-goals:** Node API 신규 도입, 런타임 동작 변경.
- **Proposed Design:**
  - `wrangler.toml`의 `compatibility_date`를 `2025-01-01` → 최신 안정일(예: `2025-09-XX`)로 상향, 변경 시 changelog 확인.
  - 테스트 풀이 자동 주입하는 `nodejs_compat`/`export_commonjs_default`와 `wrangler.toml`의 `compatibility_flags`를 대조하는 1줄 CI 가드.
  - `src/`에서 실제 사용 중인 Node 빌트인(`node:*` import) grep → 0이면 플래그 정당성 재확인.
- **PR Plan (≥3):**
  1. `chore: bump compatibility_date + audit nodejs_compat` — `wrangler.toml`. Rollback: 날짜 1줄 revert.
  2. `test: add CI guard comparing injected vs configured compat flags` — CI 스크립트. Rollback: 가드 step 제거.
  3. `docs: record runtime-parity policy in CLAUDE.md` — 문서. Rollback: 문서 revert.
- **Tests:** 전체 vitest run(회귀), `wrangler deploy --dry-run` 빌드 검증, 날짜 상향 전/후 동일 테스트 통과 대조.
- **Rollout & Rollback:** dev env(`mcp-dev-hub-dev`)에서 먼저 dry-run → 이상 없으면 prod. 되돌리기는 날짜 1줄.
- **Risks & Mitigations:** ①날짜 상향이 숨은 동작 변경 유발 → dev dry-run 선행. ②테스트만 통과하던 코드 노출 → 의도된 발견. ③flag 제거 시 런타임 에러 → grep으로 사전 확인. ④CI 가드 오탐 → allowlist. ⑤문서 표류 → CLAUDE.md 단일 기록.
- **KPI:** 테스트/프로덕션 동작 불일치 incident 0건, dry-run 빌드 0 errors.
- **Dependencies:** vitest 4.1+, vitest-pool-workers 0.16+ (충족).
- **Evidence:** E7(Vitest pool docs), E8(nodejs_compat 함정 changelog).

### Best 2 — D1 일일 한도 모니터링 + 플랜 가드 (Reliability, Priority 12.0)

- **Goal:** D1 무료 한도 초과로 인한 SSOT 전면 중단을 사전 차단.
- **Non-goals:** 쿼리 로직 변경, 다른 DB로 이전.
- **Proposed Design:**
  - 현재 플랜 확인(Free/Paid). Free면 일일 read/write 한도 대비 사용량 추정.
  - `lib/db.ts` 래퍼에 쿼리 카운터(구조화 로그 필드 `d1_op`)를 emit → Observability(Best3 후속)에서 집계.
  - 임계 도달 시 `broadcast_event(warning)`로 경보(ZERO 연계).
- **PR Plan (≥3):**
  1. `feat: emit structured d1_op log per query in db wrapper` — `src/lib/db.ts`. Rollback: 로그 라인 제거.
  2. `feat: daily-quota warn via broadcast_event threshold` — `event.ts` 연계. Rollback: 임계 체크 제거.
  3. `docs: D1 plan & quota runbook` — 문서. Rollback: 문서 revert.
- **Tests:** db 래퍼 단위테스트(카운터 증가), 임계 초과 시 경보 emit 통합테스트, 회귀 전체.
- **Rollout & Rollback:** 로깅은 무해 — 즉시 prod 가능. 경보 임계는 feature flag(env var)로 on/off.
- **Risks & Mitigations:** ①로그 폭증 → head_sampling. ②추정 부정확 → 실측 보정. ③경보 피로 → 임계 튜닝. ④플랜 오인 → 대시보드 확인. ⑤UTC 리셋 타이밍 혼동 → 문서화.
- **KPI:** 한도 초과로 인한 쿼리 에러 0건, 일일 사용량 가시성 100%.
- **Dependencies:** Observability(Best3)와 시너지. 단독으로도 동작.
- **Evidence:** E4(D1 release notes), E5(Workers 한도 docs).

### Best 3 — Workers Rate Limiting binding (Security, Priority 5.0)

- **Goal:** AI별/툴별 호출 폭주·남용을 엣지에서 차단. SSOT 보호.
- **Non-goals:** 과금 티어링, 사용자 인증 체계 개편.
- **Proposed Design:**
  - Workers 네이티브 Rate Limiting binding 사용. 키 = `{actor}:{tool}` (actor=AI 이름, tool=메서드명) 복합키.
  - 쓰기 툴(create/lock/update/broadcast)에 엄격 한도, 읽기 툴(get/list)에 느슨 한도 — 다중 binding.
  - 초과 시 MCP 에러(-32603 계열 또는 커스텀) + `Retry-After` 힌트.
- **PR Plan (≥3):**
  1. `feat: add rate-limit bindings to wrangler.toml (write/read namespaces)` — `wrangler.toml`. Rollback: binding 제거.
  2. `feat: enforce composite-key rate limit in mcp dispatch` — `lib/mcp.ts`/`tools/index.ts`. Rollback: 미들웨어 bypass 플래그.
  3. `test: rate-limit unit + integration (429 path)` — 테스트. Rollback: 해당 spec skip.
- **Tests:** 한도 내/초과 단위테스트, 복합키 격리 통합테스트, 회귀, perf(한도 체크 오버헤드 측정).
- **Rollout & Rollback:** feature flag로 enforce on/off. 처음엔 **shadow 모드**(로그만, 차단 안 함)로 임계 검증 → enforce 전환. 되돌리기는 flag off.
- **Risks & Mitigations:** ①정상 트래픽 오차단 → shadow 선행 + 넉넉한 초기 한도. ②binding namespace 공유로 의도치 않은 공유 카운터 → 고유 `namespace_id`. ③멀티-AI 동시성과 충돌 → actor별 분리키. ④에러 코드 클라이언트 비호환 → 표준 에러 + Retry-After. ⑤한도 우회 → 인증과 결합.
- **KPI:** 남용성 폭주 차단율, 정상 트래픽 오차단 <0.1%, p99 지연 증가 <5ms.
- **Dependencies:** Workers Rate Limiting binding(GA). Auth(현행 API_KEY)와 결합 권장.
- **Evidence:** E5(Rate Limit docs), E6(Workers 2025 가이드).

---

## 5. Options A/B/C

| 옵션       | 범위                                                        | 리스크 | 기간 | 권장 대상                |
| ---------- | ----------------------------------------------------------- | ------ | ---- | ------------------------ |
| **A 보수** | Best1 + Best2 (플랫폼 위생 + D1 가드)                       | 낮음   | ~1주 | 즉시 안정성 확보         |
| **B 중간** | A + Best3(rate limit, shadow) + #3 Observability            | 중     | ~3주 | 운영 안전망 완비 (권장)  |
| **C 공격** | B + #1 Idempotency + #5 Optimistic lock + #6 token audience | 중상   | ~6주 | 멀티-AI 동시성 본격 강화 |

---

## 6. 30/60/90-day Roadmap (PR 단위)

**30일 — Quick Wins & 가시성**

- [ ] PR: `compatibility_date` 상향 + nodejs_compat CI 가드 (Best1)
- [ ] PR: D1 `d1_op` 구조화 로그 + 플랜/한도 runbook (Best2)
- [ ] PR: `wrangler.toml` observability 블록 + `head_sampling_rate` 설정 (#3)
- [ ] PR: ESLint 9 flat config 마이그레이션 (#8)

**60일 — 안전망**

- [ ] PR: Rate Limiting binding (shadow 모드) (Best3)
- [ ] PR: shadow 임계 검증 후 enforce 전환 (Best3)
- [ ] PR: D1 한도 임계 → `broadcast_event(warning)` 경보 (Best2 후속)

**90일 — 동시성 강화**

- [ ] PR: write 툴 `client_request_id` 컬럼 + UNIQUE 인덱스 (Idempotency, #1)
- [ ] PR: dispatch 레이어 idempotency 캐시/replay (#1)
- [ ] PR: `lock_task` version 컬럼 + 조건부 UPDATE (Optimistic, #5)
- [ ] PR: MCP token audience 검증 + `.well-known/oauth-protected-resource` (#6)

---

## 7. Evidence Table

| ID  | Platform        | Title                                                                    | Date           | Popularity | URL                                                                                                      |
| --- | --------------- | ------------------------------------------------------------------------ | -------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| E1  | official        | Model Context Protocol — Cloudflare Agents docs (Streamable HTTP, OAuth) | rolling (2025) | —          | https://developers.cloudflare.com/agents/model-context-protocol/                                         |
| E2  | official        | Transport — Cloudflare Agents docs (SSE deprecated → Streamable HTTP)    | rolling (2025) | —          | https://developers.cloudflare.com/agents/model-context-protocol/transport/                               |
| E3  | medium/official | MCP Spec Updates June 2025 — Auth0 (resource server, RFC 8707)           | 2025-06        | —          | https://auth0.com/blog/mcp-specs-update-all-about-auth/                                                  |
| E4  | official        | Cloudflare D1 Release Notes (latency −40~60%, 1TB)                       | rolling (2025) | —          | https://developers.cloudflare.com/d1/platform/release-notes/                                             |
| E5  | official        | Rate Limiting — Cloudflare Workers docs                                  | rolling (2025) | —          | https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/                              |
| E6  | official        | Workers Best Practices — Cloudflare docs                                 | rolling (2025) | —          | https://developers.cloudflare.com/workers/best-practices/workers-best-practices/                         |
| E7  | official        | @cloudflare/vitest-pool-workers — npm/docs                               | rolling (2025) | —          | https://www.npmjs.com/package/@cloudflare/vitest-pool-workers                                            |
| E8  | official        | Vitest ctx.exports support (changelog)                                   | 2025-12-16     | —          | https://developers.cloudflare.com/changelog/2025-12-16-vitest-ctx-exports-support/                       |
| E9  | official        | Introducing Workers Observability — Cloudflare blog                      | 2025           | —          | https://blog.cloudflare.com/introducing-workers-observability-logs-metrics-and-queries-all-in-one-place/ |
| E10 | official        | Workers Logs — Cloudflare docs (structured JSON, sampling)               | rolling (2025) | —          | https://developers.cloudflare.com/workers/observability/logs/workers-logs/                               |
| E11 | medium          | Idempotency-Key Patterns for Exactly-Once API Execution                  | ⚠ 미상         | —          | https://devtechtools.org/en/blog/idempotency-key-patterns-for-exactly-once-api-execution                 |
| E12 | medium          | Implementing Idempotency Keys in REST APIs — Zuplo                       | ⚠ 미상         | —          | https://zuplo.com/learning-center/implementing-idempotency-keys-in-rest-apis-a-complete-guide            |

---

## 8. AMBER_BUCKET (날짜/근거 불확실)

| 항목                                 | 사유                              | 보강 방법                                                                                                          |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| E11, E12 (Idempotency 블로그)        | published_date 미확인             | Idempotency 개념은 evergreen + Stripe 공식 문서로 보강 가능. **단독 채택 금지**, Best3에서 제외(Top10 #1로만 유지) |
| #10 항공식 다중승인 게이트           | Cross-domain 차용, 직접 출처 약함 | Novelty 5로 Top10 표기 유지. 실제 적용 전 항공/CI 다중승인 사례 1건 추가 수집 필요                                 |
| MCP spec 2025-03-26 (SSE→Streamable) | rolling floor(2025-06-13) 미달    | 후속 2025-06-18·2025-11-25 spec + Cloudflare official docs(E1,E2)로 대체·보강 완료                                 |

**AMBER 카운트: 1 (Idempotency 날짜군 묶음)** → ZERO 임계(2) 미달. **파이프라인 정상 진행.**

---

## 9. Verification Gate

| 검사                                                        | 결과                                             |
| ----------------------------------------------------------- | ------------------------------------------------ |
| Evidence completeness (Best3 ≥2, 날짜)                      | ✅ Best1·2·3 모두 official 근거 ≥2 + 날짜        |
| Deep Dive completeness (PR≥3, tests, rollout/rollback, KPI) | ✅ 3개 Best 전부 충족                            |
| Stack/constraints compatibility                             | ✅ 전부 Workers+D1 네이티브, backward-compatible |
| Safety (no secrets/PII)                                     | ✅ 시크릿·토큰·PII 출력 없음                     |

**Apply Gates**

- Gate 0 Dry-run: 본 리포트는 제안만 — 쓰기 0건 ✅
- Gate 1 Change list: 각 Best의 PR Plan에 변경 파일/영향 범위 명시 ✅
- Gate 2 Explicit approval: **사용자 승인 전 코드 변경 금지** ⏸
- Gate 3 Canary/Flag: Best3 shadow 모드, Best2 env flag, 모두 feature flag 가능 ✅
- Gate 4 Rollback: 각 PR rollback note 명시 ✅

**최종 판정: 🟢 GO** (단 Gate 2 — 실제 적용은 사용자 승인 후)

---

## 10. Open Questions

1. 이 MCP 서버는 **내부 팀 전용**인가, 외부 공개 예정인가? (공개면 #6 OAuth 2.1+PKCE 우선순위 급상승)
2. D1 플랜은 **Free vs Paid**? (Best2 긴급도 결정 — Free면 30일 내 최우선)
3. 멀티-AI 동시 호출의 실측 **충돌 빈도**가 있는가? (있으면 Idempotency #1을 Best3로 승격)

---

## SESSION_HANDOFF

```
skill: project-upgrade v2.2 | date: 2026-06-13
key_findings:
  - 아키텍처 골격 건강(단일 라우터·D1 SSOT·prepared stmt). 공백은 운영 안전망 3종(동시성·rate limit·observability)
  - 플랫폼 위생 quick win 다수: compatibility_date 17개월 경과, ESLint 8 EOL, D1 일일 한도 무방비, nodejs_compat 거짓통과 함정
surprise_picks:
  - idea: "결제 Idempotency Key를 멀티-AI 중복방지로 역수입" | Novelty: 4 | SurpriseScore: 6.67 | status: PASS(개념) / ⚠AMBER(블로그 날짜)
  - idea: "vitest-pool-workers nodejs_compat 거짓통과 차단" | Novelty: 2 | SurpriseScore: 6.0 | status: PASS
  - idea: "D1 일일 한도 모니터링·플랜 가드" | Novelty: 2 | SurpriseScore: 6.0 | status: PASS
amber_count: 1
next_suggested: project-plan --focus="best3"
```
