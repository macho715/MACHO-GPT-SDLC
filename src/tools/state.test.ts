import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('state tools', () => {
  it('gets all agent state rows', async () => {
    const db = createD1Mock((_sql, _args, operation) =>
      operation === 'all' ? { results: [{ agent: 'codex', status: 'idle' }] } : null
    );

    const result = parseToolResult(await handleTool('get_state', {}, db));

    expect(result.agents).toEqual([{ agent: 'codex', status: 'idle' }]);
  });

  it('updates an agent state', async () => {
    const db = createD1Mock();

    const result = parseToolResult(
      await handleTool(
        'update_state',
        { agent: 'codex', status: 'working', task_id: 'TASK-001' },
        db
      )
    );

    expect(result.success).toBe(true);
    expect(result.agent).toBe('codex');
  });
});
