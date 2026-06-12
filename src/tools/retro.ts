import { ok, fail, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const retroTools = [
  {
    name: 'submit_retro',
    description: [
      '세션 회고를 제출합니다. 세션 종료 후 모든 AI가 반드시 한 번씩 호출해야 합니다.',
      '잘된 점 / 못된 점 / 개선 제안 / MVP 투표를 포함하세요.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['session_id', 'agent', 'went_well', 'went_wrong'],
      properties: {
        session_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        went_well: {
          type: 'array',
          items: { type: 'string' },
          description: '잘된 점 목록 (최소 1개)',
          minItems: 1,
        },
        went_wrong: {
          type: 'array',
          items: { type: 'string' },
          description: '못된 점 / 개선 필요 사항 목록',
          minItems: 1,
        },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
          description: '다음 세션을 위한 제안',
        },
        highlight: { type: 'string', description: '이 세션의 핵심 성과 한 줄 요약' },
        mvp_vote: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'minimax'],
          description: '이 세션에서 가장 기여한 AI (자기 자신 제외 권장)',
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_retro',
    description: '세션 회고 내용을 조회합니다. 전체 리뷰 + 집계 요약을 반환합니다.',
    inputSchema: {
      type: 'object',
      required: ['session_id'],
      properties: {
        session_id: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'finalize_retro',
    description: [
      '모든 AI의 회고가 제출된 후 집계를 완료합니다.',
      '잘된 점/못된 점 상위 항목과 MVP를 자동 산출하고 리더 선거를 시작합니다.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['session_id'],
      properties: {
        session_id: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
] satisfies ToolDefinition[];

export async function submitRetro(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { session_id, agent, highlight, mvp_vote } = args as Record<string, string>;
  const went_well = JSON.stringify(args.went_well ?? []);
  const went_wrong = JSON.stringify(args.went_wrong ?? []);
  const suggestions = JSON.stringify(args.suggestions ?? []);

  // 중복 제출 방지
  const existing = await db
    .prepare('SELECT id FROM retro_review WHERE session_id=? AND agent=?')
    .bind(session_id, agent)
    .first();
  if (existing) {
    return fail(`${agent} already submitted retro for ${session_id}`);
  }

  await db
    .prepare(
      `
          INSERT INTO retro_review (session_id,agent,went_well,went_wrong,suggestions,highlight,mvp_vote)
          VALUES (?,?,?,?,?,?,?)
        `
    )
    .bind(
      session_id,
      agent,
      went_well,
      went_wrong,
      suggestions,
      highlight ?? null,
      mvp_vote ?? null
    )
    .run();

  // 제출 현황 확인
  const submitted = await db
    .prepare('SELECT COUNT(*) as c FROM retro_review WHERE session_id=?')
    .bind(session_id)
    .first<{ c: number }>();
  const submittedCount = submitted?.c ?? 0;

  await db
    .prepare(`INSERT INTO event_log (event_type,agent,session_id,payload) VALUES ('session',?,?,?)`)
    .bind(
      agent,
      session_id,
      JSON.stringify({ action: 'retro_submitted', submitted: submittedCount, total: 4 })
    )
    .run();

  return ok({
    success: true,
    agent,
    session_id,
    submitted_count: submittedCount,
    total_agents: 4,
    all_submitted: submittedCount >= 4,
    message:
      submittedCount >= 4
        ? '전원 제출 완료 → finalize_retro 호출하세요.'
        : `${4 - submittedCount}개 AI 제출 대기 중.`,
  });
}

export async function getRetro(args: Record<string, unknown>, db: D1Database): Promise<ToolResult> {
  const { session_id } = args as Record<string, string>;

  const reviews = await db
    .prepare('SELECT * FROM retro_review WHERE session_id=? ORDER BY submitted_at ASC')
    .bind(session_id)
    .all();
  const summary = await db
    .prepare('SELECT * FROM retro_summary WHERE session_id=?')
    .bind(session_id)
    .first();
  const session = await db.prepare('SELECT * FROM session WHERE id=?').bind(session_id).first();

  const parsed = reviews.results.map((r: Record<string, unknown>) => ({
    ...r,
    went_well: JSON.parse((r.went_well as string) ?? '[]'),
    went_wrong: JSON.parse((r.went_wrong as string) ?? '[]'),
    suggestions: JSON.parse((r.suggestions as string) ?? '[]'),
  }));

  return ok({
    session,
    reviews: parsed,
    summary: summary
      ? {
          ...(summary as Record<string, unknown>),
          top_went_well: JSON.parse(
            ((summary as Record<string, unknown>).top_went_well as string) ?? '[]'
          ),
          top_went_wrong: JSON.parse(
            ((summary as Record<string, unknown>).top_went_wrong as string) ?? '[]'
          ),
          top_suggestions: JSON.parse(
            ((summary as Record<string, unknown>).top_suggestions as string) ?? '[]'
          ),
        }
      : null,
    submitted_count: reviews.results.length,
    all_submitted: reviews.results.length >= 4,
  });
}

export async function finalizeRetro(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { session_id } = args as Record<string, string>;

  const reviews = await db
    .prepare('SELECT * FROM retro_review WHERE session_id=?')
    .bind(session_id)
    .all();
  if (reviews.results.length < 4) {
    return fail(`아직 ${4 - reviews.results.length}개 AI가 회고를 제출하지 않았습니다.`);
  }

  // 잘된점 / 못된점 / 제안 집계
  const wellMap: Record<string, number> = {};
  const wrongMap: Record<string, number> = {};
  const suggMap: Record<string, number> = {};
  const mvpMap: Record<string, number> = {};

  for (const r of reviews.results as Array<Record<string, unknown>>) {
    for (const item of JSON.parse((r.went_well as string) ?? '[]') as string[]) {
      wellMap[item] = (wellMap[item] ?? 0) + 1;
    }
    for (const item of JSON.parse((r.went_wrong as string) ?? '[]') as string[]) {
      wrongMap[item] = (wrongMap[item] ?? 0) + 1;
    }
    for (const item of JSON.parse((r.suggestions as string) ?? '[]') as string[]) {
      suggMap[item] = (suggMap[item] ?? 0) + 1;
    }
    if (r.mvp_vote) {
      mvpMap[r.mvp_vote as string] = (mvpMap[r.mvp_vote as string] ?? 0) + 1;
    }
  }

  const topN = (map: Record<string, number>, n = 3) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `${k} (${v}표)`);

  const mvpAgent = Object.entries(mvpMap).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  await db
    .prepare(
      `
          INSERT OR REPLACE INTO retro_summary (session_id,top_went_well,top_went_wrong,top_suggestions,mvp_agent,participation)
          VALUES (?,?,?,?,?,?)
        `
    )
    .bind(
      session_id,
      JSON.stringify(topN(wellMap)),
      JSON.stringify(topN(wrongMap)),
      JSON.stringify(topN(suggMap)),
      mvpAgent,
      reviews.results.length
    )
    .run();

  // 세션 상태를 voting으로 전환
  await db.prepare(`UPDATE session SET status='voting' WHERE id=?`).bind(session_id).run();

  await db
    .prepare(`INSERT INTO event_log (event_type,session_id,payload) VALUES ('session',?,?)`)
    .bind(session_id, JSON.stringify({ action: 'retro_finalized', mvp: mvpAgent }))
    .run();

  return ok({
    success: true,
    session_id,
    mvp_agent: mvpAgent,
    top_went_well: topN(wellMap),
    top_went_wrong: topN(wrongMap),
    top_suggestions: topN(suggMap),
    next_step: 'start_election 호출하여 다음 세션 리더를 선출하세요.',
  });
}

export const retroHandlers = {
  submit_retro: submitRetro,
  get_retro: getRetro,
  finalize_retro: finalizeRetro,
} satisfies Record<string, ToolHandler>;
