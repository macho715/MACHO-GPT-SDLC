import { describe, expect, it } from 'vitest';
import { nextId } from './mcp';
import { createD1Mock } from '../../tests/helpers/d1Mock';

describe('nextId', () => {
  it('avoids collision after a middle row is deleted (MAX-based, not COUNT-based)', async () => {
    // Live repro: SESS-001 was deleted, only SESS-002 remains.
    // COUNT(*) = 1  → old logic returns SESS-002 → UNIQUE constraint collision.
    // MAX(suffix) = 2 → correct logic returns SESS-003.
    const db = createD1Mock((sql) => {
      if (/FROM session/i.test(sql)) {
        return { c: 1, m: 2 };
      }
      return null;
    });
    const id = await nextId(db, 'session', 'SESS');
    expect(id).toBe('SESS-003');
  });

  it('returns PREFIX-001 for an empty table', async () => {
    const db = createD1Mock(() => ({ c: 0, m: null }));
    expect(await nextId(db, 'session', 'SESS')).toBe('SESS-001');
  });

  it('rejects tables not in the allow-list', async () => {
    const db = createD1Mock(() => null);
    await expect(nextId(db, 'evil; DROP TABLE session', 'X')).rejects.toThrow();
  });
});
