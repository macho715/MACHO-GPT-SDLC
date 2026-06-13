import { describe, expect, it } from 'vitest';
import worker from './index';
import { createD1Mock } from '../tests/helpers/d1Mock';

const env = {
  DB: createD1Mock(),
  API_KEY: 'test-key',
  ENVIRONMENT: 'test',
};

const post = (body: unknown, apiKey = 'test-key') =>
  new Request('http://localhost/', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

describe('worker entrypoint', () => {
  it('serves health checks', async () => {
    const response = await worker.fetch(new Request('http://localhost/health'), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      version: '3.0.0',
    });
  });

  it('serves the dashboard shell as HTML without auth', async () => {
    const response = await worker.fetch(new Request('http://localhost/dashboard'), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    const body = await response.text();
    expect(body).toContain('MCP Dev Hub');
    expect(body).toContain('mcp_api_key');
  });

  it('rejects /api/dashboard and /api/mcp-status without a key', async () => {
    const d = await worker.fetch(new Request('http://localhost/api/dashboard'), env);
    expect(d.status).toBe(401);
    const s = await worker.fetch(new Request('http://localhost/api/mcp-status'), env);
    expect(s.status).toBe(401);
  });

  it('serves /api/dashboard JSON with a valid key', async () => {
    const req = new Request('http://localhost/api/dashboard', {
      headers: { 'x-api-key': 'test-key' },
    });
    const response = await worker.fetch(req, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ agents: [], active_session: null });
  });

  it('serves /api/mcp-status JSON with server meta and zero flags', async () => {
    const req = new Request('http://localhost/api/mcp-status', {
      headers: { 'x-api-key': 'test-key' },
    });
    const response = await worker.fetch(req, env);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      server: string;
      tool_count: number;
      zero_flags: { blocked_escalation: boolean; handoff_pending: boolean };
    };
    expect(payload.server).toBe('mcp-dev-hub');
    expect(payload.tool_count).toBe(31);
    expect(payload.zero_flags.blocked_escalation).toBe(false);
  });

  it('handles CORS preflight', async () => {
    const response = await worker.fetch(
      new Request('http://localhost/', { method: 'OPTIONS' }),
      env
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects unauthorized POST requests', async () => {
    const response = await worker.fetch(
      post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'bad'),
      env
    );
    expect(response.status).toBe(401);
  });

  it('rejects non-POST non-health requests', async () => {
    const response = await worker.fetch(new Request('http://localhost/', { method: 'PUT' }), env);
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: 'Method Not Allowed' });
  });

  it('handles initialize and tools/list requests', async () => {
    const initialized = await worker.fetch(
      post({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      env
    );
    await expect(initialized.json()).resolves.toMatchObject({
      id: 1,
      result: { serverInfo: { name: 'mcp-dev-hub', version: '3.0.0' } },
    });

    const listed = await worker.fetch(post({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), env);
    const payload = (await listed.json()) as { result: { tools: unknown[] } };
    expect(payload.result.tools).toHaveLength(31);
  });

  it('rejects requests whose body contains U+FFFD (invalid UTF-8)', async () => {
    const response = await worker.fetch(
      post({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'broadcast_event',
          arguments: {
            event_type: 'info',
            agent: 'codex',
            message: 'MCP v3 �� 테스트 완료',
          },
        },
      }),
      env
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: -32602 } });
  });

  it('accepts clean Korean payloads (regression for UTF-8 guard)', async () => {
    const response = await worker.fetch(
      post({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'broadcast_event',
          arguments: {
            event_type: 'info',
            agent: 'codex',
            message: 'MCP v3 통합 테스트 완료',
          },
        },
      }),
      env
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { error?: unknown };
    expect(payload.error).toBeUndefined();
  });

  it('handles MCP ping and initialized notifications', async () => {
    const pinged = await worker.fetch(post({ jsonrpc: '2.0', id: 7, method: 'ping' }), env);
    await expect(pinged.json()).resolves.toEqual({
      jsonrpc: '2.0',
      id: 7,
      result: {},
    });

    const initialized = await worker.fetch(
      post({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      env
    );
    expect(initialized.status).toBe(202);
  });

  it('returns JSON-RPC errors for bad requests', async () => {
    const invalidParams = await worker.fetch(
      post({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {} }),
      env
    );
    expect(invalidParams.status).toBe(400);

    const missingMethod = await worker.fetch(
      post({ jsonrpc: '2.0', id: 4, method: 'missing' }),
      env
    );
    expect(missingMethod.status).toBe(404);

    const parseError = await worker.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'x-api-key': 'test-key' },
        body: '{',
      }),
      env
    );
    expect(parseError.status).toBe(400);
  });

  it('handles tools/call success and internal errors', async () => {
    const okResponse = await worker.fetch(
      post({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'get_dashboard', arguments: {} },
      }),
      env
    );

    await expect(okResponse.json()).resolves.toMatchObject({
      id: 5,
      result: { content: [{ type: 'text' }] },
    });

    const errorEnv = {
      ...env,
      DB: createD1Mock(() => {
        throw new Error('database unavailable');
      }),
    };
    const errorResponse = await worker.fetch(
      post({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'get_dashboard', arguments: {} },
      }),
      errorEnv
    );

    expect(errorResponse.status).toBe(500);
    await expect(errorResponse.json()).resolves.toMatchObject({
      id: 6,
      error: { code: -32603, message: 'database unavailable' },
    });
  });

  it('accepts Authorization Bearer token instead of x-api-key', async () => {
    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-key',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
  });

  it('start_session works when COUNT query returns null row', async () => {
    const nullEnv = {
      ...env,
      DB: createD1Mock((sql, _args, operation) => {
        if (operation === 'first' && sql.includes('COUNT(*) as c')) {
          return null;
        }
        return operation === 'all' ? { results: [] } : { success: true, meta: {} };
      }),
    };
    const res = await worker.fetch(
      post({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'start_session', arguments: { title: 'T', leader: 'codex' } },
      }),
      nullEnv
    );
    const payload = (await res.json()) as { result: { content: [{ text: string }] } };
    expect(JSON.parse(payload.result.content[0].text).session_id).toBe('SESS-001');
  });
});
