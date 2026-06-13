import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('election tools', () => {
  it('starts an election and returns the generated id', async () => {
    const db = createD1Mock((_sql, _args, operation) =>
      operation === 'run' ? { success: true, meta: { last_row_id: 7 } } : null
    );

    const result = parseToolResult(
      await handleTool('start_election', { session_id: 'SESS-001' }, db)
    );

    expect(result.election_id).toBe(7);
    expect(result.nominees).toEqual(['codex', 'claude', 'opencode', 'hermes']);
  });

  it('prevents duplicate election votes', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('SELECT id FROM election_ballot')) {
        return { id: 1 };
      }

      return null;
    });

    const result = await handleTool(
      'cast_election_vote',
      { election_id: 1, agent: 'codex', nominee: 'claude' },
      db
    );

    expect(result.isError).toBe(true);
    expect(parseToolResult(result)).toEqual({ error: 'codex는 이미 투표했습니다.' });
  });

  it('records a non-duplicate election vote', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('SELECT id FROM election_ballot')) {
        return null;
      }

      if (operation === 'first' && sql.includes('SELECT COUNT(*) as c')) {
        return { c: 2 };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(
      await handleTool(
        'cast_election_vote',
        { election_id: 1, agent: 'codex', nominee: 'claude', reason: 'steady' },
        db
      )
    );

    expect(result.success).toBe(true);
    expect(result.vote_count).toBe(2);
    expect(result.message).toBe('2명 투표 대기 중.');
  });

  it('returns not found for missing elections', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM election_ballot')) {
        return { results: [] };
      }

      return operation === 'all' ? { results: [] } : null;
    });

    const result = await handleTool('get_election_result', { election_id: 404 }, db);

    expect(result.isError).toBe(true);
    expect(parseToolResult(result)).toEqual({ error: 'Election not found: 404' });
  });

  it('auto-starts next session from parsed SESS id', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM election_ballot')) {
        return {
          results: [
            { agent: 'codex', nominee: 'claude' },
            { agent: 'claude', nominee: 'claude' },
            { agent: 'opencode', nominee: 'claude' },
            { agent: 'hermes', nominee: 'claude' },
          ],
        };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM leader_election')) {
        return { id: 1, session_id: 'SESS-009', status: 'open' };
      }

      if (operation === 'first' && sql.includes('COUNT(*) as c')) {
        return { c: 9 };
      }

      if (operation === 'first' && sql.includes('SELECT title FROM session')) {
        return { title: 'Session 009' };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(await handleTool('get_election_result', { election_id: 1 }, db));

    expect(result.winner).toBe('claude');
    expect(result.next_session_id).toBeNull();
    expect(
      db.calls.some(
        (call) =>
          call.operation === 'run' &&
          call.sql.includes('INSERT INTO session') &&
          call.args.includes('Session 010')
      )
    ).toBe(true);
  });

  it('reports a tie without auto-starting a next session', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM election_ballot')) {
        return {
          results: [
            { agent: 'codex', nominee: 'codex' },
            { agent: 'claude', nominee: 'claude' },
            { agent: 'opencode', nominee: 'codex' },
            { agent: 'hermes', nominee: 'claude' },
          ],
        };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM leader_election')) {
        return { id: 1, session_id: 'SESS-010', status: 'open' };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(await handleTool('get_election_result', { election_id: 1 }, db));

    expect(result.winner).toBeNull();
    expect(result.is_tie).toBe(true);
    expect(result.tie_candidates).toEqual(['codex', 'claude']);
    expect(
      db.calls.some((call) => call.operation === 'run' && call.sql.includes('INSERT INTO session'))
    ).toBe(false);
  });

  it('keeps a partial election open', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM election_ballot')) {
        return { results: [{ agent: 'codex', nominee: 'claude' }] };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM leader_election')) {
        return { id: 1, session_id: 'SESS-011', status: 'open' };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(
      await handleTool('get_election_result', { election_id: 1, auto_start_next: false }, db)
    );

    expect(result.winner).toBe('claude');
    expect(result.is_final).toBe(false);
    expect(result.message).toBe('🏆 선출된 다음 세션 리더: claude');
  });
});
