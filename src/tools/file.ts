import { ok, type ToolDefinition, type ToolHandler, type ToolResult } from '../lib/mcp';

export const fileTools = [
  {
    name: 'record_file_change',
    description: '파일 변경 기록.',
    inputSchema: {
      type: 'object',
      required: ['agent', 'file_path', 'change_type', 'summary'],
      properties: {
        agent: { type: 'string', enum: ['codex', 'claude', 'opencode', 'hermes'] },
        task_id: { type: 'string' },
        file_path: { type: 'string' },
        change_type: { type: 'string', enum: ['create', 'modify', 'delete'] },
        summary: { type: 'string' },
        diff_snippet: { type: 'string' },
      },
    },
    annotations: { readOnlyHint: false },
  },
] satisfies ToolDefinition[];

export async function recordFileChange(
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const { agent, task_id, file_path, change_type, summary, diff_snippet } = args as Record<
    string,
    string
  >;
  await db
    .prepare(
      `INSERT INTO file_changes (agent,task_id,file_path,change_type,summary,diff_snippet) VALUES (?,?,?,?,?,?)`
    )
    .bind(agent, task_id ?? null, file_path, change_type, summary, diff_snippet ?? null)
    .run();
  return ok({ success: true, file_path, change_type });
}

export const fileHandlers = {
  record_file_change: recordFileChange,
} satisfies Record<string, ToolHandler>;
