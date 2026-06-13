/**
 * MCP DEV HUB v3 - Cloudflare Worker
 * Session Lifecycle + Retro + Leader Election
 */
import { auth } from './lib/auth';
import { cors } from './lib/cors';
import { jsonRpcError } from './lib/errors';
import type { Env, MCPRequest } from './lib/mcp';
import { handleTool, tools } from './tools/index';

const serverInfo = {
  name: 'mcp-dev-hub',
  version: '3.0.0',
};

const features = [
  'state',
  'tasks',
  'discussion',
  'voting',
  'consensus',
  'handoff',
  'session',
  'retro',
  'leader_election',
];

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...cors(),
      ...init.headers,
    },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return jsonResponse({
        status: 'ok',
        server: serverInfo.name,
        version: serverInfo.version,
        features,
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 });
    }

    if (!auth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: MCPRequest;
    try {
      const raw = await request.text();
      // 경계 검증: U+FFFD(치환문자)는 비-UTF-8 body가 디코딩 손실된 신호.
      // 손상된 payload가 D1에 영구 저장되기 전에 쓰기 시점에서 거부한다.
      if (raw.includes('�')) {
        return jsonResponse(
          jsonRpcError(null, -32602, 'Invalid UTF-8 in request body. Send body encoded as UTF-8.'),
          { status: 400 }
        );
      }
      body = JSON.parse(raw) as MCPRequest;
    } catch {
      return jsonResponse(jsonRpcError(null, -32700, 'Parse error'), { status: 400 });
    }

    const { id, method, params } = body;

    try {
      if (method === 'initialize') {
        return jsonResponse({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo,
          },
        });
      }

      if (method === 'tools/list') {
        return jsonResponse({ jsonrpc: '2.0', id, result: { tools } });
      }

      if (method === 'ping') {
        return jsonResponse({ jsonrpc: '2.0', id, result: {} });
      }

      if (method === 'notifications/initialized') {
        return new Response(null, { status: 202, headers: cors() });
      }

      if (method === 'tools/call') {
        const callParams = params as { name?: unknown; arguments?: unknown } | undefined;

        if (typeof callParams?.name !== 'string') {
          return jsonResponse(jsonRpcError(id, -32602, 'Invalid tool call params'), {
            status: 400,
          });
        }

        const args =
          callParams.arguments && typeof callParams.arguments === 'object'
            ? (callParams.arguments as Record<string, unknown>)
            : {};
        const result = await handleTool(callParams.name, args, env.DB);

        return jsonResponse({ jsonrpc: '2.0', id, result });
      }

      return jsonResponse(jsonRpcError(id, -32601, `Method not found: ${method}`), {
        status: 404,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error';
      return jsonResponse(jsonRpcError(id, -32603, message), { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
