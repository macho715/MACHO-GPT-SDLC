import { ok, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const stateTools = [
  {
    name: 'get_state',
    description: 'AI 에이전트 현재 상태 조회.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax', 'all'] },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_state',
    description: '내 작업 상태를 업데이트합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'status'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        status: {
          type: 'string',
          enum: ['idle', 'working', 'blocked', 'review', 'discussing', 'retro', 'done'],
        },
        task_id: { type: 'string' },
        task_title: { type: 'string' },
        session_id: { type: 'string' },
        current_file: { type: 'string' },
        progress: { type: 'number', minimum: 0, maximum: 100 },
        note: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
] satisfies ToolDefinition[];

export async function getState(args: Record<string, unknown>, db: D1Database): Promise<ToolResult> {
  const agent = (args.agent as string) ?? 'all';
  const rows =
    agent === 'all'
      ? await db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all()
      : await db.prepare('SELECT * FROM ai_state WHERE agent=?').bind(agent).all();
  return ok({ agents: rows.results });
}

export async function updateState(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { agent, status, task_id, task_title, session_id, current_file, progress, note } =
    args as Record<string, string | number>;
  await db
    .prepare(
      `
          INSERT INTO ai_state (agent,status,task_id,task_title,session_id,current_file,progress,note,updated_at)
          VALUES (?,?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(agent) DO UPDATE SET
            status=excluded.status,
            task_id=COALESCE(excluded.task_id,task_id),
            task_title=COALESCE(excluded.task_title,task_title),
            session_id=COALESCE(excluded.session_id,session_id),
            current_file=COALESCE(excluded.current_file,current_file),
            progress=COALESCE(excluded.progress,progress),
            note=COALESCE(excluded.note,note),
            updated_at=excluded.updated_at
        `
    )
    .bind(
      agent,
      status,
      task_id ?? null,
      task_title ?? null,
      session_id ?? null,
      current_file ?? null,
      progress ?? 0,
      note ?? null
    )
    .run();
  return ok({ success: true, agent, status });
}

export const stateHandlers = {
  get_state: getState,
  update_state: updateState,
} satisfies Record<string, ToolHandler>;
