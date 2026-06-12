import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('dashboard tools', () => {
  it('returns a dashboard snapshot', async () => {
    const db = createD1Mock((_sql, _args, operation) =>
      operation === 'first' ? null : { results: [] }
    );

    const dashboard = parseToolResult(await handleTool('get_dashboard', {}, db));

    expect(dashboard.active_session).toBeNull();
    expect(dashboard.agents).toEqual([]);
    expect(dashboard.active_tasks).toEqual([]);
    expect(dashboard.pending_handoffs).toEqual([]);
  });
});
