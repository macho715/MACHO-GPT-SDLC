import { ok, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const handoffTools = [
  {
    name: 'log_handoff',
    description: 'AI 간 작업 인계.',
    inputSchema: {
      type: 'object',
      required: ['from_agent', 'to_agent', 'task_id', 'summary'],
      properties: {
        from_agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        to_agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        task_id: { type: 'string' },
        summary: { type: 'string' },
        changed_files: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        instructions: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_handoff',
    description: '내게 온 핸드오프 조회.',
    inputSchema: {
      type: 'object',
      required: ['agent'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        status: { type: 'string', enum: ['pending', 'acknowledged', 'all'], default: 'pending' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'ack_handoff',
    description: '핸드오프 수신 확인.',
    inputSchema: {
      type: 'object',
      required: ['handoff_id', 'agent'],
      properties: {
        handoff_id: { type: 'number' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        accepted: { type: 'boolean', default: true },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
] satisfies ToolDefinition[];

export async function logHandoff(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { from_agent, to_agent, task_id, summary, instructions } = args as Record<string, string>;
  const r = await db
    .prepare(
      `INSERT INTO handoff_log (from_agent,to_agent,task_id,summary,changed_files,risks,instructions) VALUES (?,?,?,?,?,?,?)`
    )
    .bind(
      from_agent,
      to_agent,
      task_id,
      summary,
      JSON.stringify(args.changed_files ?? []),
      JSON.stringify(args.risks ?? []),
      instructions ?? null
    )
    .run();
  await db
    .prepare(`UPDATE ai_state SET status='review',updated_at=datetime('now') WHERE agent=?`)
    .bind(to_agent)
    .run();
  return ok({ success: true, handoff_id: r.meta.last_row_id, to_agent });
}

export async function getHandoff(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { agent, status: hs } = args as Record<string, string>;
  const f = (hs ?? 'pending') === 'all' ? '%' : (hs ?? 'pending');
  const rows = await db
    .prepare(
      `SELECT * FROM handoff_log WHERE to_agent=? AND status LIKE ? ORDER BY created_at DESC`
    )
    .bind(agent, f)
    .all();
  return ok({ handoffs: rows.results });
}

export async function ackHandoff(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { handoff_id, agent, accepted } = args as Record<string, string | boolean | number>;
  const s = accepted !== false ? 'acknowledged' : 'rejected';
  await db
    .prepare(`UPDATE handoff_log SET status=? WHERE id=? AND to_agent=?`)
    .bind(s, handoff_id, agent)
    .run();
  return ok({ success: true, handoff_id, status: s });
}

export const handoffHandlers = {
  log_handoff: logHandoff,
  get_handoff: getHandoff,
  ack_handoff: ackHandoff,
} satisfies Record<string, ToolHandler>;
