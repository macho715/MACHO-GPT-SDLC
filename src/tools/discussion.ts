import {
  ok,
  fail,
  nextId,
  type ToolDefinition,
  type ToolHandler,
  type ToolResult,
} from '../lib/mcp';

export const discussionTools = [
  {
    name: 'start_discussion',
    description: '이슈 토론 스레드를 시작합니다.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'title', 'initiated_by', 'opening_message'],
      properties: {
        task_id: { type: 'string' },
        session_id: { type: 'string' },
        title: { type: 'string' },
        topic: { type: 'string' },
        initiated_by: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        opening_message: { type: 'string' },
        invite_agents: { type: 'array', items: { type: 'string' } },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'post_message',
    description: '토론 스레드에 발언합니다.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'agent', 'role', 'content'],
      properties: {
        thread_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        role: {
          type: 'string',
          enum: ['propose', 'agree', 'disagree', 'question', 'clarify', 'summarize', 'decide'],
        },
        content: { type: 'string' },
        reply_to: { type: 'number' },
        evidence: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_discussion',
    description: '토론 스레드 전체 내용 조회.',
    inputSchema: {
      type: 'object',
      required: ['thread_id'],
      properties: {
        thread_id: { type: 'string' },
        limit: { type: 'number', default: 50 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'close_discussion',
    description: '토론 종료 + 합의 기록.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'agent', 'consensus_summary'],
      properties: {
        thread_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        consensus_summary: { type: 'string' },
        action_items: { type: 'array', items: { type: 'string' } },
        outcome: {
          type: 'string',
          enum: ['consensus', 'no_consensus', 'deferred'],
          default: 'consensus',
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'check_consensus',
    description: '토론 합의 달성 여부 분석.',
    inputSchema: {
      type: 'object',
      required: ['thread_id'],
      properties: {
        thread_id: { type: 'string' },
        threshold: { type: 'number', default: 0.75 },
      },
    },
    annotations: { readOnlyHint: true },
  },
] satisfies ToolDefinition[];

export async function startDiscussion(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { task_id, session_id, title, topic, initiated_by, opening_message } = args as Record<
    string,
    string
  >;
  const id = await nextId(db, 'discussion_thread', 'DISC');
  await db
    .prepare(
      `INSERT INTO discussion_thread (id,task_id,session_id,title,topic,initiated_by) VALUES (?,?,?,?,?,?)`
    )
    .bind(id, task_id, session_id ?? null, title, topic ?? null, initiated_by)
    .run();
  await db
    .prepare(`INSERT INTO discussion_message (thread_id,agent,role,content) VALUES (?,?,?,?)`)
    .bind(id, initiated_by, 'propose', opening_message)
    .run();
  await db
    .prepare(`UPDATE ai_state SET status='discussing',updated_at=datetime('now') WHERE agent=?`)
    .bind(initiated_by)
    .run();
  const invites = (args.invite_agents as string[]) ?? [];
  for (const a of invites) {
    await db
      .prepare(
        `INSERT INTO event_log (event_type,agent,task_id,thread_id,session_id,payload) VALUES ('discussion',?,?,?,?,?)`
      )
      .bind(
        a,
        task_id,
        id,
        session_id ?? null,
        JSON.stringify({ action: 'invited', thread: id, title, from: initiated_by })
      )
      .run();
  }
  return ok({ success: true, thread_id: id, title });
}

export async function postMessage(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { thread_id, agent, role, content, reply_to, confidence } = args as Record<
    string,
    string | number
  >;
  const evidence = JSON.stringify(args.evidence ?? []);
  const thread = await db
    .prepare('SELECT * FROM discussion_thread WHERE id=?')
    .bind(thread_id)
    .first();
  if (!thread) {
    return fail(`Thread not found: ${thread_id}`);
  }
  const r = await db
    .prepare(
      `INSERT INTO discussion_message (thread_id,agent,role,content,reply_to,evidence,confidence) VALUES (?,?,?,?,?,?,?)`
    )
    .bind(thread_id, agent, role, content, reply_to ?? null, evidence, confidence ?? 0.8)
    .run();
  await db
    .prepare(`UPDATE discussion_thread SET updated_at=datetime('now') WHERE id=?`)
    .bind(thread_id)
    .run();
  return ok({ success: true, message_id: r.meta.last_row_id, thread_id, agent, role });
}

export async function getDiscussion(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { thread_id, limit } = args as Record<string, string | number>;
  const thread = await db
    .prepare('SELECT * FROM discussion_thread WHERE id=?')
    .bind(thread_id)
    .first();
  if (!thread) {
    return fail(`Thread not found: ${thread_id}`);
  }
  const msgs = await db
    .prepare('SELECT * FROM discussion_message WHERE thread_id=? ORDER BY created_at ASC LIMIT ?')
    .bind(thread_id, (limit as number) ?? 50)
    .all();
  return ok({
    thread,
    messages: msgs.results.map((m: Record<string, unknown>) => ({
      ...m,
      evidence: JSON.parse((m.evidence as string) ?? '[]'),
    })),
  });
}

export async function closeDiscussion(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { thread_id, consensus_summary, outcome } = args as Record<string, string>;
  const action_items = (args.action_items as string[]) ?? [];
  const participants = await db
    .prepare('SELECT DISTINCT agent FROM discussion_message WHERE thread_id=?')
    .bind(thread_id)
    .all();
  const agreed = participants.results.map((r: Record<string, unknown>) => r.agent as string);
  await db
    .prepare(
      `UPDATE discussion_thread SET status=?,consensus=?,consensus_at=datetime('now'),updated_at=datetime('now') WHERE id=?`
    )
    .bind(outcome === 'consensus' ? 'consensus' : 'closed', consensus_summary, thread_id)
    .run();
  await db
    .prepare(
      `INSERT INTO consensus_log (thread_id,agreed_by,summary,action_items) VALUES (?,?,?,?)`
    )
    .bind(thread_id, JSON.stringify(agreed), consensus_summary, JSON.stringify(action_items))
    .run();
  return ok({ success: true, thread_id, outcome, consensus: consensus_summary, action_items });
}

export async function checkConsensus(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { thread_id, threshold } = args as Record<string, string | number>;
  const msgs = await db
    .prepare('SELECT agent,role FROM discussion_message WHERE thread_id=?')
    .bind(thread_id)
    .all();
  const ar: { [k: string]: string[] } = {};
  for (const m of msgs.results as Array<Record<string, unknown>>) {
    const a = m.agent as string;
    if (!ar[a]) {
      ar[a] = [];
    }
    ar[a].push(m.role as string);
  }
  const parts = Object.keys(ar);
  const agreed = parts.filter((a) => ar[a].includes('agree') || ar[a].includes('decide'));
  const disagreed = parts.filter((a) => ar[a].includes('disagree'));
  const pending = parts.filter(
    (a) => !ar[a].includes('agree') && !ar[a].includes('disagree') && !ar[a].includes('decide')
  );
  const rate = parts.length > 0 ? agreed.length / parts.length : 0;
  const thr = (threshold as number) ?? 0.75;
  return ok({
    thread_id,
    agreed,
    disagreed,
    pending,
    agree_rate: Math.round(rate * 100) + '%',
    consensus_reached: rate >= thr && disagreed.length === 0,
    recommendation:
      rate >= thr && disagreed.length === 0
        ? 'close_discussion 호출'
        : disagreed.length > 0
          ? 'create_vote 호출'
          : 'pending AI 발언 대기',
  });
}

export const discussionHandlers = {
  start_discussion: startDiscussion,
  post_message: postMessage,
  get_discussion: getDiscussion,
  close_discussion: closeDiscussion,
  check_consensus: checkConsensus,
} satisfies Record<string, ToolHandler>;
