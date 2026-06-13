# MCP DEV HUB v3 Production Deploy Plan

## Phase 1: Business Review

### 1.1 Problem Definition

현재 상태는 v3 Worker 코드가 로컬 검증과 dry-run 배포까지 통과한 상태다.
목표 상태는 Cloudflare 계정에 실제 Worker, D1 바인딩, API_KEY Secret이 연결된 production 배포 상태다.

영향 범위는 Worker 1개, D1 데이터베이스 바인딩 1개, production Secret 1개, MCP HTTP endpoint 1개다.

### 1.2 Options

| 옵션 | 설명                                                                 | 공수(일) | 리스크                                                         | 비용(AED) |
| ---- | -------------------------------------------------------------------- | -------- | -------------------------------------------------------------- | --------- |
| A    | 현재 Worker 이름 `mcp-dev-hub`로 새 production 배포를 만든다.        | 0.5      | D1 ID와 Secret 순서가 틀리면 배포 또는 런타임 인증이 실패한다. | 0         |
| B    | 먼저 dev 환경 `mcp-dev-hub-dev`로 배포한 뒤 production으로 승격한다. | 1        | 한 번 더 검증해야 하지만 production 리스크가 낮다.             | 0         |
| C    | 배포하지 않고 dry-run 상태에서 멈춘다.                               | 0        | 외부 MCP client가 사용할 endpoint가 없다.                      | 0         |

### 1.3 Recommendation

추천은 옵션 B다.
지금 `wrangler.toml`의 D1 `database_id`가 placeholder 상태이고, `wrangler secret list` 결과 Worker `mcp-dev-hub`도 아직 없다.
먼저 dev 배포로 D1 바인딩과 Secret 절차를 확인한 뒤 production 배포로 넘어가는 편이 안전하다.

롤백 전략은 새 Worker 배포를 되돌리거나 Cloudflare dashboard에서 해당 Worker route를 비활성화하는 것이다.

### 1.4 Approval Request

- [ ] Phase 1 승인

승인 전에는 Phase 2 Engineering Review와 실제 `npm run deploy`를 실행하지 않는다.

## Current Blocking Evidence

- `wrangler whoami`는 OAuth 로그인 상태를 확인했다.
- `wrangler d1 list`는 `fetch failed`로 실패해서 계정의 D1 목록을 확인하지 못했다.
- `wrangler secret list --format json`은 Worker `mcp-dev-hub`가 없다고 반환했다.
- `wrangler.toml`의 production D1 `database_id`는 `REPLACE_WITH_YOUR_D1_ID` placeholder 상태다.

## Deploy Gate

실제 배포 전 최소 조건은 아래와 같다.

- production D1 `database_id`를 실제 Cloudflare D1 ID로 교체한다.
- Worker가 없으면 먼저 Worker 생성 경로를 확정한다.
- `API_KEY` Secret을 등록한다.
- `npm run validate`와 `npm run test:coverage`를 다시 통과시킨다.
- `npx wrangler deploy --dry-run --env=""`를 다시 통과시킨다.
- 마지막으로 `npm run deploy`를 실행한다.
