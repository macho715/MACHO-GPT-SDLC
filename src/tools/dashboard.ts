import { buildDashboardData } from '../dashboard/data';
import { ok, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const dashboardTools = [
  {
    name: 'get_dashboard',
    description: '전체 상태 스냅샷 — 활성 세션·태스크·토론·투표·대기 핸드오프 한 번에 조회.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
] satisfies ToolDefinition[];

export async function getDashboard(
  _args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  return ok(await buildDashboardData(db));
}

export const dashboardHandlers = {
  get_dashboard: getDashboard,
} satisfies Record<string, ToolHandler>;
