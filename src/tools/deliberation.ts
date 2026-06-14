import {
  ok,
  fail,
  nextId,
  type ToolDefinition,
  type ToolHandler,
  type ToolResult,
} from '../lib/mcp';

type AgentName = 'codex' | 'claude' | 'opencode' | 'hermes';
type Strategy = 'consensus_first' | 'vote_if_split' | 'vote_only';

const AGENTS = ['codex', 'claude', 'opencode', 'hermes'] as const;

export const deliberationTools = [
  {
    name: 'run_deliberation',
    description:
      '단일 호출로 다중 에이전트 토론 스레드를 시작하거나 진행 상태를 판정합니다.',
    inputSchema: {
      type: 'object',
      required: ['participants', 'initiated_by', 'question'],
      properties: {
        thread_id: { type: 'string' },
        task_id: { type: 'string' },
        session_id: { type: 'string' },
        title: { type: 'string' },
        question: { type: 'string' },
        participants: {
          type: 'array',
          items: { type: 'string', enum: AGENTS },
          minItems: 2,
        },
        initiated_by: { type: 'string', enum: AGENTS },
        strategy: {
          type: 'string',
          enum: ['consensus_first', 'vote_if_split', 'vote_only'],
          default: 'consensus_first',
        },
        consensus_threshold: { type: 'number', default: 0.75, minimum: 0, maximum: 1 },
        max_rounds: { type: 'number', default: 2, minimum: 1 },
        vote_options: { type: 'array', items: { type: 'string' }, minItems: 2 },
        create_vote: { type: 'boolean', default: false },
        consensus_summary: { type: 'string' },
        action_items: { type: 'array', items: { type: 'string' } },
      },
    },
    annotations: { readOnlyHint: false },
  },
] satisfies ToolDefinition[];

const uniqueAgents = (value: unknown): AgentName[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value)].filter((agent): agent is AgentName =>
    (AGENTS as readonly string[]).includes(String(agent))
  );
};

const toNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

async function openDeliberation(
  args: Record<string, unknown>,
  db: D1Database,
  participants: AgentName[],
  initiatedBy: AgentName
): Promise<ToolResult> {
  const taskId = args.task_id as string | undefined;
  const title = args.title as string | undefined;
  const question = args.question as string;

  if (!taskId) {
    return fail('task_id is required when opening a new deliberation');
  }

  if (!title) {
    return fail('title is required when opening a new deliberation');
  }

  const threadId = await nextId(db, 'discussion_thread', 'DISC');
  await db
    .prepare(
      `INSERT INTO discussion_thread (id,task_id,session_id,title,topic,initiated_by) VALUES (?,?,?,?,?,?)`
    )
    .bind(threadId, taskId, (args.session_id as string | undefined) ?? null, title, question, initiatedBy)
    .run();
  await db
    .prepare(`INSERT INTO discussion_message (thread_id,agent,role,content) VALUES (?,?,?,?)`)
    .bind(threadId, initiatedBy, 'propose', question)
    .run();

  for (const agent of participants.filter((participant) => participant !== initiatedBy)) {
    await db
      .prepare(
        `INSERT INTO event_log (event_type,agent,task_id,thread_id,session_id,payload) VALUES ('discussion',?,?,?,?,?)`
      )
      .bind(
        agent,
        taskId,
        threadId,
        (args.session_id as string | undefined) ?? null,
        JSON.stringify({ action: 'deliberation_invited', thread: threadId, title, from: initiatedBy })
      )
      .run();
  }

  return ok({
    success: true,
    thread_id: threadId,
    status: 'opened',
    summary: `Deliberation opened for ${participants.length} participants.`,
    required_responses: participants.filter((participant) => participant !== initiatedBy),
    next_actions: participants
      .filter((participant) => participant !== initiatedBy)
      .map((agent) => `${agent} should post an agree, disagree, question, or clarify message.`),
  });
}

export async function runDeliberation(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const participants = uniqueAgents(args.participants);
  const initiatedBy = args.initiated_by as AgentName;
  const question = args.question as string | undefined;

  if (participants.length < 2) {
    return fail('participants must include at least two valid agents');
  }

  if (!(AGENTS as readonly string[]).includes(initiatedBy)) {
    return fail('initiated_by must be a valid agent');
  }

  if (!question) {
    return fail('question is required');
  }

  if (!args.thread_id) {
    return openDeliberation(args, db, participants, initiatedBy);
  }

  const threadId = args.thread_id as string;
  const strategy = (args.strategy as Strategy | undefined) ?? 'consensus_first';
  const threshold = toNumber(args.consensus_threshold, 0.75);
  const actionItems = toStringArray(args.action_items);
  const thread = await db
    .prepare('SELECT * FROM discussion_thread WHERE id=?')
    .bind(threadId)
    .first<Record<string, unknown>>();

  if (!thread) {
    return fail(`Thread not found: ${threadId}`);
  }

  const messages = await db
    .prepare('SELECT agent,role,content FROM discussion_message WHERE thread_id=? ORDER BY created_at ASC')
    .bind(threadId)
    .all<Record<string, unknown>>();

  const byAgent: Record<string, string[]> = {};
  for (const message of messages.results as Array<Record<string, unknown>>) {
    const agent = message.agent as string;
    if (!participants.includes(agent as AgentName)) {
      continue;
    }
    byAgent[agent] = byAgent[agent] ?? [];
    byAgent[agent].push(message.role as string);
  }

  const responded = participants.filter((agent) => byAgent[agent]?.length);
  const agreed = participants.filter((agent) =>
    byAgent[agent]?.some((role) => role === 'agree' || role === 'decide')
  );
  const disagreed = participants.filter((agent) => byAgent[agent]?.includes('disagree'));
  const requiredResponses = participants.filter((agent) => !responded.includes(agent));
  const agreeRate = participants.length > 0 ? agreed.length / participants.length : 0;
  const consensusReached = agreeRate >= threshold && disagreed.length === 0;

  if (consensusReached && strategy !== 'vote_only') {
    const summary =
      (args.consensus_summary as string | undefined) ??
      `Consensus reached by ${agreed.length}/${participants.length} participants.`;
    await db
      .prepare(
        `UPDATE discussion_thread SET status='consensus',consensus=?,consensus_at=datetime('now'),updated_at=datetime('now') WHERE id=?`
      )
      .bind(summary, threadId)
      .run();
    await db
      .prepare(
        `INSERT INTO consensus_log (thread_id,agreed_by,disagreed_by,summary,action_items) VALUES (?,?,?,?,?)`
      )
      .bind(
        threadId,
        JSON.stringify(agreed),
        JSON.stringify(disagreed),
        summary,
        JSON.stringify(actionItems)
      )
      .run();

    return ok({
      success: true,
      thread_id: threadId,
      status: 'consensus_reached',
      summary,
      required_responses: requiredResponses,
      next_actions: actionItems,
      agreed,
      disagreed,
      agree_rate: Math.round(agreeRate * 100) + '%',
    });
  }

  const shouldVote =
    strategy === 'vote_only' || (strategy === 'vote_if_split' && disagreed.length > 0);
  if (shouldVote) {
    const voteOptions = toStringArray(args.vote_options);
    if (args.create_vote === true) {
      if (voteOptions.length < 2) {
        return fail('vote_options must include at least two options when create_vote is true');
      }

      const vote = await db
        .prepare(
          `INSERT INTO vote (thread_id,session_id,question,options,created_by,closes_at) VALUES (?,?,?,?,?,datetime('now','+60 minutes'))`
        )
        .bind(
          threadId,
          (thread.session_id as string | undefined) ?? null,
          question,
          JSON.stringify(voteOptions),
          initiatedBy
        )
        .run();
      await db
        .prepare(`UPDATE discussion_thread SET status='voting',updated_at=datetime('now') WHERE id=?`)
        .bind(threadId)
        .run();

      return ok({
        success: true,
        thread_id: threadId,
        status: 'vote_created',
        vote_id: vote.meta.last_row_id,
        summary: 'Consensus was not reached; vote created.',
        required_responses: requiredResponses,
        next_actions: ['cast_vote for each participant'],
        agreed,
        disagreed,
      });
    }

    return ok({
      success: true,
      thread_id: threadId,
      status: 'vote_recommended',
      summary: 'Consensus was not reached; vote is recommended.',
      required_responses: requiredResponses,
      next_actions: ['Call run_deliberation with create_vote=true and vote_options.'],
      agreed,
      disagreed,
    });
  }

  return ok({
    success: true,
    thread_id: threadId,
    status: 'waiting_for_responses',
    summary: `Waiting for ${requiredResponses.length} participant response(s).`,
    required_responses: requiredResponses,
    next_actions:
      requiredResponses.length > 0
        ? requiredResponses.map((agent) => `${agent} should post a response.`)
        : ['Consensus threshold not met; request clarification or switch strategy to vote_if_split.'],
    agreed,
    disagreed,
    agree_rate: Math.round(agreeRate * 100) + '%',
  });
}

export const deliberationHandlers = {
  run_deliberation: runDeliberation,
} satisfies Record<string, ToolHandler>;
