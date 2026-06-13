import { describe, expect, it } from 'vitest';
import { buildDashboardData, buildMcpStatus, type McpStatusMeta } from './data';
import { createD1Mock } from '../../tests/helpers/d1Mock';

const meta: McpStatusMeta = {
  server: 'mcp-dev-hub',
  version: '3.0.0',
  features: ['state', 'session'],
  toolCount: 32,
};

describe('buildDashboardData', () => {
  it('returns an empty snapshot when D1 is empty', async () => {
    const db = createD1Mock((_sql, _args, op) => (op === 'first' ? null : { results: [] }));
    const data = await buildDashboardData(db);

    expect(data.active_session).toBeNull();
    expect(data.agents).toEqual([]);
    expect(data.active_tasks).toEqual([]);
    expect(data.pending_handoffs).toEqual([]);
    expect(typeof data.snapshot_at).toBe('string');
  });
});

describe('buildMcpStatus', () => {
  const nowIso = new Date().toISOString();

  const handler = (sql: string, _args: unknown[], op: 'first' | 'all' | 'run') => {
    if (sql.includes('SELECT 1 AS ok')) {
      return { ok: 1 };
    }
    if (sql.includes('FROM ai_state ORDER BY agent')) {
      return {
        results: [
          {
            agent: 'codex',
            status: 'working',
            task_title: 'API',
            progress: 50,
            updated_at: nowIso,
          },
          {
            agent: 'claude',
            status: 'idle',
            task_title: null,
            progress: 0,
            updated_at: '2020-01-01 00:00:00',
          },
        ],
      };
    }
    if (sql.includes("ai_state WHERE status='blocked'")) {
      return { c: 1 };
    }
    if (sql.includes("tasks WHERE status='blocked'")) {
      return { c: 1 };
    }
    if (sql.includes("handoff_log WHERE status='pending'")) {
      return { c: 1 };
    }
    if (sql.includes('FROM event_log ORDER BY created_at DESC LIMIT 1')) {
      return { created_at: nowIso };
    }
    return op === 'all' ? { results: [] } : null;
  };

  it('reports server meta and a healthy D1 ping', async () => {
    const status = await buildMcpStatus(createD1Mock(handler), meta);
    expect(status.ok).toBe(true);
    expect(status.db.connected).toBe(true);
    expect(status.server).toBe('mcp-dev-hub');
    expect(status.tool_count).toBe(32);
  });

  it('derives heartbeat presence from updated_at age', async () => {
    const status = await buildMcpStatus(createD1Mock(handler), meta);
    const byAgent = Object.fromEntries(status.agents.map((a) => [a.agent, a.presence]));
    expect(byAgent.codex).toBe('online');
    expect(byAgent.claude).toBe('offline');
  });

  it('raises ZERO flags when blocked>=2 and a handoff is pending', async () => {
    const status = await buildMcpStatus(createD1Mock(handler), meta);
    expect(status.blocked_agents + status.blocked_tasks).toBe(2);
    expect(status.zero_flags.blocked_escalation).toBe(true);
    expect(status.zero_flags.handoff_pending).toBe(true);
  });

  it('degrades to disconnected when D1 throws', async () => {
    const status = await buildMcpStatus(
      createD1Mock(() => {
        throw new Error('db down');
      }),
      meta
    );
    expect(status.ok).toBe(false);
    expect(status.db.connected).toBe(false);
    expect(status.agents).toEqual([]);
  });
});
