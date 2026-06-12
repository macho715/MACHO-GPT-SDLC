import { describe, expect, it } from 'vitest';
import { handleTool, tools } from './index';
import { nextId } from '../lib/mcp';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

const baselineToolNames = [
  'get_dashboard',
  'start_session',
  'get_session',
  'close_session',
  'submit_retro',
  'get_retro',
  'finalize_retro',
  'start_election',
  'cast_election_vote',
  'get_election_result',
  'get_state',
  'update_state',
  'create_task',
  'list_tasks',
  'update_task',
  'start_discussion',
  'post_message',
  'get_discussion',
  'close_discussion',
  'check_consensus',
  'create_vote',
  'cast_vote',
  'get_vote_result',
  'log_handoff',
  'get_handoff',
  'ack_handoff',
  'lock_task',
  'unlock_task',
  'record_file_change',
  'broadcast_event',
  'get_events',
];

describe('tool registry', () => {
  it('preserves the v3 tool inventory', () => {
    expect(tools.map((tool) => tool.name)).toEqual(baselineToolNames);
    expect(tools).toHaveLength(31);
  });

  it('returns a tool error for unknown tool names', async () => {
    const result = await handleTool('missing_tool', {}, createD1Mock());
    expect(result.isError).toBe(true);
    expect(parseToolResult(result)).toEqual({ error: 'Unknown tool: missing_tool' });
  });

  it('nextId throws for unsupported table', async () => {
    const db = createD1Mock();
    await expect(nextId(db, 'bad_table', 'X')).rejects.toThrow('Unsupported id table');
  });
});
