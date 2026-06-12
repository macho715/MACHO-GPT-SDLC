/**
 * MCP DEV HUB v3 — Tool 정의 + 핸들러
 * ★ Session Lifecycle + Retrospective + Leader Election 추가
 */

const ok  = (d: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: 'text', text: JSON.stringify({ error: m }) }], isError: true });

async function nextId(db: D1Database, table: string, prefix: string): Promise<string> {
  const r = await db.prepare(`SELECT COUNT(*) as c FROM ${table}`).first<{ c: number }>();
  return `${prefix}-${String((r?.c ?? 0) + 1).padStart(3, '0')}`;
}

// ─────────────────────────────────────────────────────────────
// Tool 정의
// ─────────────────────────────────────────────────────────────
export const tools = [

  // ════════════════════════════════════════════════════════════
  // § 0. 대시보드
  // ════════════════════════════════════════════════════════════
  {
    name: 'get_dashboard',
    description: '전체 상태 스냅샷 — 활성 세션·태스크·토론·투표·대기 핸드오프 한 번에 조회.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },

  // ════════════════════════════════════════════════════════════
  // § 1. 세션 관리 (★ NEW)
  // ════════════════════════════════════════════════════════════
  {
    name: 'start_session',
    description: '새 작업 세션을 시작합니다. 리더 AI와 목표를 지정하세요.',
    inputSchema: {
      type: 'object',
      required: ['title', 'leader'],
      properties: {
        title:  { type: 'string', description: '세션 이름 (예: Sprint-04 인증 모듈)' },
        leader: { type: 'string', enum: ['codex','claude','opencode','minimax'], description: '세션 리더 AI' },
        goals:  { type: 'array', items: { type: 'string' }, description: '세션 목표 목록' },
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
        closed_by:  { type: 'string', enum: ['codex','claude','opencode','minimax','human'] },
        summary:    { type: 'string', description: '세션 완료 요약' },
      },
    },
    annotations: { readOnlyHint: false },
  },

  // ════════════════════════════════════════════════════════════
  // § 2. 회고 (★ NEW)
  // ════════════════════════════════════════════════════════════
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
        session_id:  { type: 'string' },
        agent:       { type: 'string', enum: ['codex','claude','opencode','minimax'] },
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
        mvp_vote:  {
          type: 'string',
          enum: ['codex','claude','opencode','minimax'],
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

  // ════════════════════════════════════════════════════════════
  // § 3. 리더 선출 (★ NEW)
  // ════════════════════════════════════════════════════════════
  {
    name: 'start_election',
    description: '다음 세션 리더를 선출하는 선거를 시작합니다. finalize_retro 후 자동 호출되거나 수동으로 시작할 수 있습니다.',
    inputSchema: {
      type: 'object',
      required: ['session_id'],
      properties: {
        session_id:   { type: 'string', description: '종료된 세션 ID' },
        nominees:     {
          type: 'array',
          items: { type: 'string', enum: ['codex','claude','opencode','minimax'] },
          description: '후보 목록. 생략 시 전체 AI가 후보.',
        },
        ttl_minutes:  { type: 'number', default: 30, description: '투표 마감 시간' },
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
        agent:       { type: 'string', enum: ['codex','claude','opencode','minimax'], description: '투표하는 AI' },
        nominee:     { type: 'string', enum: ['codex','claude','opencode','minimax'], description: '지지하는 후보' },
        reason:      { type: 'string', description: '지지 이유 (권장)' },
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
        election_id:    { type: 'number' },
        auto_start_next: { type: 'boolean', default: true, description: '전원 투표 시 다음 세션 자동 시작' },
      },
    },
    annotations: { readOnlyHint: false },
  },

  // ════════════════════════════════════════════════════════════
  // § 4. 에이전트 상태
  // ════════════════════════════════════════════════════════════
  {
    name: 'get_state',
    description: 'AI 에이전트 현재 상태 조회.',
    inputSchema: {
      type: 'object',
      properties: { agent: { type: 'string', enum: ['codex','claude','opencode','minimax','all'] } },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_state',
    description: '내 작업 상태를 업데이트합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent','status'],
      properties: {
        agent:        { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        status:       { type: 'string', enum: ['idle','working','blocked','review','discussing','retro','done'] },
        task_id:      { type: 'string' },
        task_title:   { type: 'string' },
        session_id:   { type: 'string' },
        current_file: { type: 'string' },
        progress:     { type: 'number', minimum: 0, maximum: 100 },
        note:         { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },

  // ════════════════════════════════════════════════════════════
  // § 5. 태스크
  // ════════════════════════════════════════════════════════════
  {
    name: 'create_task',
    description: '태스크를 생성합니다.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title:       { type: 'string' },
        description: { type: 'string' },
        priority:    { type: 'string', enum: ['low','normal','high','critical'], default: 'normal' },
        assigned_to: { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        session_id:  { type: 'string' },
        created_by:  { type: 'string' },
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
        status:      { type: 'string', enum: ['open','in_progress','review','done','blocked','all'], default: 'all' },
        assigned_to: { type: 'string', enum: ['codex','claude','opencode','minimax','all'], default: 'all' },
        session_id:  { type: 'string' },
        limit:       { type: 'number', default: 20 },
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
        task_id:     { type: 'string' },
        status:      { type: 'string', enum: ['open','in_progress','review','done','blocked'] },
        assigned_to: { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        priority:    { type: 'string', enum: ['low','normal','high','critical'] },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },

  // ════════════════════════════════════════════════════════════
  // § 6. 토론 (v2 동일)
  // ════════════════════════════════════════════════════════════
  {
    name: 'start_discussion',
    description: '이슈 토론 스레드를 시작합니다.',
    inputSchema: {
      type: 'object',
      required: ['task_id','title','initiated_by','opening_message'],
      properties: {
        task_id:         { type: 'string' },
        session_id:      { type: 'string' },
        title:           { type: 'string' },
        topic:           { type: 'string' },
        initiated_by:    { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        opening_message: { type: 'string' },
        invite_agents:   { type: 'array', items: { type: 'string' } },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'post_message',
    description: '토론 스레드에 발언합니다.',
    inputSchema: {
      type: 'object',
      required: ['thread_id','agent','role','content'],
      properties: {
        thread_id:  { type: 'string' },
        agent:      { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        role:       { type: 'string', enum: ['propose','agree','disagree','question','clarify','summarize','decide'] },
        content:    { type: 'string' },
        reply_to:   { type: 'number' },
        evidence:   { type: 'array', items: { type: 'string' } },
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
        limit:     { type: 'number', default: 50 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'close_discussion',
    description: '토론 종료 + 합의 기록.',
    inputSchema: {
      type: 'object',
      required: ['thread_id','agent','consensus_summary'],
      properties: {
        thread_id:         { type: 'string' },
        agent:             { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        consensus_summary: { type: 'string' },
        action_items:      { type: 'array', items: { type: 'string' } },
        outcome:           { type: 'string', enum: ['consensus','no_consensus','deferred'], default: 'consensus' },
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

  // ════════════════════════════════════════════════════════════
  // § 7. 투표 (일반)
  // ════════════════════════════════════════════════════════════
  {
    name: 'create_vote',
    description: '의견 충돌 시 투표를 생성합니다.',
    inputSchema: {
      type: 'object',
      required: ['thread_id','question','options','created_by'],
      properties: {
        thread_id:   { type: 'string' },
        question:    { type: 'string' },
        options:     { type: 'array', items: { type: 'string' }, minItems: 2 },
        created_by:  { type: 'string', enum: ['codex','claude','opencode','minimax'] },
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
      required: ['vote_id','agent','choice'],
      properties: {
        vote_id: { type: 'number' },
        agent:   { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        choice:  { type: 'string' },
        reason:  { type: 'string' },
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
        vote_id:      { type: 'number' },
        close_if_all: { type: 'boolean', default: true },
      },
    },
    annotations: { readOnlyHint: false },
  },

  // ════════════════════════════════════════════════════════════
  // § 8. 핸드오프 / 잠금 / 파일 / 이벤트
  // ════════════════════════════════════════════════════════════
  {
    name: 'log_handoff',
    description: 'AI 간 작업 인계.',
    inputSchema: {
      type: 'object',
      required: ['from_agent','to_agent','task_id','summary'],
      properties: {
        from_agent:    { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        to_agent:      { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        task_id:       { type: 'string' },
        summary:       { type: 'string' },
        changed_files: { type: 'array', items: { type: 'string' } },
        risks:         { type: 'array', items: { type: 'string' } },
        instructions:  { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_handoff',
    description: '내게 온 핸드오프 조회.',
    inputSchema: {
      type: 'object',
      required: ['agent'],
      properties: {
        agent:  { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        status: { type: 'string', enum: ['pending','acknowledged','all'], default: 'pending' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'ack_handoff',
    description: '핸드오프 수신 확인.',
    inputSchema: {
      type: 'object',
      required: ['handoff_id','agent'],
      properties: {
        handoff_id: { type: 'number' },
        agent:      { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        accepted:   { type: 'boolean', default: true },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  {
    name: 'lock_task',
    description: '태스크 잠금.',
    inputSchema: {
      type: 'object',
      required: ['task_id','agent'],
      properties: {
        task_id:     { type: 'string' },
        agent:       { type: 'string', enum: ['codex','claude','opencode','minimax'] },
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
      required: ['task_id','agent'],
      properties: {
        task_id: { type: 'string' },
        agent:   { type: 'string', enum: ['codex','claude','opencode','minimax'] },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  {
    name: 'record_file_change',
    description: '파일 변경 기록.',
    inputSchema: {
      type: 'object',
      required: ['agent','file_path','change_type','summary'],
      properties: {
        agent:        { type: 'string', enum: ['codex','claude','opencode','minimax'] },
        task_id:      { type: 'string' },
        file_path:    { type: 'string' },
        change_type:  { type: 'string', enum: ['create','modify','delete'] },
        summary:      { type: 'string' },
        diff_snippet: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'broadcast_event',
    description: '전체 AI에게 알림 브로드캐스트.',
    inputSchema: {
      type: 'object',
      required: ['event_type','agent','message'],
      properties: {
        event_type: { type: 'string', enum: ['alert','info','warning','state_change','task_update','discussion','session'] },
        agent:      { type: 'string' },
        task_id:    { type: 'string' },
        thread_id:  { type: 'string' },
        session_id: { type: 'string' },
        message:    { type: 'string' },
        payload:    { type: 'object' },
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
        agent:      { type: 'string', default: 'all' },
        session_id: { type: 'string' },
        limit:      { type: 'number', default: 30 },
      },
    },
    annotations: { readOnlyHint: true },
  },
];

// ─────────────────────────────────────────────────────────────
// 핸들러
// ─────────────────────────────────────────────────────────────
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  db: D1Database,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {

  switch (name) {

    // ── get_dashboard ──────────────────────────────────────
    case 'get_dashboard': {
      const [agents, activeSess, tasks, discussions, votes, handoffs, events] = await Promise.all([
        db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all(),
        db.prepare("SELECT * FROM session WHERE status IN ('active','retro','voting') ORDER BY created_at DESC LIMIT 1").first(),
        db.prepare("SELECT * FROM tasks WHERE status!='done' ORDER BY created_at DESC LIMIT 10").all(),
        db.prepare("SELECT * FROM discussion_thread WHERE status IN ('open','voting') ORDER BY updated_at DESC LIMIT 5").all(),
        db.prepare("SELECT v.*,COUNT(b.id) as ballot_count FROM vote v LEFT JOIN vote_ballot b ON v.id=b.vote_id WHERE v.status='open' GROUP BY v.id").all(),
        db.prepare("SELECT * FROM handoff_log WHERE status='pending' ORDER BY created_at DESC LIMIT 5").all(),
        db.prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT 15').all(),
      ]);
      return ok({
        snapshot_at: new Date().toISOString(),
        active_session: activeSess ?? null,
        agents: agents.results,
        active_tasks: tasks.results,
        active_discussions: discussions.results,
        pending_votes: votes.results,
        pending_handoffs: handoffs.results,
        recent_events: events.results,
      });
    }

    // ════════════════════════════════════════════════════════
    // ★ 세션 핸들러
    // ════════════════════════════════════════════════════════

    // ── start_session ──────────────────────────────────────
    case 'start_session': {
      const { title, leader } = args as Record<string, string>;
      const goals = JSON.stringify(args.goals ?? []);
      const id = await nextId(db, 'session', 'SESS');

      await db.prepare(`INSERT INTO session (id,title,leader,goals) VALUES (?,?,?,?)`)
        .bind(id, title, leader, goals).run();

      // 리더 상태 working으로
      await db.prepare(`UPDATE ai_state SET status='working', session_id=?, updated_at=datetime('now') WHERE agent=?`)
        .bind(id, leader).run();

      await db.prepare(`INSERT INTO event_log (event_type,agent,session_id,payload) VALUES ('session',?,?,?)`)
        .bind(leader, id, JSON.stringify({ action: 'started', title, leader })).run();

      return ok({ success: true, session_id: id, title, leader, message: `세션 ${id} 시작. 리더: ${leader}` });
    }

    // ── get_session ────────────────────────────────────────
    case 'get_session': {
      const sid = args.session_id as string | undefined;
      const sess = sid
        ? await db.prepare('SELECT * FROM session WHERE id=?').bind(sid).first()
        : await db.prepare("SELECT * FROM session WHERE status IN ('active','retro','voting') ORDER BY created_at DESC LIMIT 1").first();

      if (!sess) return fail('Active session not found');

      const tasks = await db.prepare('SELECT * FROM tasks WHERE session_id=?').bind((sess as Record<string,unknown>).id).all();
      const discussions = await db.prepare('SELECT * FROM discussion_thread WHERE session_id=?').bind((sess as Record<string,unknown>).id).all();

      return ok({ session: sess, tasks: tasks.results, discussions: discussions.results });
    }

    // ── close_session ──────────────────────────────────────
    case 'close_session': {
      const { session_id, closed_by, summary } = args as Record<string, string>;

      await db.prepare(`UPDATE session SET status='retro', closed_at=datetime('now') WHERE id=?`).bind(session_id).run();

      // 모든 AI 상태를 retro로 전환
      await db.prepare(`UPDATE ai_state SET status='retro', updated_at=datetime('now')`).run();

      await db.prepare(`INSERT INTO event_log (event_type,agent,session_id,payload) VALUES ('session',?,?,?)`)
        .bind(closed_by, session_id, JSON.stringify({ action: 'closed', summary, next_step: 'submit_retro' })).run();

      return ok({
        success: true,
        session_id,
        status: 'retro',
        message: '세션 종료. 모든 AI는 submit_retro를 호출하여 회고를 제출하세요.',
        required_action: '4개 AI 모두 submit_retro 호출 필요',
      });
    }

    // ════════════════════════════════════════════════════════
    // ★ 회고 핸들러
    // ════════════════════════════════════════════════════════

    // ── submit_retro ───────────────────────────────────────
    case 'submit_retro': {
      const { session_id, agent, highlight, mvp_vote } = args as Record<string, string>;
      const went_well   = JSON.stringify(args.went_well ?? []);
      const went_wrong  = JSON.stringify(args.went_wrong ?? []);
      const suggestions = JSON.stringify(args.suggestions ?? []);

      // 중복 제출 방지
      const existing = await db.prepare('SELECT id FROM retro_review WHERE session_id=? AND agent=?').bind(session_id, agent).first();
      if (existing) return fail(`${agent} already submitted retro for ${session_id}`);

      await db.prepare(`
        INSERT INTO retro_review (session_id,agent,went_well,went_wrong,suggestions,highlight,mvp_vote)
        VALUES (?,?,?,?,?,?,?)
      `).bind(session_id, agent, went_well, went_wrong, suggestions, highlight ?? null, mvp_vote ?? null).run();

      // 제출 현황 확인
      const submitted = await db.prepare('SELECT COUNT(*) as c FROM retro_review WHERE session_id=?').bind(session_id).first<{ c: number }>();
      const submittedCount = submitted?.c ?? 0;

      await db.prepare(`INSERT INTO event_log (event_type,agent,session_id,payload) VALUES ('session',?,?,?)`)
        .bind(agent, session_id, JSON.stringify({ action: 'retro_submitted', submitted: submittedCount, total: 4 })).run();

      return ok({
        success: true,
        agent,
        session_id,
        submitted_count: submittedCount,
        total_agents: 4,
        all_submitted: submittedCount >= 4,
        message: submittedCount >= 4
          ? '전원 제출 완료 → finalize_retro 호출하세요.'
          : `${4 - submittedCount}개 AI 제출 대기 중.`,
      });
    }

    // ── get_retro ──────────────────────────────────────────
    case 'get_retro': {
      const { session_id } = args as Record<string, string>;

      const reviews = await db.prepare('SELECT * FROM retro_review WHERE session_id=? ORDER BY submitted_at ASC').bind(session_id).all();
      const summary = await db.prepare('SELECT * FROM retro_summary WHERE session_id=?').bind(session_id).first();
      const session = await db.prepare('SELECT * FROM session WHERE id=?').bind(session_id).first();

      const parsed = reviews.results.map((r: Record<string, unknown>) => ({
        ...r,
        went_well:   JSON.parse(r.went_well as string ?? '[]'),
        went_wrong:  JSON.parse(r.went_wrong as string ?? '[]'),
        suggestions: JSON.parse(r.suggestions as string ?? '[]'),
      }));

      return ok({
        session,
        reviews: parsed,
        summary: summary ? {
          ...(summary as Record<string,unknown>),
          top_went_well:   JSON.parse((summary as Record<string,unknown>).top_went_well as string ?? '[]'),
          top_went_wrong:  JSON.parse((summary as Record<string,unknown>).top_went_wrong as string ?? '[]'),
          top_suggestions: JSON.parse((summary as Record<string,unknown>).top_suggestions as string ?? '[]'),
        } : null,
        submitted_count: reviews.results.length,
        all_submitted: reviews.results.length >= 4,
      });
    }

    // ── finalize_retro ─────────────────────────────────────
    case 'finalize_retro': {
      const { session_id } = args as Record<string, string>;

      const reviews = await db.prepare('SELECT * FROM retro_review WHERE session_id=?').bind(session_id).all();
      if (reviews.results.length < 4) {
        return fail(`아직 ${4 - reviews.results.length}개 AI가 회고를 제출하지 않았습니다.`);
      }

      // 잘된점 / 못된점 / 제안 집계
      const wellMap: Record<string, number> = {};
      const wrongMap: Record<string, number> = {};
      const suggMap: Record<string, number> = {};
      const mvpMap: Record<string, number>  = {};

      for (const r of reviews.results as Array<Record<string, unknown>>) {
        for (const item of JSON.parse(r.went_well as string ?? '[]') as string[])
          wellMap[item] = (wellMap[item] ?? 0) + 1;
        for (const item of JSON.parse(r.went_wrong as string ?? '[]') as string[])
          wrongMap[item] = (wrongMap[item] ?? 0) + 1;
        for (const item of JSON.parse(r.suggestions as string ?? '[]') as string[])
          suggMap[item] = (suggMap[item] ?? 0) + 1;
        if (r.mvp_vote) mvpMap[r.mvp_vote as string] = (mvpMap[r.mvp_vote as string] ?? 0) + 1;
      }

      const topN = (map: Record<string, number>, n = 3) =>
        Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,n).map(([k,v]) => `${k} (${v}표)`);

      const mvpAgent = Object.entries(mvpMap).sort((a,b) => b[1]-a[1])[0]?.[0] ?? null;

      await db.prepare(`
        INSERT OR REPLACE INTO retro_summary (session_id,top_went_well,top_went_wrong,top_suggestions,mvp_agent,participation)
        VALUES (?,?,?,?,?,?)
      `).bind(
        session_id,
        JSON.stringify(topN(wellMap)),
        JSON.stringify(topN(wrongMap)),
        JSON.stringify(topN(suggMap)),
        mvpAgent,
        reviews.results.length,
      ).run();

      // 세션 상태를 voting으로 전환
      await db.prepare(`UPDATE session SET status='voting' WHERE id=?`).bind(session_id).run();

      await db.prepare(`INSERT INTO event_log (event_type,session_id,payload) VALUES ('session',?,?)`)
        .bind(session_id, JSON.stringify({ action: 'retro_finalized', mvp: mvpAgent })).run();

      return ok({
        success: true,
        session_id,
        mvp_agent: mvpAgent,
        top_went_well:   topN(wellMap),
        top_went_wrong:  topN(wrongMap),
        top_suggestions: topN(suggMap),
        next_step: 'start_election 호출하여 다음 세션 리더를 선출하세요.',
      });
    }

    // ════════════════════════════════════════════════════════
    // ★ 리더 선출 핸들러
    // ════════════════════════════════════════════════════════

    // ── start_election ─────────────────────────────────────
    case 'start_election': {
      const { session_id } = args as Record<string, string>;
      const nominees   = (args.nominees as string[]) ?? ['codex','claude','opencode','minimax'];
      const ttl        = (args.ttl_minutes as number) ?? 30;

      const result = await db.prepare(`
        INSERT INTO leader_election (session_id, status)
        VALUES (?, 'open')
      `).bind(session_id).run();

      const electionId = result.meta.last_row_id;

      // vote 테이블에도 기록 (일관성)
      await db.prepare(`
        INSERT INTO vote (session_id,vote_type,question,options,created_by,closes_at)
        VALUES (?,'leader_election',?,?,?,datetime('now','+'||?||' minutes'))
      `).bind(session_id, '다음 세션 리더 선출', JSON.stringify(nominees), 'system', ttl).run();

      await db.prepare(`INSERT INTO event_log (event_type,session_id,payload) VALUES ('session',?,?)`)
        .bind(session_id, JSON.stringify({ action: 'election_started', election_id: electionId, nominees })).run();

      return ok({
        success: true,
        election_id: electionId,
        nominees,
        ttl_minutes: ttl,
        message: `선거 시작. 모든 AI는 cast_election_vote를 호출하세요. election_id: ${electionId}`,
      });
    }

    // ── cast_election_vote ─────────────────────────────────
    case 'cast_election_vote': {
      const { election_id, agent, nominee, reason } = args as Record<string, string | number>;

      const existing = await db.prepare('SELECT id FROM election_ballot WHERE election_id=? AND agent=?').bind(election_id, agent).first();
      if (existing) return fail(`${agent}는 이미 투표했습니다.`);

      await db.prepare(`INSERT INTO election_ballot (election_id,agent,nominee,reason) VALUES (?,?,?,?)`)
        .bind(election_id, agent, nominee, reason ?? null).run();

      const count = await db.prepare('SELECT COUNT(*) as c FROM election_ballot WHERE election_id=?').bind(election_id).first<{ c: number }>();

      await db.prepare(`INSERT INTO event_log (event_type,agent,payload) VALUES ('session',?,?)`)
        .bind(agent, JSON.stringify({ action: 'election_voted', election_id, nominee })).run();

      return ok({
        success: true,
        agent,
        nominee,
        vote_count: count?.c ?? 1,
        message: (count?.c ?? 1) >= 4 ? '전원 투표 완료 → get_election_result 호출하세요.' : `${4 - (count?.c ?? 1)}명 투표 대기 중.`,
      });
    }

    // ── get_election_result ────────────────────────────────
    case 'get_election_result': {
      const election_id    = args.election_id as number;
      const auto_start     = args.auto_start_next !== false;

      const ballots = await db.prepare('SELECT * FROM election_ballot WHERE election_id=?').bind(election_id).all();
      const election = await db.prepare('SELECT * FROM leader_election WHERE id=?').bind(election_id).first<Record<string,unknown>>();
      if (!election) return fail(`Election not found: ${election_id}`);

      // 집계
      const tally: Record<string, number> = {};
      for (const b of ballots.results as Array<Record<string,unknown>>) {
        const n = b.nominee as string;
        tally[n] = (tally[n] ?? 0) + 1;
      }

      const sorted = Object.entries(tally).sort((a,b) => b[1]-a[1]);
      const winner = sorted[0]?.[0] ?? null;
      const isTie  = sorted.length >= 2 && sorted[0][1] === sorted[1][1];

      // 전원 투표 + 마감
      const allVoted = ballots.results.length >= 4;

      if (allVoted && election.status === 'open') {
        await db.prepare(`UPDATE leader_election SET status='closed', winner=?, total_votes=?, closed_at=datetime('now') WHERE id=?`)
          .bind(winner, ballots.results.length, election_id).run();

        // 현재 세션 닫기
        await db.prepare(`UPDATE session SET status='closed' WHERE id=?`).bind(election.session_id).run();

        // ★ 다음 세션 자동 생성
        let nextSessionId: string | null = null;
        if (auto_start && winner && !isTie) {
          nextSessionId = await nextId(db, 'session', 'SESS');
          const prevSess = await db.prepare('SELECT title FROM session WHERE id=?').bind(election.session_id).first<{ title: string }>();
          const prevNum  = parseInt(election.session_id as string.replace('SESS-','')) || 1;
          const nextTitle = `Session ${String(prevNum + 1).padStart(3,'0')}`;

          await db.prepare(`INSERT INTO session (id,title,leader,goals) VALUES (?,?,?,?)`)
            .bind(nextSessionId, nextTitle, winner, JSON.stringify(['이전 세션 회고 반영', '리더 주도 목표 설정'])).run();

          await db.prepare(`UPDATE leader_election SET next_session_id=? WHERE id=?`).bind(nextSessionId, election_id).run();
          await db.prepare(`UPDATE session SET next_session_id=? WHERE id=?`).bind(nextSessionId, election.session_id).run();

          // 당선자 상태 업데이트
          await db.prepare(`UPDATE ai_state SET status='working', session_id=?, updated_at=datetime('now') WHERE agent=?`)
            .bind(nextSessionId, winner).run();

          // 나머지 AI 상태 idle
          await db.prepare(`UPDATE ai_state SET status='idle', updated_at=datetime('now') WHERE agent!=?`).bind(winner).run();
        }

        await db.prepare(`INSERT INTO event_log (event_type,session_id,payload) VALUES ('session',?,?)`)
          .bind(election.session_id, JSON.stringify({ action: 'election_closed', winner, tally, next_session: nextSessionId })).run();
      }

      return ok({
        election_id,
        tally,
        winner: isTie ? null : winner,
        is_tie: isTie,
        tie_candidates: isTie ? sorted.filter(([,v]) => v === sorted[0][1]).map(([k]) => k) : [],
        total_votes: ballots.results.length,
        ballots: ballots.results,
        is_final: allVoted,
        next_session_id: election.next_session_id ?? null,
        message: isTie
          ? `동률 (${sorted.filter(([,v])=>v===sorted[0][1]).map(([k])=>k).join(' vs ')}) — 재투표 또는 human 결정 필요`
          : winner
            ? `🏆 선출된 다음 세션 리더: ${winner}`
            : '투표 진행 중...',
      });
    }

    // ════════════════════════════════════════════════════════
    // § 에이전트 상태
    // ════════════════════════════════════════════════════════

    case 'get_state': {
      const agent = (args.agent as string) ?? 'all';
      const rows = agent === 'all'
        ? await db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all()
        : await db.prepare('SELECT * FROM ai_state WHERE agent=?').bind(agent).all();
      return ok({ agents: rows.results });
    }

    case 'update_state': {
      const { agent, status, task_id, task_title, session_id, current_file, progress, note } = args as Record<string, string|number>;
      await db.prepare(`
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
      `).bind(agent,status,task_id??null,task_title??null,session_id??null,current_file??null,progress??0,note??null).run();
      return ok({ success:true, agent, status });
    }

    // ════════════════════════════════════════════════════════
    // § 태스크
    // ════════════════════════════════════════════════════════

    case 'create_task': {
      const id = await nextId(db,'tasks','TASK');
      const { title,description,priority,assigned_to,session_id,created_by } = args as Record<string,string>;
      await db.prepare(`INSERT INTO tasks (id,title,description,priority,assigned_to,session_id,created_by) VALUES (?,?,?,?,?,?,?)`)
        .bind(id,title,description??null,priority??'normal',assigned_to??null,session_id??null,created_by??'human').run();
      return ok({ success:true, task_id:id, title });
    }

    case 'list_tasks': {
      const status=(args.status as string)?? 'all', assigned=(args.assigned_to as string)?? 'all';
      const session_id=args.session_id as string|undefined, limit=(args.limit as number)??20;
      let q='SELECT * FROM tasks WHERE 1=1'; const b:(string|number)[]=[];
      if(status!=='all'){q+=' AND status=?';b.push(status);}
      if(assigned!=='all'){q+=' AND assigned_to=?';b.push(assigned);}
      if(session_id){q+=' AND session_id=?';b.push(session_id);}
      q+=' ORDER BY created_at DESC LIMIT ?';b.push(limit);
      const rows=await db.prepare(q).bind(...b).all();
      return ok({tasks:rows.results,count:rows.results.length});
    }

    case 'update_task': {
      const {task_id,status,assigned_to,priority}=args as Record<string,string>;
      await db.prepare(`UPDATE tasks SET status=COALESCE(?,status),assigned_to=COALESCE(?,assigned_to),priority=COALESCE(?,priority),updated_at=datetime('now') WHERE id=?`)
        .bind(status??null,assigned_to??null,priority??null,task_id).run();
      return ok({success:true,task_id});
    }

    // ════════════════════════════════════════════════════════
    // § 토론 (v2 동일)
    // ════════════════════════════════════════════════════════

    case 'start_discussion': {
      const {task_id,session_id,title,topic,initiated_by,opening_message}=args as Record<string,string>;
      const id=await nextId(db,'discussion_thread','DISC');
      await db.prepare(`INSERT INTO discussion_thread (id,task_id,session_id,title,topic,initiated_by) VALUES (?,?,?,?,?,?)`)
        .bind(id,task_id,session_id??null,title,topic??null,initiated_by).run();
      await db.prepare(`INSERT INTO discussion_message (thread_id,agent,role,content) VALUES (?,?,?,?)`)
        .bind(id,initiated_by,'propose',opening_message).run();
      await db.prepare(`UPDATE ai_state SET status='discussing',updated_at=datetime('now') WHERE agent=?`).bind(initiated_by).run();
      const invites=(args.invite_agents as string[])??[];
      for(const a of invites)
        await db.prepare(`INSERT INTO event_log (event_type,agent,task_id,thread_id,session_id,payload) VALUES ('discussion',?,?,?,?,?)`)
          .bind(a,task_id,id,session_id??null,JSON.stringify({action:'invited',thread:id,title,from:initiated_by})).run();
      return ok({success:true,thread_id:id,title});
    }

    case 'post_message': {
      const {thread_id,agent,role,content,reply_to,confidence}=args as Record<string,string|number>;
      const evidence=JSON.stringify(args.evidence??[]);
      const thread=await db.prepare('SELECT * FROM discussion_thread WHERE id=?').bind(thread_id).first();
      if(!thread) return fail(`Thread not found: ${thread_id}`);
      const r=await db.prepare(`INSERT INTO discussion_message (thread_id,agent,role,content,reply_to,evidence,confidence) VALUES (?,?,?,?,?,?,?)`)
        .bind(thread_id,agent,role,content,reply_to??null,evidence,confidence??0.8).run();
      await db.prepare(`UPDATE discussion_thread SET updated_at=datetime('now') WHERE id=?`).bind(thread_id).run();
      return ok({success:true,message_id:r.meta.last_row_id,thread_id,agent,role});
    }

    case 'get_discussion': {
      const {thread_id,limit}=args as Record<string,string|number>;
      const thread=await db.prepare('SELECT * FROM discussion_thread WHERE id=?').bind(thread_id).first();
      if(!thread) return fail(`Thread not found: ${thread_id}`);
      const msgs=await db.prepare('SELECT * FROM discussion_message WHERE thread_id=? ORDER BY created_at ASC LIMIT ?').bind(thread_id,(limit as number)??50).all();
      return ok({thread,messages:msgs.results.map((m:Record<string,unknown>)=>({...m,evidence:JSON.parse(m.evidence as string??'[]')}))});
    }

    case 'close_discussion': {
      const {thread_id,agent,consensus_summary,outcome}=args as Record<string,string>;
      const action_items=(args.action_items as string[])??[];
      const participants=await db.prepare('SELECT DISTINCT agent FROM discussion_message WHERE thread_id=?').bind(thread_id).all();
      const agreed=participants.results.map((r:Record<string,unknown>)=>r.agent as string);
      await db.prepare(`UPDATE discussion_thread SET status=?,consensus=?,consensus_at=datetime('now'),updated_at=datetime('now') WHERE id=?`)
        .bind(outcome==='consensus'?'consensus':'closed',consensus_summary,thread_id).run();
      await db.prepare(`INSERT INTO consensus_log (thread_id,agreed_by,summary,action_items) VALUES (?,?,?,?)`)
        .bind(thread_id,JSON.stringify(agreed),consensus_summary,JSON.stringify(action_items)).run();
      return ok({success:true,thread_id,outcome,consensus:consensus_summary,action_items});
    }

    case 'check_consensus': {
      const {thread_id,threshold}=args as Record<string,string|number>;
      const msgs=await db.prepare('SELECT agent,role FROM discussion_message WHERE thread_id=?').bind(thread_id).all();
      const ar:{[k:string]:string[]}={};
      for(const m of msgs.results as Array<Record<string,unknown>>){
        const a=m.agent as string;
        if(!ar[a])ar[a]=[];
        ar[a].push(m.role as string);
      }
      const parts=Object.keys(ar);
      const agreed=parts.filter(a=>ar[a].includes('agree')||ar[a].includes('decide'));
      const disagreed=parts.filter(a=>ar[a].includes('disagree'));
      const pending=parts.filter(a=>!ar[a].includes('agree')&&!ar[a].includes('disagree')&&!ar[a].includes('decide'));
      const rate=parts.length>0?agreed.length/parts.length:0;
      const thr=(threshold as number)??0.75;
      return ok({thread_id,agreed,disagreed,pending,agree_rate:Math.round(rate*100)+'%',consensus_reached:rate>=thr&&disagreed.length===0,
        recommendation:rate>=thr&&disagreed.length===0?'close_discussion 호출':disagreed.length>0?'create_vote 호출':'pending AI 발언 대기'});
    }

    // ════════════════════════════════════════════════════════
    // § 투표 (일반)
    // ════════════════════════════════════════════════════════

    case 'create_vote': {
      const {thread_id,question,created_by}=args as Record<string,string>;
      const ttl=(args.ttl_minutes as number)??60;
      const r=await db.prepare(`INSERT INTO vote (thread_id,question,options,created_by,closes_at) VALUES (?,?,?,?,datetime('now','+'||?||' minutes'))`)
        .bind(thread_id,question,JSON.stringify(args.options??[]),created_by,ttl).run();
      await db.prepare(`UPDATE discussion_thread SET status='voting',updated_at=datetime('now') WHERE id=?`).bind(thread_id).run();
      return ok({success:true,vote_id:r.meta.last_row_id,question});
    }

    case 'cast_vote': {
      const {vote_id,agent,choice,reason}=args as Record<string,string|number>;
      const ex=await db.prepare('SELECT id FROM vote_ballot WHERE vote_id=? AND agent=?').bind(vote_id,agent).first();
      if(ex) return fail(`${agent} already voted`);
      const v=await db.prepare('SELECT options FROM vote WHERE id=?').bind(vote_id).first<{options:string}>();
      if(!v) return fail(`Vote not found: ${vote_id}`);
      const opts=JSON.parse(v.options);
      if(!opts.includes(choice)) return fail(`Invalid choice. Valid: ${opts.join(', ')}`);
      await db.prepare(`INSERT INTO vote_ballot (vote_id,agent,choice,reason) VALUES (?,?,?,?)`)
        .bind(vote_id,agent,choice,reason??null).run();
      return ok({success:true,vote_id,agent,choice});
    }

    case 'get_vote_result': {
      const vote_id=args.vote_id as number;
      const v=await db.prepare('SELECT * FROM vote WHERE id=?').bind(vote_id).first<Record<string,unknown>>();
      if(!v) return fail(`Vote not found: ${vote_id}`);
      const ballots=await db.prepare('SELECT * FROM vote_ballot WHERE vote_id=?').bind(vote_id).all();
      const opts=JSON.parse(v.options as string);
      const tally:Record<string,number>={};
      for(const o of opts)tally[o]=0;
      for(const b of ballots.results as Array<Record<string,unknown>>)
        tally[b.choice as string]=(tally[b.choice as string]??0)+1;
      const winner=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
      const allVoted=ballots.results.length>=4;
      if(args.close_if_all!==false&&allVoted&&v.status==='open')
        await db.prepare(`UPDATE vote SET status='closed',result=? WHERE id=?`).bind(winner[0],vote_id).run();
      return ok({vote_id,question:v.question,tally,winner:winner[0],total_votes:ballots.results.length,is_final:allVoted});
    }

    // ════════════════════════════════════════════════════════
    // § 핸드오프 / 잠금 / 파일 / 이벤트
    // ════════════════════════════════════════════════════════

    case 'log_handoff': {
      const {from_agent,to_agent,task_id,summary,instructions}=args as Record<string,string>;
      const r=await db.prepare(`INSERT INTO handoff_log (from_agent,to_agent,task_id,summary,changed_files,risks,instructions) VALUES (?,?,?,?,?,?,?)`)
        .bind(from_agent,to_agent,task_id,summary,JSON.stringify(args.changed_files??[]),JSON.stringify(args.risks??[]),instructions??null).run();
      await db.prepare(`UPDATE ai_state SET status='review',updated_at=datetime('now') WHERE agent=?`).bind(to_agent).run();
      return ok({success:true,handoff_id:r.meta.last_row_id,to_agent});
    }

    case 'get_handoff': {
      const {agent,status:hs}=args as Record<string,string>;
      const f=(hs??'pending')==='all'?'%':(hs??'pending');
      const rows=await db.prepare(`SELECT * FROM handoff_log WHERE to_agent=? AND status LIKE ? ORDER BY created_at DESC`).bind(agent,f).all();
      return ok({handoffs:rows.results});
    }

    case 'ack_handoff': {
      const {handoff_id,agent,accepted}=args as Record<string,string|boolean|number>;
      const s=accepted!==false?'acknowledged':'rejected';
      await db.prepare(`UPDATE handoff_log SET status=? WHERE id=? AND to_agent=?`).bind(s,handoff_id,agent).run();
      return ok({success:true,handoff_id,status:s});
    }

    case 'lock_task': {
      const {task_id,agent}=args as Record<string,string>;
      const ttl=(args.ttl_minutes as number)??30;
      const ex=await db.prepare(`SELECT locked_by FROM task_lock WHERE task_id=? AND expires_at>datetime('now')`).bind(task_id).first<{locked_by:string}>();
      if(ex&&ex.locked_by!==agent) return ok({locked:true,locked_by:ex.locked_by,acquired:false});
      await db.prepare(`INSERT OR REPLACE INTO task_lock (task_id,locked_by,locked_at,expires_at) VALUES (?,?,datetime('now'),datetime('now','+'||?||' minutes'))`)
        .bind(task_id,agent,ttl).run();
      return ok({locked:false,acquired:true,task_id,agent});
    }

    case 'unlock_task': {
      const {task_id,agent}=args as Record<string,string>;
      await db.prepare(`DELETE FROM task_lock WHERE task_id=? AND locked_by=?`).bind(task_id,agent).run();
      return ok({success:true,task_id});
    }

    case 'record_file_change': {
      const {agent,task_id,file_path,change_type,summary,diff_snippet}=args as Record<string,string>;
      await db.prepare(`INSERT INTO file_changes (agent,task_id,file_path,change_type,summary,diff_snippet) VALUES (?,?,?,?,?,?)`)
        .bind(agent,task_id??null,file_path,change_type,summary,diff_snippet??null).run();
      return ok({success:true,file_path,change_type});
    }

    case 'broadcast_event': {
      const {event_type,agent,task_id,thread_id,session_id,message,payload}=args as Record<string,unknown>;
      await db.prepare(`INSERT INTO event_log (event_type,agent,task_id,thread_id,session_id,payload) VALUES (?,?,?,?,?,?)`)
        .bind(event_type,agent,task_id??null,thread_id??null,session_id??null,JSON.stringify({message,...(payload as object??{})})).run();
      return ok({success:true});
    }

    case 'get_events': {
      const {event_type,agent,session_id,limit}=args as Record<string,string|number>;
      let q='SELECT * FROM event_log WHERE 1=1';const b:(string|number)[]=[];
      if(event_type&&event_type!=='all'){q+=' AND event_type=?';b.push(event_type as string);}
      if(agent&&agent!=='all'){q+=' AND agent=?';b.push(agent as string);}
      if(session_id){q+=' AND session_id=?';b.push(session_id as string);}
      q+=' ORDER BY created_at DESC LIMIT ?';b.push((limit as number)??30);
      const rows=await db.prepare(q).bind(...b).all();
      return ok({events:rows.results});
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}
