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
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const [agents, activeSess, tasks, discussions, votes, handoffs, events] = await Promise.all([
    db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all(),
    db
      .prepare(
        "SELECT * FROM session WHERE status IN ('active','retro','voting') ORDER BY created_at DESC LIMIT 1"
      )
      .first(),
    db.prepare("SELECT * FROM tasks WHERE status!='done' ORDER BY created_at DESC LIMIT 10").all(),
    db
      .prepare(
        "SELECT * FROM discussion_thread WHERE status IN ('open','voting') ORDER BY updated_at DESC LIMIT 5"
      )
      .all(),
    db
      .prepare(
        "SELECT v.*,COUNT(b.id) as ballot_count FROM vote v LEFT JOIN vote_ballot b ON v.id=b.vote_id WHERE v.status='open' GROUP BY v.id"
      )
      .all(),
    db
      .prepare("SELECT * FROM handoff_log WHERE status='pending' ORDER BY created_at DESC LIMIT 5")
      .all(),
    db.prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT 15').all(),
  ]);
  return ok({
    snapshot_at: new Date().toISOString(),
    active_session: activeSess ?? null,
    agents: agents.results,
    active_tasks: tasks.results,
    active_discussions: discussions.results,
    pending_votes: votes.results,
    pending_handoffs: handoffs.results,
    recent_events: events.results,
  });
}

export const dashboardHandlers = {
  get_dashboard: getDashboard,
} satisfies Record<string, ToolHandler>;
