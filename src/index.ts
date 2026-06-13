/**
 * MCP DEV HUB v3 - Cloudflare Worker
 * Session Lifecycle + Retro + Leader Election
 */
import { buildDashboardData, buildMcpStatus } from './dashboard/data';
import { renderDashboardPage } from './dashboard/page';
import { buildProjectSessions } from './dashboard/projects';
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

    if (request.method === 'GET') {
      const path = new URL(request.url).pathname;

      if (path === '/health') {
        return jsonResponse({
          status: 'ok',
          server: serverInfo.name,
          version: serverInfo.version,
          features,
        });
      }

      // Dashboard shell is public (read-only HTML with no embedded data).
      // The live data it fetches is gated below by the same API_KEY auth.
      // Auto-fill the key ONLY when DASHBOARD_AUTOFILL=1, which lives in
      // .dev.vars (loaded by `wrangler dev`, never shipped by `wrangler deploy`).
      // A deployed worker has no such flag, so the public page never leaks a key.
      if (path === '/dashboard') {
        const defaultKey = env.DASHBOARD_AUTOFILL === '1' ? (env.API_KEY ?? '') : '';
        return new Response(renderDashboardPage(defaultKey), {
          headers: { ...cors(), 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      if (path === '/api/dashboard' || path === '/api/mcp-status' || path === '/api/projects') {
        if (!auth(request, env)) {
          return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
        }
        try {
          let data: unknown;
          if (path === '/api/dashboard') {
            data = await buildDashboardData(env.DB);
          } else if (path === '/api/projects') {
            data = await buildProjectSessions(env.DB);
          } else {
            data = await buildMcpStatus(env.DB, {
              server: serverInfo.name,
              version: serverInfo.version,
              features,
              toolCount: tools.length,
            });
          }
          return jsonResponse(data);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Internal error';
          return jsonResponse({ error: message }, { status: 500 });
        }
      }
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, { status: 405 });
    }

    if (!auth(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: MCPRequest;
    try {
      let raw: string;
      try {
        raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
          await request.arrayBuffer()
        );
      } catch {
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
