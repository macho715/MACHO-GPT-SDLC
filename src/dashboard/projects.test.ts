import { describe, expect, it } from 'vitest';
import { buildProjectSessions } from './projects';
import { createD1Mock } from '../../tests/helpers/d1Mock';

type Row = Record<string, unknown>;

const sessionsMock = (rows: Array<Row>) =>
  createD1Mock((sql, _args, op) => {
    if (op === 'all' && sql.includes('FROM session')) {
      return { results: rows };
    }
    return { results: [] };
  });

describe('buildProjectSessions', () => {
  it('returns an empty view when there are no sessions', async () => {
    const db = sessionsMock([]);
    const view = await buildProjectSessions(db);

    expect(view.projects).toEqual([]);
    expect(view.total_sessions).toBe(0);
    expect(view.project_count).toBe(0);
    expect(typeof view.snapshot_at).toBe('string');
  });

  it('groups sessions by local folder and derives a basename', async () => {
    const db = sessionsMock([
      {
        id: 'SESS-3',
        title: 'alpha live',
        leader: 'claude',
        status: 'active',
        project: '/home/user/alpha',
        goals: '[]',
        created_at: '2026-06-13T10:00:00Z',
        closed_at: null,
      },
      {
        id: 'SESS-1',
        title: 'alpha old',
        leader: 'codex',
        status: 'closed',
        project: '/home/user/alpha',
        goals: '[]',
        created_at: '2026-06-10T09:00:00Z',
        closed_at: '2026-06-11T09:00:00Z',
      },
      {
        id: 'SESS-2',
        title: 'beta done',
        leader: 'hermes',
        status: 'closed',
        project: 'C:\\work\\beta',
        goals: '[]',
        created_at: '2026-06-12T09:00:00Z',
        closed_at: null,
      },
    ]);
    const view = await buildProjectSessions(db);

    expect(view.total_sessions).toBe(3);
    expect(view.project_count).toBe(2);

    const alpha = view.projects.find((p) => p.project === '/home/user/alpha');
    expect(alpha?.name).toBe('alpha');
    expect(alpha?.total).toBe(2);
    expect(alpha?.active).toBe(1);

    const beta = view.projects.find((p) => p.project === 'C:\\work\\beta');
    expect(beta?.name).toBe('beta'); // Windows-style separators handled
  });

  it('buckets sessions with no project under the unassigned group', async () => {
    const db = sessionsMock([
      {
        id: 'SESS-9',
        title: 'legacy',
        leader: 'claude',
        status: 'active',
        project: null,
        goals: '[]',
        created_at: '2026-06-11T09:00:00Z',
        closed_at: null,
      },
    ]);
    const view = await buildProjectSessions(db);

    expect(view.projects).toHaveLength(1);
    expect(view.projects[0].project).toBeNull();
    expect(view.projects[0].name).toBe('(미지정)');
  });

  it('orders groups by live-session count, then sessions live-first then newest', async () => {
    const db = sessionsMock([
      {
        id: 'SESS-A1',
        title: 'busy active',
        leader: 'claude',
        status: 'active',
        project: '/p/busy',
        goals: '[]',
        created_at: '2026-06-13T08:00:00Z',
        closed_at: null,
      },
      {
        id: 'SESS-A2',
        title: 'busy old',
        leader: 'codex',
        status: 'closed',
        project: '/p/busy',
        goals: '[]',
        created_at: '2026-06-09T08:00:00Z',
        closed_at: null,
      },
      {
        id: 'SESS-B1',
        title: 'quiet done',
        leader: 'hermes',
        status: 'closed',
        project: '/p/quiet',
        goals: '[]',
        created_at: '2026-06-13T23:00:00Z',
        closed_at: null,
      },
    ]);
    const view = await buildProjectSessions(db);

    // /p/busy has a live session → first even though /p/quiet has a newer session.
    expect(view.projects[0].project).toBe('/p/busy');
    expect(view.projects[1].project).toBe('/p/quiet');
    // Within /p/busy: the active session sorts before the closed one.
    expect(view.projects[0].sessions[0].id).toBe('SESS-A1');
    expect(view.projects[0].sessions[1].id).toBe('SESS-A2');
  });

  it('parses goals JSON and tolerates malformed goals', async () => {
    const db = sessionsMock([
      {
        id: 'SESS-G',
        title: 'with goals',
        leader: 'claude',
        status: 'active',
        project: '/p/g',
        goals: '["ship","test"]',
        created_at: '2026-06-13T08:00:00Z',
        closed_at: null,
      },
      {
        id: 'SESS-X',
        title: 'bad goals',
        leader: 'codex',
        status: 'active',
        project: '/p/g',
        goals: 'not-json',
        created_at: '2026-06-13T07:00:00Z',
        closed_at: null,
      },
    ]);
    const view = await buildProjectSessions(db);
    const sessions = view.projects[0].sessions;

    expect(sessions.find((s) => s.id === 'SESS-G')?.goals).toEqual(['ship', 'test']);
    expect(sessions.find((s) => s.id === 'SESS-X')?.goals).toEqual([]);
  });
});
