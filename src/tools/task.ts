import { ok, nextId, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const taskTools = [
  {
    name: 'create_task',
    description: '태스크를 생성합니다.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'critical'],
          default: 'normal',
        },
        assigned_to: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        session_id: { type: 'string' },
        created_by: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_tasks',
    description: '태스크 목록 조회.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'review', 'done', 'blocked', 'all'],
          default: 'all',
        },
        assigned_to: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'minimax', 'all'],
          default: 'all',
        },
        session_id: { type: 'string' },
        limit: { type: 'number', default: 20 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_task',
    description: '태스크 상태/담당자 변경.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
        status: { type: 'string', enum: ['open', 'in_progress', 'review', 'done', 'blocked'] },
        assigned_to: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        priority: { type: 'string', enum: ['low', 'normal', 'high', 'critical'] },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
] satisfies ToolDefinition[];

export async function createTask(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const id = await nextId(db, 'tasks', 'TASK');
  const { title, description, priority, assigned_to, session_id, created_by } = args as Record<
    string,
    string
  >;
  await db
    .prepare(
      `INSERT INTO tasks (id,title,description,priority,assigned_to,session_id,created_by) VALUES (?,?,?,?,?,?,?)`
    )
    .bind(
      id,
      title,
      description ?? null,
      priority ?? 'normal',
      assigned_to ?? null,
      session_id ?? null,
      created_by ?? 'human'
    )
    .run();
  return ok({ success: true, task_id: id, title });
}

export async function listTasks(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const status = (args.status as string) ?? 'all',
    assigned = (args.assigned_to as string) ?? 'all';
  const session_id = args.session_id as string | undefined,
    limit = (args.limit as number) ?? 20;
  let q = 'SELECT * FROM tasks WHERE 1=1';
  const b: (string | number)[] = [];
  if (status !== 'all') {
    q += ' AND status=?';
    b.push(status);
  }
  if (assigned !== 'all') {
    q += ' AND assigned_to=?';
    b.push(assigned);
  }
  if (session_id) {
    q += ' AND session_id=?';
    b.push(session_id);
  }
  q += ' ORDER BY created_at DESC LIMIT ?';
  b.push(limit);
  const rows = await db
    .prepare(q)
    .bind(...b)
    .all();
  return ok({ tasks: rows.results, count: rows.results.length });
}

export async function updateTask(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { task_id, status, assigned_to, priority } = args as Record<string, string>;
  await db
    .prepare(
      `UPDATE tasks SET status=COALESCE(?,status),assigned_to=COALESCE(?,assigned_to),priority=COALESCE(?,priority),updated_at=datetime('now') WHERE id=?`
    )
    .bind(status ?? null, assigned_to ?? null, priority ?? null, task_id)
    .run();
  return ok({ success: true, task_id });
}

export const taskHandlers = {
  create_task: createTask,
  list_tasks: listTasks,
  update_task: updateTask,
} satisfies Record<string, ToolHandler>;
