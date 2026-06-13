export async function instrument<T>(
  db: D1Database,
  meta: {
    tool_name: string;
    agent?: string;
    task_id?: string;
    op_type: 'read' | 'write';
  },
  fn: () => Promise<T>
): Promise<T> {
  const t0 = Date.now();
  let error_code: string | null = null;
  try {
    const result = await fn();
    return result;
  } catch (e) {
    error_code = e instanceof Error ? e.name : 'UNKNOWN';
    throw e;
  } finally {
    const latency = Date.now() - t0;
    try {
      await db
        .prepare(
          `INSERT INTO d1_op_log (tool_name, agent, task_id, op_type, latency_ms, error_code)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          meta.tool_name,
          meta.agent ?? null,
          meta.task_id ?? null,
          meta.op_type,
          latency,
          error_code
        )
        .run();
    } catch {
      // best-effort: logging failure must not surface to the caller
    }
  }
}
