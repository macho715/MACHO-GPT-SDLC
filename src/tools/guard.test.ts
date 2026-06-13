import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

const activeSession = { id: 'SESS-001', status: 'active' };
const task = {
  id: 'TASK-001',
  status: 'open',
  assigned_to: 'codex',
  session_id: 'SESS-001',
};
const handoff = { id: 7, status: 'acknowledged' };
const lock = { locked_by: 'codex', expires_at: '2099-01-01T00:00:00Z' };

const guardDb = (
  overrides: {
    session?: Record<string, unknown> | null;
    task?: Record<string, unknown> | null;
    handoff?: Record<string, unknown> | null;
    lock?: Record<string, unknown> | null;
    blockedCount?: number;
  } = {}
) =>
  createD1Mock((sql, _args, operation) => {
    if (operation === 'first' && sql.includes("FROM session WHERE status='active'")) {
      return overrides.session === undefined ? activeSession : overrides.session;
    }

    if (operation === 'first' && sql.includes('FROM tasks WHERE id=?')) {
      return overrides.task === undefined ? task : overrides.task;
    }

    if (operation === 'first' && sql.includes('FROM handoff_log')) {
      return overrides.handoff === undefined ? handoff : overrides.handoff;
    }

    if (operation === 'first' && sql.includes('FROM task_lock')) {
      return overrides.lock === undefined ? lock : overrides.lock;
    }

    if (operation === 'first' && sql.includes('COUNT(*) AS blocked_count')) {
      return { blocked_count: overrides.blockedCount ?? 0 };
    }

    return operation === 'all' ? { results: [] } : { success: true, meta: {} };
  });

const validate = async (db = guardDb()) =>
  parseToolResult(
    await handleTool('validate_agent_start', { agent: 'codex', task_id: 'TASK-001' }, db)
  );

describe('validate_agent_start', () => {
  it('returns PASS when session, handoff, lock, and blocked-count checks pass', async () => {
    const result = await validate();

    expect(result.status).toBe('PASS');
    expect(result.allowed).toBe(true);
    expect(result.zero_log).toEqual([]);
  });

  it('returns ZERO-T3 when no active session exists', async () => {
    const result = await validate(guardDb({ session: null }));

    expect(result.status).toBe('ZERO-T3');
    expect(result.allowed).toBe(false);
    expect(result.zero_log).toMatchObject([{ code: 'ZERO-T3' }]);
  });

  it('returns ZERO-T1 when no acknowledged handoff exists', async () => {
    const result = await validate(guardDb({ handoff: { id: 7, status: 'pending' } }));

    expect(result.status).toBe('ZERO-T1');
    expect(result.allowed).toBe(false);
    expect(result.zero_log).toMatchObject([{ code: 'ZERO-T1' }]);
  });

  it('returns ZERO-T2 when the requesting agent does not own the task lock', async () => {
    const result = await validate(
      guardDb({ lock: { locked_by: 'claude', expires_at: '2099-01-01T00:00:00Z' } })
    );

    expect(result.status).toBe('ZERO-T2');
    expect(result.allowed).toBe(false);
    expect(result.zero_log).toMatchObject([{ code: 'ZERO-T2' }]);
  });

  it('returns ZERO-T2 when active-session blocked tasks reach the threshold', async () => {
    const result = await validate(guardDb({ blockedCount: 2 }));

    expect(result.status).toBe('ZERO-T2');
    expect(result.allowed).toBe(false);
    expect(result.checks).toMatchObject({
      blocked_task_count: { blocked_count: 2, threshold: 2 },
    });
  });
});
