import { ok, fail, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const voteTools = [
  {
    name: 'create_vote',
    description: '의견 충돌 시 투표를 생성합니다.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'question', 'options', 'created_by'],
      properties: {
        thread_id: { type: 'string' },
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2 },
        created_by: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        ttl_minutes: { type: 'number', default: 60 },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'cast_vote',
    description: '투표 참여 (AI당 1표).',
    inputSchema: {
      type: 'object',
      required: ['vote_id', 'agent', 'choice'],
      properties: {
        vote_id: { type: 'number' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        choice: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_vote_result',
    description: '투표 현황 및 결과 조회.',
    inputSchema: {
      type: 'object',
      required: ['vote_id'],
      properties: {
        vote_id: { type: 'number' },
        close_if_all: { type: 'boolean', default: true },
      },
    },
    annotations: { readOnlyHint: false },
  },
] satisfies ToolDefinition[];

export async function createVote(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { thread_id, question, created_by } = args as Record<string, string>;
  const ttl = (args.ttl_minutes as number) ?? 60;
  const r = await db
    .prepare(
      `INSERT INTO vote (thread_id,question,options,created_by,closes_at) VALUES (?,?,?,?,datetime('now','+'||?||' minutes'))`
    )
    .bind(thread_id, question, JSON.stringify(args.options ?? []), created_by, ttl)
    .run();
  await db
    .prepare(`UPDATE discussion_thread SET status='voting',updated_at=datetime('now') WHERE id=?`)
    .bind(thread_id)
    .run();
  return ok({ success: true, vote_id: r.meta.last_row_id, question });
}

export async function castVote(args: Record<string, unknown>, db: D1Database): Promise<ToolResult> {
  const { vote_id, agent, choice, reason } = args as Record<string, string | number>;
  const ex = await db
    .prepare('SELECT id FROM vote_ballot WHERE vote_id=? AND agent=?')
    .bind(vote_id, agent)
    .first();
  if (ex) {
    return fail(`${agent} already voted`);
  }
  const v = await db
    .prepare('SELECT options FROM vote WHERE id=?')
    .bind(vote_id)
    .first<{ options: string }>();
  if (!v) {
    return fail(`Vote not found: ${vote_id}`);
  }
  const opts = JSON.parse(v.options);
  if (!opts.includes(choice)) {
    return fail(`Invalid choice. Valid: ${opts.join(', ')}`);
  }
  await db
    .prepare(`INSERT INTO vote_ballot (vote_id,agent,choice,reason) VALUES (?,?,?,?)`)
    .bind(vote_id, agent, choice, reason ?? null)
    .run();
  return ok({ success: true, vote_id, agent, choice });
}

export async function getVoteResult(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const vote_id = args.vote_id as number;
  const v = await db
    .prepare('SELECT * FROM vote WHERE id=?')
    .bind(vote_id)
    .first<Record<string, unknown>>();
  if (!v) {
    return fail(`Vote not found: ${vote_id}`);
  }
  const ballots = await db.prepare('SELECT * FROM vote_ballot WHERE vote_id=?').bind(vote_id).all();
  const opts = JSON.parse(v.options as string);
  const tally: Record<string, number> = {};
  for (const o of opts) {
    tally[o] = 0;
  }
  for (const b of ballots.results as Array<Record<string, unknown>>) {
    tally[b.choice as string] = (tally[b.choice as string] ?? 0) + 1;
  }
  const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  const allVoted = ballots.results.length >= 4;
  if (args.close_if_all !== false && allVoted && v.status === 'open') {
    await db
      .prepare(`UPDATE vote SET status='closed',result=? WHERE id=?`)
      .bind(winner[0], vote_id)
      .run();
  }
  return ok({
    vote_id,
    question: v.question,
    tally,
    winner: winner[0],
    total_votes: ballots.results.length,
    is_final: allVoted,
  });
}

export const voteHandlers = {
  create_vote: createVote,
  cast_vote: castVote,
  get_vote_result: getVoteResult,
} satisfies Record<string, ToolHandler>;
