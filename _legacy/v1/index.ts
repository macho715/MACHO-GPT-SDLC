/**
 * MCP DEV HUB — Cloudflare Workers
 * GitHub / Linear 의존성 없이 완전 자립 동작하는
 * 멀티 AI 개발 상황 공유 MCP 서버
 *
 * 지원 AI: Codex | Claude | OpenCode Go | MiniMax
 */

import { tools, handleTool } from './tools/index';

export interface Env {
  DB: D1Database;
  API_KEY: string; // Cloudflare Secret
}

// ─── MCP 메시지 타입 ───────────────────────────────────────────
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ─── CORS 헤더 ────────────────────────────────────────────────
function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
    'Content-Type': 'application/json',
  };
}

// ─── API Key 인증 ─────────────────────────────────────────────
function authenticate(request: Request, env: Env): boolean {
  const apiKey =
    request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace('Bearer ', '');
  return apiKey === env.API_KEY;
}

// ─── MCP 응답 빌더 ────────────────────────────────────────────
function mcpResponse(id: string | number, result: unknown): MCPResponse {
  return { jsonrpc: '2.0', id, result };
}

function mcpError(id: string | number, code: number, message: string): MCPResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ─── Worker 메인 ──────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Health check
    if (request.method === 'GET' && new URL(request.url).pathname === '/health') {
      return new Response(
        JSON.stringify({ status: 'ok', server: 'mcp-dev-hub', version: '1.0.0' }),
        {
          headers: corsHeaders(),
        }
      );
    }

    // MCP endpoint만 허용
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: corsHeaders(),
      });
    }

    // 인증
    if (!authenticate(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders(),
      });
    }

    let body: MCPRequest;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify(mcpError(0, -32700, 'Parse error')), {
        status: 400,
        headers: corsHeaders(),
      });
    }

    const { id, method, params } = body;

    try {
      let result: unknown;

      // ── MCP 프로토콜 핸들러 ──────────────────────────────────
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'mcp-dev-hub', version: '1.0.0' },
          };
          break;

        case 'tools/list':
          result = { tools };
          break;

        case 'tools/call': {
          const toolName = (params as { name: string; arguments: Record<string, unknown> }).name;
          const toolArgs =
            (params as { name: string; arguments: Record<string, unknown> }).arguments ?? {};
          result = await handleTool(toolName, toolArgs, env.DB);
          break;
        }

        default:
          return new Response(JSON.stringify(mcpError(id, -32601, `Method not found: ${method}`)), {
            status: 404,
            headers: corsHeaders(),
          });
      }

      return new Response(JSON.stringify(mcpResponse(id, result)), {
        headers: corsHeaders(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal Server Error';
      return new Response(JSON.stringify(mcpError(id, -32603, message)), {
        status: 500,
        headers: corsHeaders(),
      });
    }
  },
};
