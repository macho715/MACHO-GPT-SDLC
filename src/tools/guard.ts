import { ok, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

const agentEnum = ['codex', 'claude', 'opencode', 'hermes'] as const;

type GuardStatus = 'PASS' | 'ZERO-T1' | 'ZERO-T2' | 'ZERO-T3';

type SessionRow = {
  id: string;
  status: string;
};

type TaskRow = {
  id: string;
  status: string;
  assigned_to: string | null;
  session_id: string | null;
};

type HandoffRow = {
  id: number;
  status: string;
};

type LockRow = {
  locked_by: string;
  expires_at: string;
};

type BlockedCountRow = {
  blocked_count: number;
};

type GuardCheck = {
  passed: boolean;
  detail: string;
  [key: string]: unknown;
};

type GuardPayload = {
  status: GuardStatus;
  allowed: boolean;
  agent: string;
  task_id: string;
  session_id: string | null;
  checks: Record<string, GuardCheck>;
  zero_log: Array<{
    code: Exclude<GuardStatus, 'PASS'>;
    reason: string;
    required_action: string;
  }>;
};

export const guardTools = [
  {
    name: 'validate_agent_start',
    description:
      '작업 시작 전 ZERO 가드 검증. 활성 세션, 핸드오프 수신 확인, 태스크 락 소유권, blocked 태스크 수를 확인합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'task_id'],
      properties: {
        agent: { type: 'string', enum: agentEnum },
        task_id: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: true },
  },
] satisfies ToolDefinition[];

const result = (
  status: GuardStatus,
  agent: string,
  taskId: string,
  sessionId: string | null,
  checks: Record<string, GuardCheck>,
  reason?: string,
  requiredAction?: string
): ToolResult => {
  const payload: GuardPayload = {
    status,
    allowed: status === 'PASS',
    agent,
    task_id: taskId,
    session_id: sessionId,
    checks,
    zero_log:
      status === 'PASS'
        ? []
        : [
            {
              code: status,
              reason: reason ?? 'Agent start guard failed.',
              required_action: requiredAction ?? 'Resolve the ZERO blocker before starting work.',
            },
          ],
  };

  return ok(payload);
};

export async function validateAgentStart(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { agent, task_id } = args as Record<string, string>;
  const checks: Record<string, GuardCheck> = {};

  const session = await db
    .prepare(`SELECT id,status FROM session WHERE status='active' ORDER BY created_at DESC LIMIT 1`)
    .first<SessionRow>();

  if (!session) {
    checks.active_session = {
      passed: false,
      detail: 'No active session is available for new work.',
    };
    return result(
      'ZERO-T3',
      agent,
      task_id,
      null,
      checks,
      'No active session is available.',
      'Start a new session or complete leader election before work begins.'
    );
  }

  checks.active_session = {
    passed: true,
    detail: 'Active session found.',
    session_id: session.id,
    session_status: session.status,
  };

  const task = await db
    .prepare(`SELECT id,status,assigned_to,session_id FROM tasks WHERE id=?`)
    .bind(task_id)
    .first<TaskRow>();

  if (!task) {
    checks.task_context = {
      passed: false,
      detail: 'Task does not exist.',
      session_id: session.id,
    };
    return result(
      'ZERO-T1',
      agent,
      task_id,
      session.id,
      checks,
      'Task context was not found.',
      'Create or select a valid task before starting work.'
    );
  }

  if (task.session_id && task.session_id !== session.id) {
    checks.task_context = {
      passed: false,
      detail: 'Task belongs to a different session.',
      task_session_id: task.session_id,
      active_session_id: session.id,
    };
    return result(
      'ZERO-T1',
      agent,
      task_id,
      session.id,
      checks,
      'Task is not attached to the active session.',
      'Use a task from the active session or start the correct session.'
    );
  }

  checks.task_context = {
    passed: true,
    detail: 'Task exists in the active work context.',
    task_status: task.status,
    assigned_to: task.assigned_to,
  };

  const handoff = await db
    .prepare(
      `SELECT id,status FROM handoff_log WHERE to_agent=? AND task_id=? ORDER BY created_at DESC LIMIT 1`
    )
    .bind(agent, task_id)
    .first<HandoffRow>();

  if (!handoff || handoff.status !== 'acknowledged') {
    checks.handoff_acknowledged = {
      passed: false,
      detail: handoff ? 'Latest handoff is not acknowledged.' : 'No handoff exists for this task.',
      handoff_id: handoff?.id ?? null,
      handoff_status: handoff?.status ?? null,
    };
    return result(
      'ZERO-T1',
      agent,
      task_id,
      session.id,
      checks,
      'Handoff was not acknowledged.',
      'Call get_handoff and ack_handoff for this task before starting work.'
    );
  }

  checks.handoff_acknowledged = {
    passed: true,
    detail: 'Latest handoff is acknowledged.',
    handoff_id: handoff.id,
    handoff_status: handoff.status,
  };

  const lock = await db
    .prepare(
      `SELECT locked_by,expires_at FROM task_lock WHERE task_id=? AND expires_at>datetime('now')`
    )
    .bind(task_id)
    .first<LockRow>();

  if (!lock || lock.locked_by !== agent) {
    checks.task_lock_owned = {
      passed: false,
      detail: lock ? 'Task lock is owned by another agent.' : 'Task has no active lock.',
      locked_by: lock?.locked_by ?? null,
      expires_at: lock?.expires_at ?? null,
    };
    return result(
      'ZERO-T2',
      agent,
      task_id,
      session.id,
      checks,
      lock ? 'Another agent owns the task lock.' : 'Task lock was not acquired.',
      lock ? 'Wait for unlock_task or coordinate handoff.' : 'Call lock_task before starting work.'
    );
  }

  checks.task_lock_owned = {
    passed: true,
    detail: 'Task lock is owned by the requesting agent.',
    locked_by: lock.locked_by,
    expires_at: lock.expires_at,
  };

  const blocked = await db
    .prepare(`SELECT COUNT(*) AS blocked_count FROM tasks WHERE session_id=? AND status='blocked'`)
    .bind(session.id)
    .first<BlockedCountRow>();
  const blockedCount = Number(blocked?.blocked_count ?? 0);

  if (blockedCount >= 2) {
    checks.blocked_task_count = {
      passed: false,
      detail: 'Blocked task escalation threshold reached.',
      blocked_count: blockedCount,
      threshold: 2,
    };
    return result(
      'ZERO-T2',
      agent,
      task_id,
      session.id,
      checks,
      'Two or more tasks are blocked in the active session.',
      'Escalate blocked work before starting new work.'
    );
  }

  checks.blocked_task_count = {
    passed: true,
    detail: 'Blocked task count is below escalation threshold.',
    blocked_count: blockedCount,
    threshold: 2,
  };

  return result('PASS', agent, task_id, session.id, checks);
}

export const guardHandlers = {
  validate_agent_start: validateAgentStart,
} satisfies Record<string, ToolHandler>;
