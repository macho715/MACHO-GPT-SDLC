/**
 * MCP DEV HUB v2 — Tool 정의 + 핸들러
 * ★ AI 간 토론 / 투표 / 컨센서스 레이어 포함
 * 외부 의존성 없음. D1 DB만 사용.
 */

// ─── 헬퍼 ─────────────────────────────────────────────────────
const ok = (data: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});
const err = (msg: string) => ({
  content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
  isError: true,
});

async function nextId(db: D1Database, table: string, prefix: string): Promise<string> {
  const row = await db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).first<{ cnt: number }>();
  return `${prefix}-${String((row?.cnt ?? 0) + 1).padStart(3, '0')}`;
}

// ─── Tool 정의 ────────────────────────────────────────────────
export const tools = [
  // ════════════════════════════════════════════════════════════
  // § 1. 에이전트 상태
  // ════════════════════════════════════════════════════════════

  {
    name: 'get_dashboard',
    description:
      '전체 AI 상태 + 진행 태스크 + 활성 토론 + 대기 투표를 한 번에 조회합니다. 작업 시작 전 반드시 호출하세요.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'get_state',
    description: 'AI 에이전트의 현재 상태를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax', 'all'] },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_state',
    description: '내 작업 상태를 업데이트합니다. working / reviewing / discussing / done 등.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'status'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        status: {
          type: 'string',
          enum: ['idle', 'working', 'blocked', 'review', 'discussing', 'done'],
        },
        task_id: { type: 'string' },
        task_title: { type: 'string' },
        current_file: { type: 'string' },
        progress: { type: 'number', minimum: 0, maximum: 100 },
        note: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },

  // ════════════════════════════════════════════════════════════
  // § 2. 태스크 관리
  // ════════════════════════════════════════════════════════════

  {
    name: 'create_task',
    description: '새 태스크를 생성합니다.',
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
        created_by: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'list_tasks',
    description: '태스크 목록을 조회합니다.',
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
        limit: { type: 'number', default: 20 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'update_task',
    description: '태스크 상태/담당자를 변경합니다.',
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

  // ════════════════════════════════════════════════════════════
  // § 3. ★ 토론 (Discussion)
  // ════════════════════════════════════════════════════════════

  {
    name: 'start_discussion',
    description:
      '이슈/태스크에 대한 AI 토론 스레드를 시작합니다. 의견이 나뉘거나 설계 결정이 필요할 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'title', 'initiated_by', 'opening_message'],
      properties: {
        task_id: { type: 'string', description: '토론 대상 태스크 ID' },
        title: { type: 'string', description: '토론 제목 (예: "API 구조 결정")' },
        topic: { type: 'string', description: '세부 의제' },
        initiated_by: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'minimax'],
          description: '토론 시작 AI',
        },
        opening_message: { type: 'string', description: '첫 번째 발언 (문제 제기 또는 제안)' },
        invite_agents: {
          type: 'array',
          items: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
          description: '토론에 초대할 AI 목록',
        },
      },
    },
    annotations: { readOnlyHint: false },
  },

  {
    name: 'post_message',
    description: '토론 스레드에 메시지를 발언합니다. role로 발언 유형을 명시하세요.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'agent', 'role', 'content'],
      properties: {
        thread_id: { type: 'string', description: '토론 스레드 ID' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        role: {
          type: 'string',
          enum: ['propose', 'agree', 'disagree', 'question', 'clarify', 'summarize', 'decide'],
          description: [
            'propose  = 새 제안',
            'agree    = 동의',
            'disagree = 반대 (반드시 근거 포함)',
            'question = 질문/확인 요청',
            'clarify  = 명확화',
            'summarize= 중간 정리',
            'decide   = 최종 결정 선언',
          ].join(' | '),
        },
        content: { type: 'string', description: '발언 내용' },
        reply_to: { type: 'number', description: '특정 메시지 ID에 대한 답변 (선택)' },
        evidence: {
          type: 'array',
          items: { type: 'string' },
          description: '근거 자료 (파일경로, 코드스니펫 등)',
        },
        confidence: { type: 'number', minimum: 0, maximum: 1, default: 0.8, description: '확신도' },
      },
    },
    annotations: { readOnlyHint: false },
  },

  {
    name: 'get_discussion',
    description: '토론 스레드 전체 내용을 조회합니다. 참여 전 반드시 읽으세요.',
    inputSchema: {
      type: 'object',
      required: ['thread_id'],
      properties: {
        thread_id: { type: 'string' },
        limit: { type: 'number', default: 50, description: '최근 메시지 수' },
      },
    },
    annotations: { readOnlyHint: true },
  },

  {
    name: 'list_discussions',
    description: '태스크의 토론 목록을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        status: {
          type: 'string',
          enum: ['open', 'voting', 'consensus', 'closed', 'all'],
          default: 'open',
        },
        limit: { type: 'number', default: 10 },
      },
    },
    annotations: { readOnlyHint: true },
  },

  {
    name: 'close_discussion',
    description: '토론을 종료하고 컨센서스를 기록합니다.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'agent', 'consensus_summary'],
      properties: {
        thread_id: { type: 'string' },
        agent: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'minimax'],
          description: '종료 선언 AI',
        },
        consensus_summary: { type: 'string', description: '최종 합의 내용' },
        action_items: {
          type: 'array',
          items: { type: 'string' },
          description: '결정된 액션 아이템 목록',
        },
        outcome: {
          type: 'string',
          enum: ['consensus', 'no_consensus', 'deferred'],
          default: 'consensus',
        },
      },
    },
    annotations: { readOnlyHint: false },
  },

  // ════════════════════════════════════════════════════════════
  // § 4. ★ 투표 (Voting)
  // ════════════════════════════════════════════════════════════

  {
    name: 'create_vote',
    description: '의견 충돌 시 투표를 생성합니다. 토론에서 합의가 안 될 때 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['thread_id', 'question', 'options', 'created_by'],
      properties: {
        thread_id: { type: 'string', description: '연결된 토론 스레드 ID' },
        question: { type: 'string', description: '투표 질문' },
        options: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          description: '선택지 목록 (최소 2개)',
        },
        created_by: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        ttl_minutes: { type: 'number', default: 60, description: '투표 마감 시간 (분)' },
      },
    },
    annotations: { readOnlyHint: false },
  },

  {
    name: 'cast_vote',
    description: '투표에 참여합니다. AI당 1표만 허용됩니다.',
    inputSchema: {
      type: 'object',
      required: ['vote_id', 'agent', 'choice'],
      properties: {
        vote_id: { type: 'number', description: '투표 ID' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        choice: { type: 'string', description: '선택한 옵션 (options 중 하나)' },
        reason: { type: 'string', description: '선택 이유 (권장)' },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: false },
  },

  {
    name: 'get_vote_result',
    description: '투표 현황과 결과를 조회합니다.',
    inputSchema: {
      type: 'object',
      required: ['vote_id'],
      properties: {
        vote_id: { type: 'number' },
        close_if_all: { type: 'boolean', default: true, description: '전원 투표 시 자동 마감' },
      },
    },
    annotations: { readOnlyHint: false },
  },

  // ════════════════════════════════════════════════════════════
  // § 5. ★ 컨센서스 (Consensus)
  // ════════════════════════════════════════════════════════════

  {
    name: 'check_consensus',
    description: '현재 토론의 동의/반대 현황을 분석하고 컨센서스 달성 여부를 반환합니다.',
    inputSchema: {
      type: 'object',
      required: ['thread_id'],
      properties: {
        thread_id: { type: 'string' },
        threshold: {
          type: 'number',
          default: 0.75,
          description: '컨센서스 기준 동의율 (기본 75%)',
        },
      },
    },
    annotations: { readOnlyHint: true },
  },

  {
    name: 'get_consensus_log',
    description: '태스크의 모든 합의 이력을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        thread_id: { type: 'string' },
        limit: { type: 'number', default: 10 },
      },
    },
    annotations: { readOnlyHint: true },
  },

  // ════════════════════════════════════════════════════════════
  // § 6. 핸드오프 / 잠금 / 이벤트 (v1 유지)
  // ════════════════════════════════════════════════════════════

  {
    name: 'log_handoff',
    description: 'AI 간 작업을 인계합니다.',
    inputSchema: {
      type: 'object',
      required: ['from_agent', 'to_agent', 'task_id', 'summary'],
      properties: {
        from_agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        to_agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        task_id: { type: 'string' },
        summary: { type: 'string' },
        changed_files: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        instructions: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_handoff',
    description: '나에게 온 핸드오프를 조회합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        status: { type: 'string', enum: ['pending', 'acknowledged', 'all'], default: 'pending' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'ack_handoff',
    description: '핸드오프 수신 확인 처리합니다.',
    inputSchema: {
      type: 'object',
      required: ['handoff_id', 'agent'],
      properties: {
        handoff_id: { type: 'number' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        accepted: { type: 'boolean', default: true },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  {
    name: 'lock_task',
    description: '태스크를 잠가 충돌을 방지합니다.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'agent'],
      properties: {
        task_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        ttl_minutes: { type: 'number', default: 30 },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'unlock_task',
    description: '태스크 잠금을 해제합니다.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'agent'],
      properties: {
        task_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  {
    name: 'record_file_change',
    description: '파일 변경 사항을 기록합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'file_path', 'change_type', 'summary'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        task_id: { type: 'string' },
        file_path: { type: 'string' },
        change_type: { type: 'string', enum: ['create', 'modify', 'delete'] },
        summary: { type: 'string' },
        diff_snippet: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'broadcast_event',
    description: '모든 AI에게 알림을 브로드캐스트합니다.',
    inputSchema: {
      type: 'object',
      required: ['event_type', 'agent', 'message'],
      properties: {
        event_type: {
          type: 'string',
          enum: ['alert', 'info', 'warning', 'state_change', 'task_update', 'discussion'],
        },
        agent: { type: 'string' },
        task_id: { type: 'string' },
        thread_id: { type: 'string' },
        message: { type: 'string' },
        payload: { type: 'object' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_events',
    description: '이벤트 로그를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          enum: ['alert', 'info', 'warning', 'state_change', 'task_update', 'discussion', 'all'],
          default: 'all',
        },
        agent: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'minimax', 'all'],
          default: 'all',
        },
        limit: { type: 'number', default: 30 },
      },
    },
    annotations: { readOnlyHint: true },
  },
];

// ─── Tool 핸들러 ──────────────────────────────────────────────
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  db: D1Database
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  switch (name) {
    // ── get_dashboard ──────────────────────────────────────
    case 'get_dashboard': {
      const [agents, tasks, discussions, pendingVotes, handoffs, events] = await Promise.all([
        db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all(),
        db
          .prepare("SELECT * FROM tasks WHERE status != 'done' ORDER BY created_at DESC LIMIT 10")
          .all(),
        db
          .prepare(
            "SELECT * FROM discussion_thread WHERE status IN ('open','voting') ORDER BY updated_at DESC LIMIT 5"
          )
          .all(),
        db
          .prepare(
            "SELECT v.*, COUNT(b.id) as ballot_count FROM vote v LEFT JOIN vote_ballot b ON v.id=b.vote_id WHERE v.status='open' GROUP BY v.id"
          )
          .all(),
        db
          .prepare(
            "SELECT * FROM handoff_log WHERE status='pending' ORDER BY created_at DESC LIMIT 5"
          )
          .all(),
        db.prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT 15').all(),
      ]);
      return ok({
        snapshot_at: new Date().toISOString(),
        agents: agents.results,
        active_tasks: tasks.results,
        active_discussions: discussions.results,
        pending_votes: pendingVotes.results,
        pending_handoffs: handoffs.results,
        recent_events: events.results,
      });
    }

    // ── get_state ──────────────────────────────────────────
    case 'get_state': {
      const agent = (args.agent as string) ?? 'all';
      const rows =
        agent === 'all'
          ? await db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all()
          : await db.prepare('SELECT * FROM ai_state WHERE agent = ?').bind(agent).all();
      return ok({ agents: rows.results });
    }

    // ── update_state ───────────────────────────────────────
    case 'update_state': {
      const { agent, status, task_id, task_title, current_file, progress, note } = args as Record<
        string,
        string | number
      >;
      await db
        .prepare(
          `
        INSERT INTO ai_state (agent, status, task_id, task_title, current_file, progress, note, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(agent) DO UPDATE SET
          status=excluded.status, task_id=COALESCE(excluded.task_id, task_id),
          task_title=COALESCE(excluded.task_title, task_title),
          current_file=COALESCE(excluded.current_file, current_file),
          progress=COALESCE(excluded.progress, progress),
          note=COALESCE(excluded.note, note), updated_at=excluded.updated_at
      `
        )
        .bind(
          agent,
          status,
          task_id ?? null,
          task_title ?? null,
          current_file ?? null,
          progress ?? 0,
          note ?? null
        )
        .run();
      await db
        .prepare(
          `INSERT INTO event_log (event_type, agent, task_id, payload) VALUES ('state_change',?,?,?)`
        )
        .bind(agent, task_id ?? null, JSON.stringify({ status, progress }))
        .run();
      return ok({ success: true, agent, status });
    }

    // ── create_task ────────────────────────────────────────
    case 'create_task': {
      const id = await nextId(db, 'tasks', 'TASK');
      const { title, description, priority, assigned_to, created_by } = args as Record<
        string,
        string
      >;
      await db
        .prepare(
          `INSERT INTO tasks (id,title,description,priority,assigned_to,created_by) VALUES (?,?,?,?,?,?)`
        )
        .bind(
          id,
          title,
          description ?? null,
          priority ?? 'normal',
          assigned_to ?? null,
          created_by ?? 'human'
        )
        .run();
      return ok({ success: true, task_id: id, title });
    }

    // ── list_tasks ─────────────────────────────────────────
    case 'list_tasks': {
      const status = (args.status as string) ?? 'all';
      const assigned = (args.assigned_to as string) ?? 'all';
      const limit = (args.limit as number) ?? 20;
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
      q += ' ORDER BY created_at DESC LIMIT ?';
      b.push(limit);
      const rows = await db
        .prepare(q)
        .bind(...b)
        .all();
      return ok({ tasks: rows.results, count: rows.results.length });
    }

    // ── update_task ────────────────────────────────────────
    case 'update_task': {
      const { task_id, status, assigned_to, priority } = args as Record<string, string>;
      await db
        .prepare(
          `UPDATE tasks SET status=COALESCE(?,status), assigned_to=COALESCE(?,assigned_to), priority=COALESCE(?,priority), updated_at=datetime('now') WHERE id=?`
        )
        .bind(status ?? null, assigned_to ?? null, priority ?? null, task_id)
        .run();
      return ok({ success: true, task_id });
    }

    // ════════════════════════════════════════════════════════
    // ★ 토론 핸들러
    // ════════════════════════════════════════════════════════

    // ── start_discussion ───────────────────────────────────
    case 'start_discussion': {
      const { task_id, title, topic, initiated_by, opening_message } = args as Record<
        string,
        string
      >;
      const invite_agents = (args.invite_agents as string[]) ?? [];
      const id = await nextId(db, 'discussion_thread', 'DISC');

      await db
        .prepare(
          `INSERT INTO discussion_thread (id,task_id,title,topic,initiated_by) VALUES (?,?,?,?,?)`
        )
        .bind(id, task_id, title, topic ?? null, initiated_by)
        .run();

      // 첫 메시지 등록
      await db
        .prepare(
          `INSERT INTO discussion_message (thread_id,agent,role,content,confidence) VALUES (?,?,?,?,?)`
        )
        .bind(id, initiated_by, 'propose', opening_message, 0.9)
        .run();

      // 상태를 discussing으로
      await db
        .prepare(
          `UPDATE ai_state SET status='discussing', task_id=?, updated_at=datetime('now') WHERE agent=?`
        )
        .bind(task_id, initiated_by)
        .run();

      // 초대된 AI들에게 이벤트
      for (const agent of invite_agents) {
        await db
          .prepare(
            `INSERT INTO event_log (event_type,agent,task_id,thread_id,payload) VALUES ('discussion',?,?,?,?)`
          )
          .bind(
            agent,
            task_id,
            id,
            JSON.stringify({ action: 'invited', thread: id, title, from: initiated_by })
          )
          .run();
      }

      await db
        .prepare(
          `INSERT INTO event_log (event_type,agent,task_id,thread_id,payload) VALUES ('discussion',?,?,?,?)`
        )
        .bind(initiated_by, task_id, id, JSON.stringify({ action: 'started', title }))
        .run();

      return ok({ success: true, thread_id: id, title, task_id, invited: invite_agents });
    }

    // ── post_message ───────────────────────────────────────
    case 'post_message': {
      const { thread_id, agent, role, content, reply_to, confidence } = args as Record<
        string,
        string | number
      >;
      const evidence = JSON.stringify(args.evidence ?? []);

      // 스레드 존재 확인
      const thread = await db
        .prepare('SELECT * FROM discussion_thread WHERE id=?')
        .bind(thread_id)
        .first();
      if (!thread) return err(`Thread not found: ${thread_id}`);

      const result = await db
        .prepare(
          `INSERT INTO discussion_message (thread_id,agent,role,content,reply_to,evidence,confidence) VALUES (?,?,?,?,?,?,?)`
        )
        .bind(thread_id, agent, role, content, reply_to ?? null, evidence, confidence ?? 0.8)
        .run();

      // 스레드 업데이트 시간 갱신
      await db
        .prepare(`UPDATE discussion_thread SET updated_at=datetime('now') WHERE id=?`)
        .bind(thread_id)
        .run();

      // 에이전트 상태 반영
      await db
        .prepare(
          `UPDATE ai_state SET status='discussing', updated_at=datetime('now') WHERE agent=?`
        )
        .bind(agent)
        .run();

      // 이벤트 브로드캐스트
      await db
        .prepare(
          `INSERT INTO event_log (event_type,agent,thread_id,payload) VALUES ('discussion',?,?,?)`
        )
        .bind(
          agent,
          thread_id,
          JSON.stringify({ action: 'message', role, preview: (content as string).slice(0, 80) })
        )
        .run();

      return ok({ success: true, message_id: result.meta.last_row_id, thread_id, agent, role });
    }

    // ── get_discussion ─────────────────────────────────────
    case 'get_discussion': {
      const { thread_id, limit } = args as Record<string, string | number>;
      const thread = await db
        .prepare('SELECT * FROM discussion_thread WHERE id=?')
        .bind(thread_id)
        .first();
      if (!thread) return err(`Thread not found: ${thread_id}`);

      const messages = await db
        .prepare(
          `
        SELECT m.*, CASE WHEN m.reply_to IS NOT NULL THEN
          (SELECT content FROM discussion_message WHERE id=m.reply_to) ELSE NULL END as reply_to_content
        FROM discussion_message m WHERE m.thread_id=? ORDER BY m.created_at ASC LIMIT ?
      `
        )
        .bind(thread_id, (limit as number) ?? 50)
        .all();

      const votes = await db
        .prepare(
          `
        SELECT v.*, GROUP_CONCAT(b.agent||':'||b.choice, ', ') as ballots
        FROM vote v LEFT JOIN vote_ballot b ON v.id=b.vote_id
        WHERE v.thread_id=? GROUP BY v.id
      `
        )
        .bind(thread_id)
        .all();

      const consensus = await db
        .prepare('SELECT * FROM consensus_log WHERE thread_id=? ORDER BY created_at DESC LIMIT 1')
        .bind(thread_id)
        .first();

      return ok({
        thread,
        messages: messages.results.map((m: Record<string, unknown>) => ({
          ...m,
          evidence: JSON.parse((m.evidence as string) ?? '[]'),
        })),
        votes: votes.results,
        consensus: consensus ?? null,
        message_count: messages.results.length,
      });
    }

    // ── list_discussions ───────────────────────────────────
    case 'list_discussions': {
      const { task_id, status, limit } = args as Record<string, string | number>;
      let q = 'SELECT * FROM discussion_thread WHERE 1=1';
      const b: (string | number)[] = [];
      if (task_id) {
        q += ' AND task_id=?';
        b.push(task_id as string);
      }
      if (status && status !== 'all') {
        q += ' AND status=?';
        b.push(status as string);
      }
      q += ' ORDER BY updated_at DESC LIMIT ?';
      b.push((limit as number) ?? 10);
      const rows = await db
        .prepare(q)
        .bind(...b)
        .all();
      return ok({ discussions: rows.results, count: rows.results.length });
    }

    // ── close_discussion ───────────────────────────────────
    case 'close_discussion': {
      const { thread_id, agent, consensus_summary, outcome } = args as Record<string, string>;
      const action_items = (args.action_items as string[]) ?? [];

      // 참여 AI 집계
      const participants = await db
        .prepare(
          `
        SELECT DISTINCT agent FROM discussion_message WHERE thread_id=?
      `
        )
        .bind(thread_id)
        .all();

      const agreed = participants.results.map((r: Record<string, unknown>) => r.agent as string);

      await db
        .prepare(
          `UPDATE discussion_thread SET status=?, consensus=?, consensus_at=datetime('now'), updated_at=datetime('now') WHERE id=?`
        )
        .bind(outcome === 'consensus' ? 'consensus' : 'closed', consensus_summary, thread_id)
        .run();

      await db
        .prepare(
          `INSERT INTO consensus_log (thread_id,agreed_by,summary,action_items) VALUES (?,?,?,?)`
        )
        .bind(thread_id, JSON.stringify(agreed), consensus_summary, JSON.stringify(action_items))
        .run();

      await db
        .prepare(
          `INSERT INTO event_log (event_type,agent,thread_id,payload) VALUES ('discussion',?,?,?)`
        )
        .bind(agent, thread_id, JSON.stringify({ action: 'closed', outcome, consensus_summary }))
        .run();

      return ok({ success: true, thread_id, outcome, consensus: consensus_summary, action_items });
    }

    // ════════════════════════════════════════════════════════
    // ★ 투표 핸들러
    // ════════════════════════════════════════════════════════

    // ── create_vote ────────────────────────────────────────
    case 'create_vote': {
      const { thread_id, question, created_by } = args as Record<string, string>;
      const options = JSON.stringify(args.options ?? []);
      const ttl = (args.ttl_minutes as number) ?? 60;

      const result = await db
        .prepare(
          `
        INSERT INTO vote (thread_id,question,options,created_by,closes_at)
        VALUES (?,?,?,?,datetime('now','+'||?||' minutes'))
      `
        )
        .bind(thread_id, question, options, created_by, ttl)
        .run();

      // 스레드 상태를 voting으로
      await db
        .prepare(
          `UPDATE discussion_thread SET status='voting', updated_at=datetime('now') WHERE id=?`
        )
        .bind(thread_id)
        .run();

      await db
        .prepare(
          `INSERT INTO event_log (event_type,agent,thread_id,payload) VALUES ('discussion',?,?,?)`
        )
        .bind(created_by, thread_id, JSON.stringify({ action: 'vote_created', question }))
        .run();

      return ok({
        success: true,
        vote_id: result.meta.last_row_id,
        question,
        options: args.options,
      });
    }

    // ── cast_vote ──────────────────────────────────────────
    case 'cast_vote': {
      const { vote_id, agent, choice, reason } = args as Record<string, string | number>;

      // 중복 투표 방지
      const existing = await db
        .prepare('SELECT id FROM vote_ballot WHERE vote_id=? AND agent=?')
        .bind(vote_id, agent)
        .first();
      if (existing) return err(`${agent} already voted in vote_id ${vote_id}`);

      // 유효한 선택지 검증
      const vote = await db
        .prepare('SELECT options FROM vote WHERE id=?')
        .bind(vote_id)
        .first<{ options: string }>();
      if (!vote) return err(`Vote not found: ${vote_id}`);
      const validOptions = JSON.parse(vote.options);
      if (!validOptions.includes(choice))
        return err(`Invalid choice. Valid: ${validOptions.join(', ')}`);

      await db
        .prepare(`INSERT INTO vote_ballot (vote_id,agent,choice,reason) VALUES (?,?,?,?)`)
        .bind(vote_id, agent, choice, reason ?? null)
        .run();

      await db
        .prepare(`INSERT INTO event_log (event_type,agent,payload) VALUES ('discussion',?,?)`)
        .bind(agent, JSON.stringify({ action: 'voted', vote_id, choice }))
        .run();

      return ok({ success: true, vote_id, agent, choice });
    }

    // ── get_vote_result ────────────────────────────────────
    case 'get_vote_result': {
      const vote_id = args.vote_id as number;
      const close_if_all = args.close_if_all !== false;

      const vote = await db
        .prepare('SELECT * FROM vote WHERE id=?')
        .bind(vote_id)
        .first<Record<string, unknown>>();
      if (!vote) return err(`Vote not found: ${vote_id}`);

      const ballots = await db
        .prepare('SELECT * FROM vote_ballot WHERE vote_id=?')
        .bind(vote_id)
        .all();
      const options = JSON.parse(vote.options as string);

      // 집계
      const tally: Record<string, number> = {};
      for (const opt of options) tally[opt] = 0;
      for (const b of ballots.results as Array<Record<string, unknown>>) {
        tally[b.choice as string] = (tally[b.choice as string] ?? 0) + 1;
      }

      const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
      const total = ballots.results.length;
      const allVoted = total >= 4; // 4개 AI 기준

      // 전원 투표 시 자동 마감
      if (close_if_all && allVoted && vote.status === 'open') {
        await db
          .prepare(`UPDATE vote SET status='closed', result=? WHERE id=?`)
          .bind(winner[0], vote_id)
          .run();
      }

      return ok({
        vote_id,
        question: vote.question,
        status: allVoted && close_if_all ? 'closed' : vote.status,
        tally,
        winner: winner[0],
        winner_count: winner[1],
        total_votes: total,
        ballots: ballots.results,
        is_final: allVoted || vote.status === 'closed',
      });
    }

    // ════════════════════════════════════════════════════════
    // ★ 컨센서스 핸들러
    // ════════════════════════════════════════════════════════

    // ── check_consensus ────────────────────────────────────
    case 'check_consensus': {
      const thread_id = args.thread_id as string;
      const threshold = (args.threshold as number) ?? 0.75;

      const messages = await db
        .prepare(
          `
        SELECT agent, role FROM discussion_message WHERE thread_id=?
      `
        )
        .bind(thread_id)
        .all();

      const agentRoles: Record<string, string[]> = {};
      for (const m of messages.results as Array<Record<string, unknown>>) {
        const agent = m.agent as string;
        if (!agentRoles[agent]) agentRoles[agent] = [];
        agentRoles[agent].push(m.role as string);
      }

      const participants = Object.keys(agentRoles);
      const agreed = participants.filter(
        (a) => agentRoles[a].includes('agree') || agentRoles[a].includes('decide')
      );
      const disagreed = participants.filter((a) => agentRoles[a].includes('disagree'));
      const pending = participants.filter(
        (a) =>
          !agentRoles[a].includes('agree') &&
          !agentRoles[a].includes('disagree') &&
          !agentRoles[a].includes('decide')
      );

      const agreeRate = participants.length > 0 ? agreed.length / participants.length : 0;
      const reached = agreeRate >= threshold && disagreed.length === 0;

      return ok({
        thread_id,
        participants,
        agreed,
        disagreed,
        pending,
        agree_rate: Math.round(agreeRate * 100) + '%',
        threshold: Math.round(threshold * 100) + '%',
        consensus_reached: reached,
        recommendation: reached
          ? 'close_discussion 호출하여 합의 기록'
          : disagreed.length > 0
            ? 'create_vote 호출하여 투표로 결정'
            : 'pending 에이전트의 발언 대기',
      });
    }

    // ── get_consensus_log ──────────────────────────────────
    case 'get_consensus_log': {
      const { task_id, thread_id, limit } = args as Record<string, string | number>;
      let q = `
        SELECT c.*, t.title as thread_title, t.task_id
        FROM consensus_log c
        JOIN discussion_thread t ON c.thread_id = t.id
        WHERE 1=1
      `;
      const b: (string | number)[] = [];
      if (task_id) {
        q += ' AND t.task_id=?';
        b.push(task_id as string);
      }
      if (thread_id) {
        q += ' AND c.thread_id=?';
        b.push(thread_id as string);
      }
      q += ' ORDER BY c.created_at DESC LIMIT ?';
      b.push((limit as number) ?? 10);

      const rows = await db
        .prepare(q)
        .bind(...b)
        .all();
      return ok({
        consensus_history: rows.results.map((r: Record<string, unknown>) => ({
          ...r,
          agreed_by: JSON.parse((r.agreed_by as string) ?? '[]'),
          disagreed_by: JSON.parse((r.disagreed_by as string) ?? '[]'),
          action_items: JSON.parse((r.action_items as string) ?? '[]'),
        })),
      });
    }

    // ── log_handoff ────────────────────────────────────────
    case 'log_handoff': {
      const { from_agent, to_agent, task_id, summary, instructions } = args as Record<
        string,
        string
      >;
      const result = await db
        .prepare(
          `INSERT INTO handoff_log (from_agent,to_agent,task_id,summary,changed_files,risks,instructions) VALUES (?,?,?,?,?,?,?)`
        )
        .bind(
          from_agent,
          to_agent,
          task_id,
          summary,
          JSON.stringify(args.changed_files ?? []),
          JSON.stringify(args.risks ?? []),
          instructions ?? null
        )
        .run();
      await db
        .prepare(`UPDATE ai_state SET status='review', updated_at=datetime('now') WHERE agent=?`)
        .bind(to_agent)
        .run();
      return ok({ success: true, handoff_id: result.meta.last_row_id, to_agent });
    }

    // ── get_handoff ────────────────────────────────────────
    case 'get_handoff': {
      const { agent, status: hStatus } = args as Record<string, string>;
      const filter = (hStatus ?? 'pending') === 'all' ? '%' : (hStatus ?? 'pending');
      const rows = await db
        .prepare(
          `SELECT * FROM handoff_log WHERE to_agent=? AND status LIKE ? ORDER BY created_at DESC`
        )
        .bind(agent, filter)
        .all();
      return ok({ handoffs: rows.results });
    }

    // ── ack_handoff ────────────────────────────────────────
    case 'ack_handoff': {
      const { handoff_id, agent, accepted } = args as Record<string, string | boolean | number>;
      const s = accepted !== false ? 'acknowledged' : 'rejected';
      await db
        .prepare(`UPDATE handoff_log SET status=? WHERE id=? AND to_agent=?`)
        .bind(s, handoff_id, agent)
        .run();
      return ok({ success: true, handoff_id, status: s });
    }

    // ── lock_task ──────────────────────────────────────────
    case 'lock_task': {
      const { task_id, agent } = args as Record<string, string>;
      const ttl = (args.ttl_minutes as number) ?? 30;
      const existing = await db
        .prepare(`SELECT locked_by FROM task_lock WHERE task_id=? AND expires_at>datetime('now')`)
        .bind(task_id)
        .first<{ locked_by: string }>();
      if (existing && existing.locked_by !== agent)
        return ok({ locked: true, locked_by: existing.locked_by, acquired: false });
      await db
        .prepare(
          `INSERT OR REPLACE INTO task_lock (task_id,locked_by,locked_at,expires_at) VALUES (?,?,datetime('now'),datetime('now','+'||?||' minutes'))`
        )
        .bind(task_id, agent, ttl)
        .run();
      return ok({ locked: false, acquired: true, task_id, agent });
    }

    // ── unlock_task ────────────────────────────────────────
    case 'unlock_task': {
      const { task_id, agent } = args as Record<string, string>;
      await db
        .prepare(`DELETE FROM task_lock WHERE task_id=? AND locked_by=?`)
        .bind(task_id, agent)
        .run();
      return ok({ success: true, task_id });
    }

    // ── record_file_change ─────────────────────────────────
    case 'record_file_change': {
      const { agent, task_id, file_path, change_type, summary, diff_snippet } = args as Record<
        string,
        string
      >;
      await db
        .prepare(
          `INSERT INTO file_changes (agent,task_id,file_path,change_type,summary,diff_snippet) VALUES (?,?,?,?,?,?)`
        )
        .bind(agent, task_id ?? null, file_path, change_type, summary, diff_snippet ?? null)
        .run();
      return ok({ success: true, file_path, change_type });
    }

    // ── broadcast_event ────────────────────────────────────
    case 'broadcast_event': {
      const { event_type, agent, task_id, thread_id, message, payload } = args as Record<
        string,
        unknown
      >;
      await db
        .prepare(
          `INSERT INTO event_log (event_type,agent,task_id,thread_id,payload) VALUES (?,?,?,?,?)`
        )
        .bind(
          event_type,
          agent,
          task_id ?? null,
          thread_id ?? null,
          JSON.stringify({ message, ...((payload as object) ?? {}) })
        )
        .run();
      return ok({ success: true });
    }

    // ── get_events ─────────────────────────────────────────
    case 'get_events': {
      const { event_type, agent, limit } = args as Record<string, string | number>;
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
      q += ' ORDER BY created_at DESC LIMIT ?';
      b.push((limit as number) ?? 30);
      const rows = await db
        .prepare(q)
        .bind(...b)
        .all();
      return ok({ events: rows.results });
    }

    default:
      return err(`Unknown tool: ${name}`);
  }
}
