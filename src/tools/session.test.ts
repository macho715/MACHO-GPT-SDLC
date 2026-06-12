import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('session tools', () => {
  it('runs start_session -> get_session -> close_session smoke flow', async () => {
    const db = createD1Mock((sql, args, operation) => {
      if (operation === 'first' && sql.includes('COUNT(*) as c')) {
        return { c: 0 };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM session')) {
        return {
          id: args[0] ?? 'SESS-001',
          title: 'Sprint',
          leader: 'codex',
          status: 'active',
          goals: '[]',
        };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const started = parseToolResult(
      await handleTool('start_session', { title: 'Sprint', leader: 'codex', goals: ['ship'] }, db)
    );
    expect(started.session_id).toBe('SESS-001');

    const session = parseToolResult(
      await handleTool('get_session', { session_id: 'SESS-001' }, db)
    );
    expect(session.session).toMatchObject({ id: 'SESS-001' });

    const closed = parseToolResult(
      await handleTool(
        'close_session',
        { session_id: 'SESS-001', closed_by: 'codex', summary: 'done' },
        db
      )
    );
    expect(closed.status).toBe('retro');
  });

  it('getSession returns error when session not found', async () => {
    const db = createD1Mock(() => null);
    const result = parseToolResult(await handleTool('get_session', { session_id: 'SESS-999' }, db));
    expect(result.error).toBe('Active session not found');
  });

  it('start_session without goals defaults to empty array', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('COUNT(*) as c')) {
        return { c: 0 };
      }
      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });
    const result = parseToolResult(
      await handleTool('start_session', { title: 'No-goals Sprint', leader: 'codex' }, db)
    );
    expect(result.session_id).toBe('SESS-001');
  });

  it('getSession without session_id queries latest active session', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes("status IN ('active'")) {
        return { id: 'SESS-002', title: 'Latest', leader: 'codex', status: 'active', goals: '[]' };
      }
      return operation === 'all' ? { results: [] } : null;
    });
    const result = parseToolResult(await handleTool('get_session', {}, db));
    expect((result.session as Record<string, unknown>).id).toBe('SESS-002');
  });
});
