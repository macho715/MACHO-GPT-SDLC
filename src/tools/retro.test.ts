import { describe, expect, it } from 'vitest';
import { handleTool } from './index';
import { createD1Mock, parseToolResult } from '../../tests/helpers/d1Mock';

describe('retro tools', () => {
  it('submits a retro and reports all-submitted status', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('SELECT id FROM retro_review')) {
        return null;
      }

      if (operation === 'first' && sql.includes('SELECT COUNT(*) as c')) {
        return { c: 4 };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(
      await handleTool(
        'submit_retro',
        {
          session_id: 'SESS-001',
          agent: 'codex',
          went_well: ['schema preserved'],
          went_wrong: ['coverage gap'],
          suggestions: ['add tests'],
          highlight: 'Migration works',
          mvp_vote: 'claude',
        },
        db
      )
    );

    expect(result.success).toBe(true);
    expect(result.all_submitted).toBe(true);
    expect(result.message).toBe('전원 제출 완료 → finalize_retro 호출하세요.');
  });

  it('prevents duplicate submit_retro calls', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'first' && sql.includes('SELECT id FROM retro_review')) {
        return { id: 1 };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = await handleTool(
      'submit_retro',
      {
        session_id: 'SESS-001',
        agent: 'codex',
        went_well: ['tests'],
        went_wrong: ['none'],
      },
      db
    );

    expect(result.isError).toBe(true);
    expect(parseToolResult(result)).toEqual({
      error: 'codex already submitted retro for SESS-001',
    });
  });

  it('blocks finalize_retro until all four agents submit', async () => {
    const db = createD1Mock((_sql, _args, operation) =>
      operation === 'all' ? { results: [{ agent: 'codex' }, { agent: 'claude' }] } : null
    );

    const result = await handleTool('finalize_retro', { session_id: 'SESS-001' }, db);

    expect(result.isError).toBe(true);
    expect(parseToolResult(result)).toEqual({
      error: '아직 2개 AI가 회고를 제출하지 않았습니다.',
    });
  });

  it('gets retro reviews with parsed JSON and summary', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM retro_review')) {
        return {
          results: [
            {
              agent: 'codex',
              went_well: '["tests"]',
              went_wrong: '["branch gap"]',
              suggestions: '["cover success"]',
            },
          ],
        };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM retro_summary')) {
        return {
          session_id: 'SESS-001',
          top_went_well: '["tests (1표)"]',
          top_went_wrong: '["branch gap (1표)"]',
          top_suggestions: '["cover success (1표)"]',
        };
      }

      if (operation === 'first' && sql.includes('SELECT * FROM session')) {
        return { id: 'SESS-001', status: 'retro' };
      }

      return operation === 'all' ? { results: [] } : null;
    });

    const result = parseToolResult(await handleTool('get_retro', { session_id: 'SESS-001' }, db));

    expect(result.submitted_count).toBe(1);
    expect(result.all_submitted).toBe(false);
    expect(result.reviews).toEqual([
      {
        agent: 'codex',
        went_well: ['tests'],
        went_wrong: ['branch gap'],
        suggestions: ['cover success'],
      },
    ]);
    expect(result.summary).toMatchObject({
      top_went_well: ['tests (1표)'],
    });
  });

  it('finalizes retro summaries when all agents submitted', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM retro_review')) {
        return {
          results: [
            {
              agent: 'codex',
              went_well: '["tests","types"]',
              went_wrong: '["coverage"]',
              suggestions: '["add branch tests"]',
              mvp_vote: 'claude',
            },
            {
              agent: 'claude',
              went_well: '["tests"]',
              went_wrong: '["coverage"]',
              suggestions: '["add branch tests"]',
              mvp_vote: 'codex',
            },
            {
              agent: 'opencode',
              went_well: '["types"]',
              went_wrong: '["docs"]',
              suggestions: '["keep traceability"]',
              mvp_vote: 'claude',
            },
            {
              agent: 'hermes',
              went_well: '["tests"]',
              went_wrong: '[]',
              suggestions: '[]',
            },
          ],
        };
      }

      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(
      await handleTool('finalize_retro', { session_id: 'SESS-001' }, db)
    );

    expect(result.success).toBe(true);
    expect(result.mvp_agent).toBe('claude');
    expect(result.top_went_well).toContain('tests (3표)');
    expect(result.top_went_wrong).toContain('coverage (2표)');
    expect(result.top_suggestions).toContain('add branch tests (2표)');
  });

  it('finalizeRetro handles empty arrays and no mvp_vote', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM retro_review')) {
        return {
          results: [
            {
              agent: 'codex',
              went_well: '[]',
              went_wrong: '[]',
              suggestions: '[]',
              mvp_vote: null,
            },
            {
              agent: 'claude',
              went_well: '[]',
              went_wrong: '[]',
              suggestions: '[]',
              mvp_vote: null,
            },
            {
              agent: 'opencode',
              went_well: '[]',
              went_wrong: '[]',
              suggestions: '[]',
              mvp_vote: null,
            },
            {
              agent: 'hermes',
              went_well: '[]',
              went_wrong: '[]',
              suggestions: '[]',
              mvp_vote: null,
            },
          ],
        };
      }
      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });

    const result = parseToolResult(
      await handleTool('finalize_retro', { session_id: 'SESS-002' }, db)
    );

    expect(result.success).toBe(true);
    expect(result.mvp_agent).toBeNull();
    expect(result.top_went_well).toEqual([]);
    expect(result.top_went_wrong).toEqual([]);
    expect(result.top_suggestions).toEqual([]);
  });

  it('getRetro handles summary with null top_* fields', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM retro_review')) {
        return { results: [] };
      }
      if (operation === 'first' && sql.includes('SELECT * FROM retro_summary')) {
        return {
          session_id: 'SESS-001',
          top_went_well: null,
          top_went_wrong: null,
          top_suggestions: null,
        };
      }
      if (operation === 'first' && sql.includes('SELECT * FROM session')) {
        return { id: 'SESS-001', status: 'retro' };
      }
      return operation === 'all' ? { results: [] } : null;
    });
    const result = parseToolResult(await handleTool('get_retro', { session_id: 'SESS-001' }, db));
    const summary = result.summary as Record<string, unknown>;
    expect(summary.top_went_well).toEqual([]);
    expect(summary.top_went_wrong).toEqual([]);
    expect(summary.top_suggestions).toEqual([]);
  });

  it('finalizeRetro handles DB rows with null array fields', async () => {
    const db = createD1Mock((sql, _args, operation) => {
      if (operation === 'all' && sql.includes('SELECT * FROM retro_review')) {
        return {
          results: [
            {
              agent: 'codex',
              went_well: null,
              went_wrong: null,
              suggestions: null,
              mvp_vote: null,
            },
            {
              agent: 'claude',
              went_well: null,
              went_wrong: null,
              suggestions: null,
              mvp_vote: null,
            },
            {
              agent: 'opencode',
              went_well: null,
              went_wrong: null,
              suggestions: null,
              mvp_vote: null,
            },
            {
              agent: 'hermes',
              went_well: null,
              went_wrong: null,
              suggestions: null,
              mvp_vote: null,
            },
          ],
        };
      }
      return operation === 'all' ? { results: [] } : { success: true, meta: {} };
    });
    const result = parseToolResult(
      await handleTool('finalize_retro', { session_id: 'SESS-001' }, db)
    );
    expect(result.success).toBe(true);
    expect(result.top_went_well).toEqual([]);
  });
});
