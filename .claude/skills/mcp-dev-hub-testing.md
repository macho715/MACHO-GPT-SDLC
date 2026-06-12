---
name: mcp-dev-hub-testing
description: mcp-dev-hub v3 테스트 전략 — Vitest + wrangler dev 통합 테스트. Use when "writing tests", "testing D1 queries", "MCP integration test".
---

# MCP DEV HUB Testing

## 테스트 전략 (3계층)

### Layer 1: 단위 테스트 (Vitest)

- **위치**: `src/**/*.test.ts` (같은 디렉토리)
- **도구**: Vitest + @cloudflare/workers-types mock
- **목표 커버리지**: 80%+

```typescript
// src/tools/session.test.ts
import { describe, it, expect, vi } from 'vitest';
import { startSession } from './session';

describe('startSession', () => {
  it('creates session with leader', async () => {
    const mockDB = createMockD1();
    const result = await startSession({ leader: 'codex', title: 'Test' }, mockDB);
    expect(result.session_id).toMatch(/^SESS-/);
    expect(result.leader).toBe('codex');
  });
});
```

### Layer 2: D1 통합 테스트 (Miniflare)

- **도구**: `@cloudflare/vitest-pool-workers` (실제 D1 에뮬레이트)
- **위치**: `tests/integration/*.test.ts`

```typescript
import { env } from 'cloudflare:test';

it('persists session to D1', async () => {
  const result = await handleTool('start_session', { leader: 'codex' }, env.DB);
  const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?')
    .bind(result.session_id)
    .first();
  expect(row.leader).toBe('codex');
});
```

### Layer 3: E2E (wrangler dev)

- **도구**: 실제 워커 + curl/fetch
- **위치**: `tests/e2e/*.test.ts`

```typescript
it('handles MCP JSON-RPC request', async () => {
  const res = await fetch('http://localhost:8787/', {
    method: 'POST',
    headers: { 'x-api-key': 'test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const json = await res.json();
  expect(json.result.tools.length).toBe(32);
});
```

## 실행 명령어

```bash
npm test                          # 단위 + 통합
npx vitest run                    # 전체
npx vitest run tools/session      # 모듈별
npx vitest watch                  # watch 모드
npm run test:coverage             # 커버리지 리포트
```

## D1 Mock 패턴

```typescript
function createMockD1() {
  const data = new Map<string, any[]>();
  return {
    prepare(sql: string) {
      return {
        bind: (...args: any[]) => ({
          first: async () => data.get('result')?.[0] ?? null,
          all: async () => ({ results: data.get('result') ?? [] }),
          run: async () => ({ success: true }),
        }),
        first: async () => data.get('result')?.[0] ?? null,
        all: async () => ({ results: data.get('result') ?? [] }),
        run: async () => ({ success: true }),
      };
    },
  } as unknown as D1Database;
}
```

## 테스트 체크리스트

- [ ] `get_dashboard` 빈 상태 → 기본값
- [ ] `start_session` → SESS-NNN 형식
- [ ] `lock_task` 충돌 시 `locked: true` 반환
- [ ] `submit_retro` 4명 미만 → finalize 실패
- [ ] `cast_election_vote` 중복 → 1회만 카운트
- [ ] API_KEY 누락 → 401
- [ ] 잘못된 JSON → -32700 Parse error
- [ ] 존재하지 않는 method → -32601
