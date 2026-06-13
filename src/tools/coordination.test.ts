import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('coordination tools', () => {
  it('runs discussion tools smoke flow', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('COUNT(*) as c')) {
        return { c: 0 };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM discussion_thread')) {
        return { id: 'DISC-001', title: 'Decision' };
      }

      if (operation === 'all' && sql.includes('SELECT * FROM discussion_message')) {
        return { results: [{ id: 1, evidence: '["trace"]' }] };
      }

      if (operation === 'all' && sql.includes('SELECT DISTINCT agent')) {
        return { results: [{ agent: 'codex' }, { agent: 'claude' }] };
      }

      if (operation === 'all' && sql.includes('SELECT agent,role')) {
        return {
          results: [
            { agent: 'codex', role: 'agree' },
            { agent: 'claude', role: 'decide' },
          ],
        };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: { last_row_id: 11 } };
    });

    expect(
      parseToolResult(
        await handleTool(
          'start_discussion',
          {
            task_id: 'TASK-001',
            session_id: 'SESS-001',
            title: 'Decision',
            initiated_by: 'codex',
            opening_message: 'Pick path',
            invite_agents: ['claude'],
          },
          db
        )
      ).thread_id
    ).toBe('DISC-001');

    expect(
      parseToolResult(
        await handleTool(
          'post_message',
          {
            thread_id: 'DISC-001',
            agent: 'claude',
            role: 'agree',
            content: 'Agree',
          },
          db
        )
      ).message_id
    ).toBe(11);

    expect(
      parseToolResult(await handleTool('get_discussion', { thread_id: 'DISC-001' }, db)).messages
    ).toEqual([{ id: 1, evidence: ['trace'] }]);

    expect(
      parseToolResult(
        await handleTool(
          'close_discussion',
          {
            thread_id: 'DISC-001',
            agent: 'codex',
            consensus_summary: 'Proceed',
            outcome: 'consensus',
            action_items: ['ship'],
          },
          db
        )
      ).consensus
    ).toBe('Proceed');

    expect(
      parseToolResult(await handleTool('check_consensus', { thread_id: 'DISC-001' }, db))
        .consensus_reached
    ).toBe(true);
  });

  it('runs vote tools smoke flow', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('SELECT id FROM vote_ballot')) {
        return null;
      }

      if (operation === 'first' && sql.includes('SELECT options FROM vote')) {
        return { options: '["A","B"]' };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM vote')) {
        return { id: 1, question: 'Pick?', options: '["A","B"]', status: 'open' };
      }

      if (operation === 'all' && sql.includes('SELECT * FROM vote_ballot')) {
        return {
          results: [
            { agent: 'codex', choice: 'A' },
            { agent: 'claude', choice: 'A' },
            { agent: 'opencode', choice: 'B' },
            { agent: 'hermes', choice: 'A' },
          ],
        };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: { last_row_id: 5 } };
    });

    expect(
      parseToolResult(
        await handleTool(
          'create_vote',
          {
            thread_id: 'DISC-001',
            question: 'Pick?',
            options: ['A', 'B'],
            created_by: 'codex',
          },
          db
        )
      ).vote_id
    ).toBe(5);

    expect(
      parseToolResult(
        await handleTool('cast_vote', { vote_id: 1, agent: 'codex', choice: 'A' }, db)
      ).choice
    ).toBe('A');

    expect(parseToolResult(await handleTool('get_vote_result', { vote_id: 1 }, db)).winner).toBe(
      'A'
    );
  });

  it('runs handoff, lock, file, and event tools smoke flow', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('SELECT locked_by')) {
        return null;
      }

      if (operation === 'all' && sql.includes('SELECT * FROM handoff_log')) {
        return { results: [{ id: 1, to_agent: 'claude', status: 'pending' }] };
      }

      if (operation === 'all' && sql.includes('SELECT * FROM event_log')) {
        return { results: [{ id: 1, event_type: 'info' }] };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: { last_row_id: 3 } };
    });

    expect(
      parseToolResult(
        await handleTool(
          'log_handoff',
          {
            from_agent: 'codex',
            to_agent: 'claude',
            task_id: 'TASK-001',
            summary: 'Review',
          },
          db
        )
      ).handoff_id
    ).toBe(3);

    expect(
      parseToolResult(await handleTool('get_handoff', { agent: 'claude' }, db)).handoffs
    ).toHaveLength(1);

    expect(
      parseToolResult(await handleTool('ack_handoff', { handoff_id: 1, agent: 'claude' }, db))
        .status
    ).toBe('acknowledged');

    expect(
      parseToolResult(await handleTool('lock_task', { task_id: 'TASK-001', agent: 'codex' }, db))
        .acquired
    ).toBe(true);

    expect(
      parseToolResult(await handleTool('unlock_task', { task_id: 'TASK-001', agent: 'codex' }, db))
        .success
    ).toBe(true);

    expect(
      parseToolResult(
        await handleTool(
          'record_file_change',
          {
            agent: 'codex',
            task_id: 'TASK-001',
            file_path: 'src/index.ts',
            change_type: 'modify',
            summary: 'Updated',
          },
          db
        )
      ).file_path
    ).toBe('src/index.ts');

    expect(
      parseToolResult(
        await handleTool(
          'broadcast_event',
          { event_type: 'info', agent: 'codex', message: 'done' },
          db
        )
      ).success
    ).toBe(true);

    expect(
      parseToolResult(await handleTool('get_events', { event_type: 'info' }, db)).events
    ).toHaveLength(1);
  });

  it('lockTask returns locked: true, acquired: false when another agent holds the lock', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('SELECT locked_by')) {
        return { locked_by: 'codex' };
      }
      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(
      await handleTool('lock_task', { task_id: 'TASK-001', agent: 'claude' }, db)
    );
    expect(result.locked).toBe(true);
    expect(result.acquired).toBe(false);
    expect(result.locked_by).toBe('codex');
  });

  it('postMessage fails when thread not found', async () => {
    const db = createD1Mock(() => null);
    const result = parseToolResult(
      await handleTool(
        'post_message',
        { thread_id: 'DISC-999', agent: 'claude', role: 'agree', content: 'Hi' },
        db
      )
    );
    expect(result.error).toMatch(/Thread not found/);
  });

  it('getDiscussion fails when thread not found', async () => {
    const db = createD1Mock(() => null);
    const result = parseToolResult(
      await handleTool('get_discussion', { thread_id: 'DISC-999' }, db)
    );
    expect(result.error).toMatch(/Thread not found/);
  });
});
