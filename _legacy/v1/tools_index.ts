/**
 * MCP DEV HUB — Tool 정의 + 핸들러
 * 외부 의존성 없음. D1 DB만 사용.
 */

// ─── 타입 ─────────────────────────────────────────────────────
type Agent = 'codex' | 'claude' | 'opencode' | 'minimax';
type TaskStatus = 'open' | 'in_progress' | 'review' | 'done' | 'blocked';
type AgentStatus = 'idle' | 'working' | 'blocked' | 'review' | 'done';

// ─── Tool 정의 목록 (MCP tools/list 응답) ────────────────────
export const tools = [
  // ── 상태 조회 ────────────────────────────────────────────
  {
    name: 'get_state',
    description: '모든 AI 에이전트의 현재 작업 상태를 조회합니다. 작업 시작 전 반드시 호출하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['codex', 'claude', 'opencode', 'minimax', 'all'],
          description: '조회할 에이전트. all이면 전체 반환',
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },

  // ── 상태 업데이트 ─────────────────────────────────────────
  {
    name: 'update_state',
    description: '작업 시작/완료/차단 시 에이전트 상태를 업데이트합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'status'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        status: { type: 'string', enum: ['idle', 'working', 'blocked', 'review', 'done'] },
        task_id: { type: 'string', description: '작업 중인 태스크 ID' },
        task_title: { type: 'string', description: '태스크 제목' },
        current_file: { type: 'string', description: '현재 수정 중인 파일 경로' },
        progress: { type: 'number', minimum: 0, maximum: 100, description: '진행률 0~100' },
        note: { type: 'string', description: '자유 메모' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  // ── 태스크 생성 (Linear 대체) ──────────────────────────────
  {
    name: 'create_task',
    description: '새 태스크를 생성합니다. Linear 없이 MCP 내부에서 관리됩니다.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string', description: '태스크 제목' },
        description: { type: 'string', description: '상세 설명' },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high', 'critical'],
          default: 'normal',
        },
        assigned_to: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        created_by: { type: 'string', description: '생성자 (AI 이름 또는 human)' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },

  // ── 태스크 목록 조회 ──────────────────────────────────────
  {
    name: 'list_tasks',
    description: '태스크 목록을 조회합니다. 상태/담당자로 필터링 가능.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'in_progress', 'review', 'done', 'blocked', 'all'],
        },
        assigned_to: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax', 'all'] },
        limit: { type: 'number', default: 20 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },

  // ── 태스크 상태 업데이트 ──────────────────────────────────
  {
    name: 'update_task',
    description: '태스크 상태/담당자/우선순위를 변경합니다.',
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
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  // ── 핸드오프 (AI 간 인수인계) ─────────────────────────────
  {
    name: 'log_handoff',
    description: 'AI 간 작업을 인계합니다. 변경 파일, 리스크, 지시사항을 포함하세요.',
    inputSchema: {
      type: 'object',
      required: ['from_agent', 'to_agent', 'task_id', 'summary'],
      properties: {
        from_agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        to_agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        task_id: { type: 'string' },
        summary: { type: 'string', description: '작업 내용 요약' },
        changed_files: {
          type: 'array',
          items: { type: 'string' },
          description: '변경된 파일 경로 목록',
        },
        risks: {
          type: 'array',
          items: { type: 'string' },
          description: '미결 리스크 목록',
        },
        instructions: { type: 'string', description: '수신 AI에게 전달할 지시사항' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },

  // ── 핸드오프 수신 조회 ────────────────────────────────────
  {
    name: 'get_handoff',
    description: '나에게 전달된 핸드오프를 조회합니다. 작업 시작 전 반드시 확인하세요.',
    inputSchema: {
      type: 'object',
      required: ['agent'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        status: { type: 'string', enum: ['pending', 'acknowledged', 'all'], default: 'pending' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },

  // ── 핸드오프 수신 확인 ────────────────────────────────────
  {
    name: 'ack_handoff',
    description: '핸드오프 수신을 확인 처리합니다.',
    inputSchema: {
      type: 'object',
      required: ['handoff_id', 'agent'],
      properties: {
        handoff_id: { type: 'number' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        accepted: { type: 'boolean', default: true, description: 'false면 rejected 처리' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  // ── 태스크 잠금 (충돌 방지) ───────────────────────────────
  {
    name: 'lock_task',
    description: '태스크를 잠가 다른 AI의 동시 수정을 막습니다. 작업 전 반드시 호출하세요.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'agent'],
      properties: {
        task_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        ttl_minutes: { type: 'number', default: 30, description: '잠금 유지 시간 (분)' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  },

  // ── 태스크 잠금 해제 ──────────────────────────────────────
  {
    name: 'unlock_task',
    description: '태스크 잠금을 해제합니다. 작업 완료 또는 핸드오프 후 반드시 호출하세요.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'agent'],
      properties: {
        task_id: { type: 'string' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  },

  // ── 파일 변경 기록 (Git 대체) ─────────────────────────────
  {
    name: 'record_file_change',
    description: '파일 변경 사항을 기록합니다. Git 없이 변경 이력을 관리합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'file_path', 'change_type', 'summary'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        task_id: { type: 'string' },
        file_path: { type: 'string', description: '변경된 파일 경로' },
        change_type: { type: 'string', enum: ['create', 'modify', 'delete'] },
        summary: { type: 'string', description: '변경 내용 요약' },
        diff_snippet: { type: 'string', description: '핵심 diff 내용 (선택)' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },

  // ── 파일 변경 이력 조회 ───────────────────────────────────
  {
    name: 'get_file_history',
    description: '파일 또는 태스크의 변경 이력을 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '특정 파일 경로로 필터' },
        task_id: { type: 'string', description: '특정 태스크로 필터' },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax'] },
        limit: { type: 'number', default: 20 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },

  // ── 이벤트 브로드캐스트 ───────────────────────────────────
  {
    name: 'broadcast_event',
    description: '모든 AI에게 이벤트를 브로드캐스트합니다. 중요 알림에 사용하세요.',
    inputSchema: {
      type: 'object',
      required: ['event_type', 'agent', 'message'],
      properties: {
        event_type: {
          type: 'string',
          enum: ['alert', 'info', 'warning', 'state_change', 'task_update'],
        },
        agent: { type: 'string', description: '발신 에이전트' },
        task_id: { type: 'string' },
        message: { type: 'string', description: '브로드캐스트 메시지' },
        payload: { type: 'object', description: '추가 데이터 (선택)' },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },

  // ── 이벤트 로그 조회 ──────────────────────────────────────
  {
    name: 'get_events',
    description: '최근 이벤트 로그를 조회합니다. 전체 AI 활동 타임라인을 확인하세요.',
    inputSchema: {
      type: 'object',
      properties: {
        event_type: {
          type: 'string',
          enum: ['alert', 'info', 'warning', 'state_change', 'task_update', 'all'],
        },
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'minimax', 'all'] },
        limit: { type: 'number', default: 30 },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },

  // ── 전체 대시보드 스냅샷 ──────────────────────────────────
  {
    name: 'get_dashboard',
    description: '전체 AI 상태 + 진행 중 태스크 + 최근 이벤트를 한 번에 조회합니다.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
];

// ─── Tool 핸들러 ──────────────────────────────────────────────
export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  db: D1Database
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const ok = (data: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  });

  const fail = (msg: string) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
    isError: true,
  });

  switch (name) {
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
          status       = excluded.status,
          task_id      = COALESCE(excluded.task_id, task_id),
          task_title   = COALESCE(excluded.task_title, task_title),
          current_file = COALESCE(excluded.current_file, current_file),
          progress     = COALESCE(excluded.progress, progress),
          note         = COALESCE(excluded.note, note),
          updated_at   = excluded.updated_at
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

      // 이벤트 기록
      await db
        .prepare(
          `
        INSERT INTO event_log (event_type, agent, task_id, payload)
        VALUES ('state_change', ?, ?, ?)
      `
        )
        .bind(agent, task_id ?? null, JSON.stringify({ status, progress }))
        .run();

      return ok({ success: true, agent, status });
    }

    // ── create_task ────────────────────────────────────────
    case 'create_task': {
      // ID 자동 발급: TASK-001 형식
      const countRow = await db
        .prepare('SELECT COUNT(*) as cnt FROM tasks')
        .first<{ cnt: number }>();
      const num = String((countRow?.cnt ?? 0) + 1).padStart(3, '0');
      const id = `TASK-${num}`;

      const { title, description, priority, assigned_to, created_by } = args as Record<
        string,
        string
      >;
      await db
        .prepare(
          `
        INSERT INTO tasks (id, title, description, priority, assigned_to, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `
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

      await db
        .prepare(
          `
        INSERT INTO event_log (event_type, agent, task_id, payload)
        VALUES ('task_update', ?, ?, ?)
      `
        )
        .bind(created_by ?? 'human', id, JSON.stringify({ action: 'created', title }))
        .run();

      return ok({ success: true, task_id: id, title });
    }

    // ── list_tasks ─────────────────────────────────────────
    case 'list_tasks': {
      const status = (args.status as string) ?? 'all';
      const assigned = (args.assigned_to as string) ?? 'all';
      const limit = (args.limit as number) ?? 20;

      let query = 'SELECT * FROM tasks WHERE 1=1';
      const bindings: (string | number)[] = [];

      if (status !== 'all') {
        query += ' AND status = ?';
        bindings.push(status);
      }
      if (assigned !== 'all') {
        query += ' AND assigned_to = ?';
        bindings.push(assigned);
      }
      query += ' ORDER BY created_at DESC LIMIT ?';
      bindings.push(limit);

      const rows = await db
        .prepare(query)
        .bind(...bindings)
        .all();
      return ok({ tasks: rows.results, count: rows.results.length });
    }

    // ── update_task ────────────────────────────────────────
    case 'update_task': {
      const { task_id, status, assigned_to, priority } = args as Record<string, string>;
      await db
        .prepare(
          `
        UPDATE tasks
        SET status      = COALESCE(?, status),
            assigned_to = COALESCE(?, assigned_to),
            priority    = COALESCE(?, priority),
            updated_at  = datetime('now')
        WHERE id = ?
      `
        )
        .bind(status ?? null, assigned_to ?? null, priority ?? null, task_id)
        .run();

      await db
        .prepare(
          `
        INSERT INTO event_log (event_type, task_id, payload)
        VALUES ('task_update', ?, ?)
      `
        )
        .bind(task_id, JSON.stringify({ status, assigned_to }))
        .run();

      return ok({ success: true, task_id });
    }

    // ── log_handoff ────────────────────────────────────────
    case 'log_handoff': {
      const { from_agent, to_agent, task_id, summary, instructions } = args as Record<
        string,
        string
      >;
      const changed_files = JSON.stringify(args.changed_files ?? []);
      const risks = JSON.stringify(args.risks ?? []);

      const result = await db
        .prepare(
          `
        INSERT INTO handoff_log (from_agent, to_agent, task_id, summary, changed_files, risks, instructions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .bind(from_agent, to_agent, task_id, summary, changed_files, risks, instructions ?? null)
        .run();

      // 수신 AI 상태를 review로 전환
      await db
        .prepare(
          `
        UPDATE ai_state SET status = 'review', updated_at = datetime('now') WHERE agent = ?
      `
        )
        .bind(to_agent)
        .run();

      await db
        .prepare(
          `
        INSERT INTO event_log (event_type, agent, task_id, payload)
        VALUES ('handoff', ?, ?, ?)
      `
        )
        .bind(from_agent, task_id, JSON.stringify({ to: to_agent, summary }))
        .run();

      return ok({ success: true, handoff_id: result.meta.last_row_id, to_agent });
    }

    // ── get_handoff ────────────────────────────────────────
    case 'get_handoff': {
      const { agent, status: hStatus } = args as Record<string, string>;
      const statusFilter = (hStatus ?? 'pending') === 'all' ? '%' : (hStatus ?? 'pending');

      const rows = await db
        .prepare(
          `
        SELECT * FROM handoff_log
        WHERE to_agent = ? AND status LIKE ?
        ORDER BY created_at DESC
      `
        )
        .bind(agent, statusFilter)
        .all();

      // JSON 파싱
      const handoffs = rows.results.map((r: Record<string, unknown>) => ({
        ...r,
        changed_files: JSON.parse((r.changed_files as string) ?? '[]'),
        risks: JSON.parse((r.risks as string) ?? '[]'),
      }));

      return ok({ handoffs, count: handoffs.length });
    }

    // ── ack_handoff ────────────────────────────────────────
    case 'ack_handoff': {
      const { handoff_id, agent, accepted } = args as Record<string, string | boolean | number>;
      const newStatus = accepted !== false ? 'acknowledged' : 'rejected';

      await db
        .prepare(
          `
        UPDATE handoff_log SET status = ? WHERE id = ? AND to_agent = ?
      `
        )
        .bind(newStatus, handoff_id, agent)
        .run();

      return ok({ success: true, handoff_id, status: newStatus });
    }

    // ── lock_task ──────────────────────────────────────────
    case 'lock_task': {
      const { task_id, agent, ttl_minutes } = args as Record<string, string | number>;
      const ttl = (ttl_minutes as number) ?? 30;

      // 기존 유효한 잠금 확인
      const existing = await db
        .prepare(
          `
        SELECT locked_by FROM task_lock
        WHERE task_id = ? AND expires_at > datetime('now')
      `
        )
        .bind(task_id)
        .first<{ locked_by: string }>();

      if (existing && existing.locked_by !== agent) {
        return ok({ locked: true, locked_by: existing.locked_by, acquired: false });
      }

      await db
        .prepare(
          `
        INSERT OR REPLACE INTO task_lock (task_id, locked_by, locked_at, expires_at)
        VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' minutes'))
      `
        )
        .bind(task_id, agent, ttl)
        .run();

      return ok({ locked: false, acquired: true, task_id, agent, ttl_minutes: ttl });
    }

    // ── unlock_task ────────────────────────────────────────
    case 'unlock_task': {
      const { task_id, agent } = args as Record<string, string>;
      await db
        .prepare(
          `
        DELETE FROM task_lock WHERE task_id = ? AND locked_by = ?
      `
        )
        .bind(task_id, agent)
        .run();
      return ok({ success: true, task_id, unlocked_by: agent });
    }

    // ── record_file_change ─────────────────────────────────
    case 'record_file_change': {
      const { agent, task_id, file_path, change_type, summary, diff_snippet } = args as Record<
        string,
        string
      >;
      await db
        .prepare(
          `
        INSERT INTO file_changes (agent, task_id, file_path, change_type, summary, diff_snippet)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .bind(agent, task_id ?? null, file_path, change_type, summary, diff_snippet ?? null)
        .run();

      // ai_state current_file 업데이트
      await db
        .prepare(
          `
        UPDATE ai_state SET current_file = ?, updated_at = datetime('now') WHERE agent = ?
      `
        )
        .bind(file_path, agent)
        .run();

      return ok({ success: true, file_path, change_type });
    }

    // ── get_file_history ───────────────────────────────────
    case 'get_file_history': {
      const { file_path, task_id, agent, limit } = args as Record<string, string | number>;
      let query = 'SELECT * FROM file_changes WHERE 1=1';
      const bindings: (string | number)[] = [];

      if (file_path) {
        query += ' AND file_path = ?';
        bindings.push(file_path as string);
      }
      if (task_id) {
        query += ' AND task_id = ?';
        bindings.push(task_id as string);
      }
      if (agent) {
        query += ' AND agent = ?';
        bindings.push(agent as string);
      }
      query += ' ORDER BY created_at DESC LIMIT ?';
      bindings.push((limit as number) ?? 20);

      const rows = await db
        .prepare(query)
        .bind(...bindings)
        .all();
      return ok({ changes: rows.results, count: rows.results.length });
    }

    // ── broadcast_event ────────────────────────────────────
    case 'broadcast_event': {
      const { event_type, agent, task_id, message, payload } = args as Record<string, unknown>;
      await db
        .prepare(
          `
        INSERT INTO event_log (event_type, agent, task_id, payload)
        VALUES (?, ?, ?, ?)
      `
        )
        .bind(
          event_type,
          agent,
          task_id ?? null,
          JSON.stringify({ message, ...((payload as object) ?? {}) })
        )
        .run();
      return ok({ success: true, event_type, broadcasted_by: agent });
    }

    // ── get_events ─────────────────────────────────────────
    case 'get_events': {
      const { event_type, agent, limit } = args as Record<string, string | number>;
      let query = 'SELECT * FROM event_log WHERE 1=1';
      const bindings: (string | number)[] = [];

      if (event_type && event_type !== 'all') {
        query += ' AND event_type = ?';
        bindings.push(event_type as string);
      }
      if (agent && agent !== 'all') {
        query += ' AND agent = ?';
        bindings.push(agent as string);
      }
      query += ' ORDER BY created_at DESC LIMIT ?';
      bindings.push((limit as number) ?? 30);

      const rows = await db
        .prepare(query)
        .bind(...bindings)
        .all();
      return ok({ events: rows.results, count: rows.results.length });
    }

    // ── get_dashboard ──────────────────────────────────────
    case 'get_dashboard': {
      const [agents, tasks, events, locks, handoffs] = await Promise.all([
        db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all(),
        db
          .prepare("SELECT * FROM tasks WHERE status != 'done' ORDER BY created_at DESC LIMIT 10")
          .all(),
        db.prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT 20').all(),
        db.prepare("SELECT * FROM task_lock WHERE expires_at > datetime('now')").all(),
        db
          .prepare("SELECT * FROM handoff_log WHERE status = 'pending' ORDER BY created_at DESC")
          .all(),
      ]);

      return ok({
        dashboard: {
          agents: agents.results,
          active_tasks: tasks.results,
          recent_events: events.results,
          active_locks: locks.results,
          pending_handoffs: handoffs.results,
          snapshot_at: new Date().toISOString(),
        },
      });
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}
