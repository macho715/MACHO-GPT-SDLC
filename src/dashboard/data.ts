/**
 * Dashboard data layer — D1 SSOT, no cache.
 * Shared by the get_dashboard MCP tool and the GET /api/* HTTP routes so the
 * snapshot shape never drifts between the two surfaces.
 */

export type DashboardData = {
  snapshot_at: string;
  active_session: Record<string, unknown> | null;
  agents: Array<Record<string, unknown>>;
  active_tasks: Array<Record<string, unknown>>;
  active_discussions: Array<Record<string, unknown>>;
  pending_votes: Array<Record<string, unknown>>;
  pending_handoffs: Array<Record<string, unknown>>;
  recent_events: Array<Record<string, unknown>>;
};

export async function buildDashboardData(db: D1Database): Promise<DashboardData> {
  const [agents, activeSess, tasks, discussions, votes, handoffs, events] = await Promise.all([
    db.prepare('SELECT * FROM ai_state ORDER BY updated_at DESC').all(),
    db
      .prepare(
        "SELECT * FROM session WHERE status IN ('active','retro','voting') ORDER BY created_at DESC LIMIT 1"
      )
      .first<Record<string, unknown>>(),
    db.prepare("SELECT * FROM tasks WHERE status!='done' ORDER BY created_at DESC LIMIT 10").all(),
    db
      .prepare(
        "SELECT * FROM discussion_thread WHERE status IN ('open','voting') ORDER BY updated_at DESC LIMIT 5"
      )
      .all(),
    db
      .prepare(
        "SELECT v.*,COUNT(b.id) as ballot_count FROM vote v LEFT JOIN vote_ballot b ON v.id=b.vote_id WHERE v.status='open' GROUP BY v.id"
      )
      .all(),
    db
      .prepare("SELECT * FROM handoff_log WHERE status='pending' ORDER BY created_at DESC LIMIT 5")
      .all(),
    db.prepare('SELECT * FROM event_log ORDER BY created_at DESC LIMIT 15').all(),
  ]);

  return {
    snapshot_at: new Date().toISOString(),
    active_session: activeSess ?? null,
    agents: agents.results,
    active_tasks: tasks.results,
    active_discussions: discussions.results,
    pending_votes: votes.results,
    pending_handoffs: handoffs.results,
    recent_events: events.results,
  };
}

// ── MCP server status ────────────────────────────────────────────

export type Presence = 'online' | 'stale' | 'offline' | 'unknown';

export type AgentPresence = {
  agent: string;
  status: string;
  task_title: string | null;
  progress: number;
  updated_at: string | null;
  presence: Presence;
  age_sec: number | null;
};

export type McpStatusMeta = {
  server: string;
  version: string;
  features: string[];
  toolCount: number;
};

export type McpStatus = {
  ok: boolean;
  server: string;
  version: string;
  features: string[];
  tool_count: number;
  db: { connected: boolean };
  agents: AgentPresence[];
  blocked_agents: number;
  blocked_tasks: number;
  pending_handoffs: number;
  last_event_at: string | null;
  last_event_age_sec: number | null;
  zero_flags: { blocked_escalation: boolean; handoff_pending: boolean };
  checked_at: string;
};

// Heartbeat thresholds (seconds). online ≤ 2m, stale ≤ 10m, else offline.
const ONLINE_SEC = 120;
const STALE_SEC = 600;

// SQLite datetime('now') is space-separated UTC ("YYYY-MM-DD HH:MM:SS").
// JS Date parsing of that form is engine-dependent, so normalise to ISO-UTC.
function ageSeconds(updatedAt: string | null, now: number): number | null {
  if (!updatedAt) {
    return null;
  }
  const iso = updatedAt.includes('T') ? updatedAt : updatedAt.replace(' ', 'T');
  const ts = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(ts)) {
    return null;
  }
  return Math.max(0, Math.round((now - ts) / 1000));
}

function derivePresence(ageSec: number | null): Presence {
  if (ageSec === null) {
    return 'unknown';
  }
  if (ageSec <= ONLINE_SEC) {
    return 'online';
  }
  if (ageSec <= STALE_SEC) {
    return 'stale';
  }
  return 'offline';
}

export async function buildMcpStatus(db: D1Database, meta: McpStatusMeta): Promise<McpStatus> {
  const now = Date.now();

  let dbConnected = false;
  let agentRows: Array<Record<string, unknown>> = [];
  let blockedAgents = 0;
  let blockedTasks = 0;
  let pendingHandoffs = 0;
  let lastEventAt: string | null = null;

  try {
    const ping = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
    dbConnected = ping?.ok === 1;

    const [agents, blockedA, blockedT, handoffs, lastEvent] = await Promise.all([
      db
        .prepare('SELECT agent,status,task_title,progress,updated_at FROM ai_state ORDER BY agent')
        .all(),
      db
        .prepare("SELECT COUNT(*) AS c FROM ai_state WHERE status='blocked'")
        .first<{ c: number }>(),
      db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status='blocked'").first<{ c: number }>(),
      db
        .prepare("SELECT COUNT(*) AS c FROM handoff_log WHERE status='pending'")
        .first<{ c: number }>(),
      db
        .prepare('SELECT created_at FROM event_log ORDER BY created_at DESC LIMIT 1')
        .first<{ created_at: string }>(),
    ]);

    agentRows = agents.results;
    blockedAgents = blockedA?.c ?? 0;
    blockedTasks = blockedT?.c ?? 0;
    pendingHandoffs = handoffs?.c ?? 0;
    lastEventAt = lastEvent?.created_at ?? null;
  } catch {
    dbConnected = false;
  }

  const agentPresence: AgentPresence[] = agentRows.map((row) => {
    const updatedAt = (row.updated_at as string | null) ?? null;
    const age = ageSeconds(updatedAt, now);
    return {
      agent: String(row.agent ?? ''),
      status: String(row.status ?? 'unknown'),
      task_title: (row.task_title as string | null) ?? null,
      progress: Number(row.progress ?? 0),
      updated_at: updatedAt,
      presence: derivePresence(age),
      age_sec: age,
    };
  });

  return {
    ok: dbConnected,
    server: meta.server,
    version: meta.version,
    features: meta.features,
    tool_count: meta.toolCount,
    db: { connected: dbConnected },
    agents: agentPresence,
    blocked_agents: blockedAgents,
    blocked_tasks: blockedTasks,
    pending_handoffs: pendingHandoffs,
    last_event_at: lastEventAt,
    last_event_age_sec: ageSeconds(lastEventAt, now),
    // MACHO ZERO gates surfaced as flags: ≥2 blocked → T2 escalation; any
    // pending handoff → T1 unacknowledged. The UI paints these red / amber.
    zero_flags: {
      blocked_escalation: blockedAgents + blockedTasks >= 2,
      handoff_pending: pendingHandoffs > 0,
    },
    checked_at: new Date().toISOString(),
  };
}
