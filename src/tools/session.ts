import {
  ok,
  fail,
  nextId,
  type ToolDefinition,
  type ToolHandler,
  type ToolResult,
} from '../lib/mcp';

export const sessionTools = [
  {
    name: 'start_session',
    description: '새 작업 세션을 시작합니다. 리더 AI와 목표를 지정하세요.',
    inputSchema: {
      type: 'object',
      required: ['title', 'leader'],
      properties: {
        title: { type: 'string', description: '세션 이름 (예: Sprint-04 인증 모듈)' },
        leader: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'minimax'],
          description: '세션 리더 AI',
        },
        goals: { type: 'array', items: { type: 'string' }, description: '세션 목표 목록' },
        project: {
          type: 'string',
          description:
            '세션이 속한 로컬 폴더 경로 (대시보드에서 프로젝트별로 그룹핑됨). 호출 AI의 작업 디렉터리를 전달하세요.',
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_session',
    description: '세션 정보를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: '조회할 세션 ID. 생략 시 활성 세션 반환.' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'close_session',
    description: '세션을 종료합니다. 이후 자동으로 회고 단계(retro)로 전환됩니다.',
    inputSchema: {
      type: 'object',
      required: ['session_id', 'closed_by'],
      properties: {
        session_id: { type: 'string' },
        closed_by: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax', 'human'] },
        summary: { type: 'string', description: '세션 완료 요약' },
      },
    },
    annotations: { readOnlyHint: false },
  },
] satisfies ToolDefinition[];

export async function startSession(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { title, leader } = args as Record<string, string>;
  const goals = JSON.stringify(args.goals ?? []);
  const project =
    typeof args.project === 'string' && args.project.trim() ? args.project.trim() : null;
  const id = await nextId(db, 'session', 'SESS');

  await db
    .prepare(`INSERT INTO session (id,title,leader,goals,project) VALUES (?,?,?,?,?)`)
    .bind(id, title, leader, goals, project)
    .run();

  // 리더 상태 working으로
  await db
    .prepare(
      `UPDATE ai_state SET status='working', session_id=?, updated_at=datetime('now') WHERE agent=?`
    )
    .bind(id, leader)
    .run();

  await db
    .prepare(`INSERT INTO event_log (event_type,agent,session_id,payload) VALUES ('session',?,?,?)`)
    .bind(leader, id, JSON.stringify({ action: 'started', title, leader }))
    .run();

  return ok({
    success: true,
    session_id: id,
    title,
    leader,
    project,
    message: `세션 ${id} 시작. 리더: ${leader}`,
  });
}

export async function getSession(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const sid = args.session_id as string | undefined;
  const sess = sid
    ? await db.prepare('SELECT * FROM session WHERE id=?').bind(sid).first()
    : await db
        .prepare(
          "SELECT * FROM session WHERE status IN ('active','retro','voting') ORDER BY created_at DESC LIMIT 1"
        )
        .first();

  if (!sess) {
    return fail('Active session not found');
  }

  const tasks = await db
    .prepare('SELECT * FROM tasks WHERE session_id=?')
    .bind((sess as Record<string, unknown>).id)
    .all();
  const discussions = await db
    .prepare('SELECT * FROM discussion_thread WHERE session_id=?')
    .bind((sess as Record<string, unknown>).id)
    .all();

  return ok({ session: sess, tasks: tasks.results, discussions: discussions.results });
}

export async function closeSession(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { session_id, closed_by, summary } = args as Record<string, string>;

  await db
    .prepare(`UPDATE session SET status='retro', closed_at=datetime('now') WHERE id=?`)
    .bind(session_id)
    .run();

  // 모든 AI 상태를 retro로 전환
  await db.prepare(`UPDATE ai_state SET status='retro', updated_at=datetime('now')`).run();

  await db
    .prepare(`INSERT INTO event_log (event_type,agent,session_id,payload) VALUES ('session',?,?,?)`)
    .bind(
      closed_by,
      session_id,
      JSON.stringify({ action: 'closed', summary, next_step: 'submit_retro' })
    )
    .run();

  return ok({
    success: true,
    session_id,
    status: 'retro',
    message: '세션 종료. 모든 AI는 submit_retro를 호출하여 회고를 제출하세요.',
    required_action: '4개 AI 모두 submit_retro 호출 필요',
  });
}

export const sessionHandlers = {
  start_session: startSession,
  get_session: getSession,
  close_session: closeSession,
} satisfies Record<string, ToolHandler>;
