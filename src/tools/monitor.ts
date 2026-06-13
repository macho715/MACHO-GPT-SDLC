import {
  ok,
  type ContractedToolDefinition,
  type ToolDefinition,
  type ToolHandler,
  type ToolResult,
} from '../lib/mcp';

const agentEnum = ['codex', 'claude', 'opencode', 'minimax'] as const;

export const monitorTools = [
  {
    name: 'audit_tool_contracts',
    description:
      'tool schema/description 품질을 감사합니다. 설명 불명확·실패조건 누락·required 미지정 등 smell을 탐지하고 결과를 D1에 기록합니다. smell 비율 30% 초과 시 AMBER 반환.',
    inputSchema: {
      type: 'object',
      properties: {
        schema_version: { type: 'string', description: '감사 대상 스키마 버전 레이블' },
      },
    },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'get_d1_health',
    description:
      'D1 quota/latency 건강 상태를 조회합니다. 에러율 >5%·평균 지연 >500ms·일 write 추정 >80k 시 AMBER 반환.',
    inputSchema: {
      type: 'object',
      properties: {
        window_minutes: { type: 'number', default: 60, description: '집계 시간 창 (분)' },
      },
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'heartbeat',
    description:
      'agent 활성 상태를 갱신합니다. 작업 중 5분마다 호출하세요. 미갱신 시 reap_stale_agents가 lock을 해제합니다.',
    inputSchema: {
      type: 'object',
      required: ['agent'],
      properties: {
        agent: { type: 'string', enum: agentEnum },
        active_task: { type: 'string' },
        active_lock: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false, idempotentHint: true },
  },
  {
    name: 'reap_stale_agents',
    description:
      'heartbeat 미갱신 agent의 task lock을 해제하고 상태를 idle로 정리합니다. stale_minutes 초과 시 처리.',
    inputSchema: {
      type: 'object',
      properties: {
        stale_minutes: {
          type: 'number',
          default: 30,
          description: '이 시간 이상 heartbeat 없으면 stale 처리',
        },
      },
    },
    annotations: { readOnlyHint: false },
  },
] satisfies ToolDefinition[];

async function auditToolContracts(
  args: Record<string, unknown>,
  db: D1Database,
  allTools: ContractedToolDefinition[],
): Promise<ToolResult> {
  const schema_version = (args.schema_version as string) ?? 'unknown';
  const smells: Array<{ tool: string; issue: string; severity: 'high' | 'medium' | 'low' }> = [];

  for (const tool of allTools) {
    const desc = tool.description ?? '';
    if (desc.length < 20) {
      smells.push({ tool: tool.name, issue: '설명 20자 미만 — 목적 불명확', severity: 'high' });
    }
    const isWrite = tool.annotations?.readOnlyHint !== true;
    if (isWrite && !/실패|금지|주의|필수|먼저|반드시|에러|fail|error/i.test(desc)) {
      smells.push({ tool: tool.name, issue: 'write tool인데 실패조건/제약 미명시', severity: 'medium' });
    }
    const schema = tool.inputSchema as { required?: string[]; properties?: object } | undefined;
    const hasProps =
      schema?.properties !== undefined && Object.keys(schema.properties).length > 0;
    if (hasProps && (!schema?.required || schema.required.length === 0)) {
      smells.push({ tool: tool.name, issue: 'properties 있으나 required 미지정', severity: 'low' });
    }
  }

  const contract_hash = allTools
    .map((t) => t.contract_hash)
    .join('|')
    .slice(0, 64);
  const smellRate = allTools.length > 0 ? smells.length / allTools.length : 0;

  await db
    .prepare(
      `INSERT INTO tool_contract_audit (schema_version, contract_hash, total_tools, smell_count, smells)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(schema_version, contract_hash, allTools.length, smells.length, JSON.stringify(smells))
    .run();

  return ok({
    schema_version,
    contract_hash,
    total_tools: allTools.length,
    smell_count: smells.length,
    smell_rate: `${Math.round(smellRate * 100)}%`,
    verdict: smellRate > 0.3 ? 'AMBER' : 'PASS',
    smells: smells.slice(0, 20),
    note: '외부 연구 기준 MCP tool 97%가 1개 이상 smell 보유. 30% 이하 유지 목표.',
  });
}

async function getD1Health(args: Record<string, unknown>, db: D1Database): Promise<ToolResult> {
  const win = (args.window_minutes as number) ?? 60;

  const stats = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_ops,
         AVG(latency_ms) AS avg_latency,
         MAX(latency_ms) AS max_latency,
         SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) AS error_count,
         SUM(CASE WHEN op_type='write' THEN 1 ELSE 0 END) AS write_ops,
         SUM(CASE WHEN op_type='read'  THEN 1 ELSE 0 END) AS read_ops
       FROM d1_op_log
       WHERE created_at > datetime('now', '-' || ? || ' minutes')`,
    )
    .bind(win)
    .first<Record<string, number>>();

  const slowest = await db
    .prepare(
      `SELECT tool_name, latency_ms, agent, created_at FROM d1_op_log
       WHERE created_at > datetime('now', '-' || ? || ' minutes')
       ORDER BY latency_ms DESC LIMIT 5`,
    )
    .bind(win)
    .all();

  const total = stats?.total_ops ?? 0;
  const errors = stats?.error_count ?? 0;
  const avgLat = Math.round(stats?.avg_latency ?? 0);
  const writeOps = stats?.write_ops ?? 0;
  const errRate = total > 0 ? errors / total : 0;
  const projectedDailyWrites = win > 0 ? Math.round(writeOps * (1440 / win)) : 0;

  const alerts: string[] = [];
  let verdict = 'PASS';
  if (errRate > 0.05) {
    verdict = 'AMBER';
    alerts.push(`에러율 ${Math.round(errRate * 100)}% > 5%`);
  }
  if (avgLat > 500) {
    verdict = 'AMBER';
    alerts.push(`평균 지연 ${avgLat}ms > 500ms`);
  }
  if (projectedDailyWrites > 80000) {
    verdict = 'AMBER';
    alerts.push(`일 write 추정 ${projectedDailyWrites} → quota 80% 근접`);
  }

  return ok({
    window_minutes: win,
    verdict,
    alerts,
    total_ops: total,
    read_ops: stats?.read_ops ?? 0,
    write_ops: writeOps,
    avg_latency_ms: avgLat,
    max_latency_ms: stats?.max_latency ?? 0,
    error_count: errors,
    error_rate: `${Math.round(errRate * 100)}%`,
    projected_daily_writes: projectedDailyWrites,
    slowest_ops: slowest.results,
  });
}

async function heartbeatHandler(
  args: Record<string, unknown>,
  db: D1Database,
): Promise<ToolResult> {
  const agent = args.agent as string;
  const active_task = (args.active_task as string | undefined) ?? null;
  const active_lock = (args.active_lock as string | undefined) ?? null;

  await db
    .prepare(
      `INSERT INTO agent_heartbeat (agent, last_beat, active_task, active_lock)
       VALUES (?, datetime('now'), ?, ?)
       ON CONFLICT(agent) DO UPDATE SET
         last_beat   = datetime('now'),
         active_task = excluded.active_task,
         active_lock = excluded.active_lock`,
    )
    .bind(agent, active_task, active_lock)
    .run();

  return ok({ success: true, agent, beat_at: new Date().toISOString() });
}

type HeartbeatRow = { agent: string; active_lock: string | null };

async function reapStaleAgents(
  args: Record<string, unknown>,
  db: D1Database,
): Promise<ToolResult> {
  const staleMin = (args.stale_minutes as number) ?? 30;

  const stale = await db
    .prepare(
      `SELECT agent, active_lock FROM agent_heartbeat
       WHERE last_beat < datetime('now', '-' || ? || ' minutes')`,
    )
    .bind(staleMin)
    .all<HeartbeatRow>();

  const reaped: string[] = [];
  for (const row of stale.results) {
    if (row.active_lock) {
      await db
        .prepare(`DELETE FROM task_lock WHERE task_id=? AND locked_by=?`)
        .bind(row.active_lock, row.agent)
        .run();
    }
    await db
      .prepare(`UPDATE ai_state SET status='idle', updated_at=datetime('now') WHERE agent=?`)
      .bind(row.agent)
      .run();
    await db
      .prepare(`INSERT INTO event_log (event_type, agent, payload) VALUES ('warning', ?, ?)`)
      .bind(
        row.agent,
        JSON.stringify({
          action: 'reaped',
          reason: `stale > ${staleMin}min`,
          released_lock: row.active_lock,
        }),
      )
      .run();
    reaped.push(row.agent);
  }

  return ok({
    success: true,
    reaped_agents: reaped,
    count: reaped.length,
    message: reaped.length > 0 ? `${reaped.length}개 stale agent 정리 완료` : 'stale agent 없음',
  });
}

export function createMonitorHandlers(
  allTools: ContractedToolDefinition[],
): Record<string, ToolHandler> {
  return {
    audit_tool_contracts: (args, db) => auditToolContracts(args, db, allTools),
    get_d1_health: getD1Health,
    heartbeat: heartbeatHandler,
    reap_stale_agents: reapStaleAgents,
  };
}
