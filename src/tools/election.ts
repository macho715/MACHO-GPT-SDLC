import {
  ok,
  fail,
  nextId,
  type ToolDefinition,
  type ToolHandler,
  type ToolResult,
} from '../lib/mcp';

export const electionTools = [
  {
    name: 'start_election',
    description:
      '다음 세션 리더를 선출하는 선거를 시작합니다. finalize_retro 후 자동 호출되거나 수동으로 시작할 수 있습니다.',
    inputSchema: {
      type: 'object',
      required: ['session_id'],
      properties: {
        session_id: { type: 'string', description: '종료된 세션 ID' },
        nominees: {
          type: 'array',
          items: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
          description: '후보 목록. 생략 시 전체 AI가 후보.',
        },
        ttl_minutes: { type: 'number', default: 30, description: '투표 마감 시간' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'cast_election_vote',
    description: '리더 선출 투표를 합니다. AI당 1표, 자기 자신에게도 투표 가능합니다.',
    inputSchema: {
      type: 'object',
      required: ['election_id', 'agent', 'nominee'],
      properties: {
        election_id: { type: 'number', description: '선거 ID' },
        agent: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'hermes'],
          description: '투표하는 AI',
        },
        nominee: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'hermes'],
          description: '지지하는 후보',
        },
        reason: { type: 'string', description: '지지 이유 (권장)' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_election_result',
    description: '선거 현황과 결과를 조회합니다. 전원 투표 완료 시 자동 마감 및 다음 세션 생성.',
    inputSchema: {
      type: 'object',
      required: ['election_id'],
      properties: {
        election_id: { type: 'number' },
        auto_start_next: {
          type: 'boolean',
          default: true,
          description: '전원 투표 시 다음 세션 자동 시작',
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
] satisfies ToolDefinition[];

export async function startElection(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { session_id } = args as Record<string, string>;
  const nominees = (args.nominees as string[]) ?? ['codex', 'claude', 'opencode', 'hermes'];
  const ttl = (args.ttl_minutes as number) ?? 30;

  const result = await db
    .prepare(
      `
          INSERT INTO leader_election (session_id, status)
          VALUES (?, 'open')
        `
    )
    .bind(session_id)
    .run();

  const electionId = result.meta.last_row_id;

  // vote 테이블에도 기록 (일관성)
  await db
    .prepare(
      `
          INSERT INTO vote (session_id,vote_type,question,options,created_by,closes_at)
          VALUES (?,'leader_election',?,?,?,datetime('now','+'||?||' minutes'))
        `
    )
    .bind(session_id, '다음 세션 리더 선출', JSON.stringify(nominees), 'system', ttl)
    .run();

  await db
    .prepare(`INSERT INTO event_log (event_type,session_id,payload) VALUES ('session',?,?)`)
    .bind(
      session_id,
      JSON.stringify({ action: 'election_started', election_id: electionId, nominees })
    )
    .run();

  return ok({
    success: true,
    election_id: electionId,
    nominees,
    ttl_minutes: ttl,
    message: `선거 시작. 모든 AI는 cast_election_vote를 호출하세요. election_id: ${electionId}`,
  });
}

export async function castElectionVote(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { election_id, agent, nominee, reason } = args as Record<string, string | number>;

  const existing = await db
    .prepare('SELECT id FROM election_ballot WHERE election_id=? AND agent=?')
    .bind(election_id, agent)
    .first();
  if (existing) {
    return fail(`${agent}는 이미 투표했습니다.`);
  }

  await db
    .prepare(`INSERT INTO election_ballot (election_id,agent,nominee,reason) VALUES (?,?,?,?)`)
    .bind(election_id, agent, nominee, reason ?? null)
    .run();

  const count = await db
    .prepare('SELECT COUNT(*) as c FROM election_ballot WHERE election_id=?')
    .bind(election_id)
    .first<{ c: number }>();

  await db
    .prepare(`INSERT INTO event_log (event_type,agent,payload) VALUES ('session',?,?)`)
    .bind(agent, JSON.stringify({ action: 'election_voted', election_id, nominee }))
    .run();

  return ok({
    success: true,
    agent,
    nominee,
    vote_count: count?.c ?? 1,
    message:
      (count?.c ?? 1) >= 4
        ? '전원 투표 완료 → get_election_result 호출하세요.'
        : `${4 - (count?.c ?? 1)}명 투표 대기 중.`,
  });
}

export async function getElectionResult(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const election_id = args.election_id as number;
  const auto_start = args.auto_start_next !== false;

  const ballots = await db
    .prepare('SELECT * FROM election_ballot WHERE election_id=?')
    .bind(election_id)
    .all();
  const election = await db
    .prepare('SELECT * FROM leader_election WHERE id=?')
    .bind(election_id)
    .first<Record<string, unknown>>();
  if (!election) {
    return fail(`Election not found: ${election_id}`);
  }

  // 집계
  const tally: Record<string, number> = {};
  for (const b of ballots.results as Array<Record<string, unknown>>) {
    const n = b.nominee as string;
    tally[n] = (tally[n] ?? 0) + 1;
  }

  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const winner = sorted[0]?.[0] ?? null;
  const isTie = sorted.length >= 2 && sorted[0][1] === sorted[1][1];

  // 전원 투표 + 마감
  const allVoted = ballots.results.length >= 4;

  if (allVoted && election.status === 'open') {
    await db
      .prepare(
        `UPDATE leader_election SET status='closed', winner=?, total_votes=?, closed_at=datetime('now') WHERE id=?`
      )
      .bind(winner, ballots.results.length, election_id)
      .run();

    // 현재 세션 닫기
    await db
      .prepare(`UPDATE session SET status='closed' WHERE id=?`)
      .bind(election.session_id)
      .run();

    // ★ 다음 세션 자동 생성
    let nextSessionId: string | null = null;
    if (auto_start && winner && !isTie) {
      nextSessionId = await nextId(db, 'session', 'SESS');
      const prevNum = parseInt((election.session_id as string).replace('SESS-', '')) || 1;
      const nextTitle = `Session ${String(prevNum + 1).padStart(3, '0')}`;

      await db
        .prepare(`INSERT INTO session (id,title,leader,goals) VALUES (?,?,?,?)`)
        .bind(
          nextSessionId,
          nextTitle,
          winner,
          JSON.stringify(['이전 세션 회고 반영', '리더 주도 목표 설정'])
        )
        .run();

      await db
        .prepare(`UPDATE leader_election SET next_session_id=? WHERE id=?`)
        .bind(nextSessionId, election_id)
        .run();
      await db
        .prepare(`UPDATE session SET next_session_id=? WHERE id=?`)
        .bind(nextSessionId, election.session_id)
        .run();

      // 당선자 상태 업데이트
      await db
        .prepare(
          `UPDATE ai_state SET status='working', session_id=?, updated_at=datetime('now') WHERE agent=?`
        )
        .bind(nextSessionId, winner)
        .run();

      // 나머지 AI 상태 idle
      await db
        .prepare(`UPDATE ai_state SET status='idle', updated_at=datetime('now') WHERE agent!=?`)
        .bind(winner)
        .run();
    }

    await db
      .prepare(`INSERT INTO event_log (event_type,session_id,payload) VALUES ('session',?,?)`)
      .bind(
        election.session_id,
        JSON.stringify({ action: 'election_closed', winner, tally, next_session: nextSessionId })
      )
      .run();
  }

  return ok({
    election_id,
    tally,
    winner: isTie ? null : winner,
    is_tie: isTie,
    tie_candidates: isTie ? sorted.filter(([, v]) => v === sorted[0][1]).map(([k]) => k) : [],
    total_votes: ballots.results.length,
    ballots: ballots.results,
    is_final: allVoted,
    next_session_id: election.next_session_id ?? null,
    message: isTie
      ? `동률 (${sorted
          .filter(([, v]) => v === sorted[0][1])
          .map(([k]) => k)
          .join(' vs ')}) — 재투표 또는 human 결정 필요`
      : winner
        ? `🏆 선출된 다음 세션 리더: ${winner}`
        : '투표 진행 중...',
  });
}

export const electionHandlers = {
  start_election: startElection,
  cast_election_vote: castElectionVote,
  get_election_result: getElectionResult,
} satisfies Record<string, ToolHandler>;
