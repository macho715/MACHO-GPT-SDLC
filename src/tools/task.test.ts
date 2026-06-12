import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('task tools', () => {
  it('runs create_task -> list_tasks smoke flow', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('COUNT(*) as c')) {
        return { c: 0 };
      }

      if (operation === 'all' && sql.includes('SELECT * FROM tasks')) {
        return {
          results: [
            {
              id: 'TASK-001',
              title: 'Split tools',
              status: 'open',
              session_id: 'SESS-001',
            },
          ],
        };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const created = parseToolResult(
      await handleTool(
        'create_task',
        {
          title: 'Split tools',
          created_by: 'codex',
          session_id: 'SESS-001',
        },
        db
      )
    );
    expect(created.task_id).toBe('TASK-001');

    const listed = parseToolResult(await handleTool('list_tasks', { session_id: 'SESS-001' }, db));
    expect(listed.tasks).toEqual([
      {
        id: 'TASK-001',
        title: 'Split tools',
        status: 'open',
        session_id: 'SESS-001',
      },
    ]);
  });

  it('applies list filters and updates task fields', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM tasks')) {
        return {
          results: [
            {
              id: 'TASK-002',
              title: 'Review',
              status: 'review',
              assigned_to: 'claude',
              session_id: 'SESS-002',
            },
          ],
        };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const listed = parseToolResult(
      await handleTool(
        'list_tasks',
        {
          status: 'review',
          assigned_to: 'claude',
          session_id: 'SESS-002',
          limit: 5,
        },
        db
      )
    );

    expect(listed.count).toBe(1);
    expect(
      db.calls.some(
        (call) =>
          call.operation === 'all' &&
          call.sql.includes('status=?') &&
          call.sql.includes('assigned_to=?') &&
          call.sql.includes('session_id=?') &&
          call.args.includes(5)
      )
    ).toBe(true);

    const updated = parseToolResult(
      await handleTool(
        'update_task',
        {
          task_id: 'TASK-002',
          status: 'done',
          assigned_to: 'claude',
          priority: 'high',
        },
        db
      )
    );

    expect(updated).toEqual({ success: true, task_id: 'TASK-002' });
  });
});
