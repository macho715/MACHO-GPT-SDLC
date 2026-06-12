import { ok, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const eventTools = [
  {
    name: 'broadcast_event',
    description: '전체 AI에게 알림 브로드캐스트.',
    inputSchema: {
      type: 'object',
      required: ['event_type', 'agent', 'message'],
      properties: {
        event_type: {
          type: 'string',
          enum: [
            'alert',
            'info',
            'warning',
            'state_change',
            'task_update',
            'discussion',
            'session',
          ],
        },
        agent: { type: 'string' },
        task_id: { type: 'string' },
        thread_id: { type: 'string' },
        session_id: { type: 'string' },
        message: { type: 'string' },
        payload: { type: 'object' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_events',
    description: '이벤트 로그 조회.',
    inputSchema: {
      type: 'object',
      properties: {
        event_type: { type: 'string', default: 'all' },
        agent: { type: 'string', default: 'all' },
        session_id: { type: 'string' },
        limit: { type: 'number', default: 30 },
      },
    },
    annotations: { readOnlyHint: true },
  },
] satisfies ToolDefinition[];

export async function broadcastEvent(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { event_type, agent, task_id, thread_id, session_id, message, payload } = args as Record<
    string,
    unknown
  >;
  await db
    .prepare(
      `INSERT INTO event_log (event_type,agent,task_id,thread_id,session_id,payload) VALUES (?,?,?,?,?,?)`
    )
    .bind(
      event_type,
      agent,
      task_id ?? null,
      thread_id ?? null,
      session_id ?? null,
      JSON.stringify({ message, ...((payload as object) ?? {}) })
    )
    .run();
  return ok({ success: true });
}

export async function getEvents(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { event_type, agent, session_id, limit } = args as Record<string, string | number>;
  let q = 'SELECT * FROM event_log WHERE 1=1';
  const b: (string | number)[] = [];
  if (event_type && event_type !== 'all') {
    q += ' AND event_type=?';
    b.push(event_type as string);
  }
  if (agent && agent !== 'all') {
    q += ' AND agent=?';
    b.push(agent as string);
  }
  if (session_id) {
    q += ' AND session_id=?';
    b.push(session_id as string);
  }
  q += ' ORDER BY created_at DESC LIMIT ?';
  b.push((limit as number) ?? 30);
  const rows = await db
    .prepare(q)
    .bind(...b)
    .all();
  return ok({ events: rows.results });
}

export const eventHandlers = {
  broadcast_event: broadcastEvent,
  get_events: getEvents,
} satisfies Record<string, ToolHandler>;
