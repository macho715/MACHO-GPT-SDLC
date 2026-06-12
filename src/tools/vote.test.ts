import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('vote tools — error branches', () => {
  it('castVote fails when agent already voted', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('vote_ballot')) {
        return { id: 1 };
      }
      return null;
    });
    const result = parseToolResult(
      await handleTool('cast_vote', { vote_id: 1, agent: 'claude', choice: 'yes' }, db)
    );
    expect(result.error).toMatch(/already voted/);
  });

  it('castVote fails when vote not found', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('vote_ballot')) {
        return null;
      }
      if (operation === 'first' && sql.includes('FROM vote')) {
        return null;
      }
      return null;
    });
    const result = parseToolResult(
      await handleTool('cast_vote', { vote_id: 99, agent: 'codex', choice: 'yes' }, db)
    );
    expect(result.error).toMatch(/Vote not found/);
  });

  it('castVote fails for invalid choice', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('vote_ballot')) {
        return null;
      }
      if (operation === 'first' && sql.includes('FROM vote')) {
        return { options: '["option-a","option-b"]' };
      }
      return null;
    });
    const result = parseToolResult(
      await handleTool('cast_vote', { vote_id: 1, agent: 'codex', choice: 'invalid' }, db)
    );
    expect(result.error).toMatch(/Invalid choice/);
  });

  it('getVoteResult fails when vote not found', async () => {
    const db = createD1Mock(() => null);
    const result = parseToolResult(await handleTool('get_vote_result', { vote_id: 99 }, db));
    expect(result.error).toMatch(/Vote not found/);
  });
});
