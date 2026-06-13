/**
 * Project view data layer — groups sessions by their local folder (session.project).
 *
 * D1 SSOT, no cache. Kept in its own module (not data.ts) so the per-project
 * grouping can evolve without touching the shared dashboard snapshot shape.
 * The dashboard server can't read a client's filesystem, so `project` is whatever
 * local folder path the AI passed to start_session; legacy sessions have none and
 * fall under the UNASSIGNED group.
 */

export type ProjectSessionRow = {
  id: string;
  title: string;
  leader: string;
  status: string;
  project: string | null;
  goals: Array<string>;
  created_at: string;
  closed_at: string | null;
};

export type ProjectGroup = {
  project: string | null; // full folder path, or null for legacy sessions
  name: string; // basename for display (e.g. "MACHO-GPT SDLC")
  total: number;
  active: number; // sessions in a live phase (active/retro/voting)
  sessions: Array<ProjectSessionRow>;
};

export type ProjectSessions = {
  snapshot_at: string;
  total_sessions: number;
  project_count: number;
  projects: Array<ProjectGroup>;
};

const UNASSIGNED = '(미지정)';
const LIVE_STATUSES = new Set(['active', 'retro', 'voting', 'closing']);

/** Last path segment of a local folder, handling both / and \ separators. */
function basename(path: string): string {
  const segments = path.split(/[/\\]+/).filter((s) => s.length > 0);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

function parseGoals(raw: unknown): Array<string> {
  if (typeof raw !== 'string') {return [];}
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : [];
  } catch {
    return [];
  }
}

function toRow(record: Record<string, unknown>): ProjectSessionRow {
  const project =
    typeof record.project === 'string' && record.project.trim() ? record.project.trim() : null;
  return {
    id: String(record.id ?? ''),
    title: String(record.title ?? ''),
    leader: String(record.leader ?? ''),
    status: String(record.status ?? ''),
    project,
    goals: parseGoals(record.goals),
    created_at: String(record.created_at ?? ''),
    closed_at: typeof record.closed_at === 'string' ? record.closed_at : null,
  };
}

/**
 * Group every session by its local folder. Groups are ordered by live-session
 * count (busiest project first), then by most-recent session; sessions within a
 * group put live phases first, then newest.
 */
export async function buildProjectSessions(db: D1Database): Promise<ProjectSessions> {
  const snapshot_at = new Date().toISOString();

  const result = await db
    .prepare(
      'SELECT id,title,leader,status,project,goals,created_at,closed_at FROM session ORDER BY created_at DESC'
    )
    .all<Record<string, unknown>>();

  const rows = (result.results ?? []).map(toRow);

  // Group by full project path (null → UNASSIGNED bucket).
  const buckets = new Map<string, Array<ProjectSessionRow>>();
  for (const row of rows) {
    const key = row.project ?? UNASSIGNED;
    const list = buckets.get(key);
    if (list) {list.push(row);}
    else {buckets.set(key, [row]);}
  }

  const projects: Array<ProjectGroup> = [...buckets.entries()].map(([key, sessions]) => {
    const isUnassigned = key === UNASSIGNED;
    const sorted = [...sessions].sort((a, b) => {
      const aLive = LIVE_STATUSES.has(a.status) ? 0 : 1;
      const bLive = LIVE_STATUSES.has(b.status) ? 0 : 1;
      if (aLive !== bLive) {return aLive - bLive;}
      return b.created_at.localeCompare(a.created_at);
    });
    return {
      project: isUnassigned ? null : key,
      name: isUnassigned ? UNASSIGNED : basename(key),
      total: sorted.length,
      active: sorted.filter((s) => LIVE_STATUSES.has(s.status)).length,
      sessions: sorted,
    };
  });

  projects.sort((a, b) => {
    if (a.active !== b.active) {return b.active - a.active;}
    const aRecent = a.sessions[0]?.created_at ?? '';
    const bRecent = b.sessions[0]?.created_at ?? '';
    return bRecent.localeCompare(aRecent);
  });

  return {
    snapshot_at,
    total_sessions: rows.length,
    project_count: projects.length,
    projects,
  };
}
