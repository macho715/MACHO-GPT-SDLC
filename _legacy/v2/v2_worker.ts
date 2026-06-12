/**
 * MCP DEV HUB v2 — Cloudflare Worker
 * ★ AI 간 토론 / 투표 / 컨센서스 포함
 */

import { tools, handleTool } from './tools/index';

export interface Env {
  DB: D1Database;
  API_KEY: string;
}

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Content-Type': 'application/json',
  };
}

function authenticate(req: Request, env: Env): boolean {
  const key =
    req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  return key === env.API_KEY;
}

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          server: 'mcp-dev-hub',
          version: '2.0.0',
          features: ['state', 'tasks', 'discussion', 'voting', 'consensus', 'handoff'],
        }),
        { headers: corsHeaders() }
      );
    }

    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (!authenticate(request, env))
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders(),
      });

    let body: MCPRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id: 0, error: { code: -32700, message: 'Parse error' } }),
        { status: 400, headers: corsHeaders() }
      );
    }

    const { id, method, params } = body;

    try {
      let result: unknown;
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mcp-dev-hub', version: '2.0.0' },
          };
          break;
        case 'tools/list':
          result = { tools };
          break;
        case 'tools/call': {
          const p = params as { name: string; arguments: Record<string, unknown> };
          result = await handleTool(p.name, p.arguments ?? {}, env.DB);
          break;
        }
        default:
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: `Method not found: ${method}` },
            }),
            { status: 404, headers: corsHeaders() }
          );
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        headers: corsHeaders(),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Internal error';
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: msg } }),
        { status: 500, headers: corsHeaders() }
      );
    }
  },
};
