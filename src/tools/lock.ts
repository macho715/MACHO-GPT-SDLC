import { ok, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const lockTools = [
  {
    name: 'lock_task',
    description: '태스크 잠금.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'agent'],
      properties: {
        task_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        ttl_minutes: { type: 'number', default: 30 },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'unlock_task',
    description: '태스크 잠금 해제.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'agent'],
      properties: {
        task_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
] satisfies ToolDefinition[];

export async function lockTask(args: Record<string, unknown>, db: D1Database): Promise<ToolResult> {
  const { task_id, agent } = args as Record<string, string>;
  const ttl = (args.ttl_minutes as number) ?? 30;
  const ex = await db
    .prepare(`SELECT locked_by FROM task_lock WHERE task_id=? AND expires_at>datetime('now')`)
    .bind(task_id)
    .first<{ locked_by: string }>();
  if (ex && ex.locked_by !== agent) {
    return ok({ locked: true, locked_by: ex.locked_by, acquired: false });
  }
  await db
    .prepare(
      `INSERT OR REPLACE INTO task_lock (task_id,locked_by,locked_at,expires_at) VALUES (?,?,datetime('now'),datetime('now','+'||?||' minutes'))`
    )
    .bind(task_id, agent, ttl)
    .run();
  return ok({ locked: false, acquired: true, task_id, agent });
}

export async function unlockTask(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { task_id, agent } = args as Record<string, string>;
  await db
    .prepare(`DELETE FROM task_lock WHERE task_id=? AND locked_by=?`)
    .bind(task_id, agent)
    .run();
  return ok({ success: true, task_id });
}

export const lockHandlers = {
  lock_task: lockTask,
  unlock_task: unlockTask,
} satisfies Record<string, ToolHandler>;
