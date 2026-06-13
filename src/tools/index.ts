import { dashboardHandlers, dashboardTools } from './dashboard';
import { sessionHandlers, sessionTools } from './session';
import { retroHandlers, retroTools } from './retro';
import { electionHandlers, electionTools } from './election';
import { stateHandlers, stateTools } from './state';
import { taskHandlers, taskTools } from './task';
import { discussionHandlers, discussionTools } from './discussion';
import { voteHandlers, voteTools } from './vote';
import { handoffHandlers, handoffTools } from './handoff';
import { lockHandlers, lockTools } from './lock';
import { fileHandlers, fileTools } from './file';
import { eventHandlers, eventTools } from './event';
import { guardHandlers, guardTools } from './guard';
import { monitorTools, createMonitorHandlers } from './monitor';
import { instrument } from '../lib/instrument';
import { fail, withToolContracts, type ToolHandler, type ToolResult } from '../lib/mcp';

export const tools = withToolContracts([
  ...guardTools,
  ...dashboardTools,
  ...sessionTools,
  ...retroTools,
  ...electionTools,
  ...stateTools,
  ...taskTools,
  ...discussionTools,
  ...voteTools,
  ...handoffTools,
  ...lockTools,
  ...fileTools,
  ...eventTools,
  ...monitorTools,
]);

const monitorHandlers = createMonitorHandlers(tools);

const handlers: Record<string, ToolHandler> = {
  ...guardHandlers,
  ...dashboardHandlers,
  ...sessionHandlers,
  ...retroHandlers,
  ...electionHandlers,
  ...stateHandlers,
  ...taskHandlers,
  ...discussionHandlers,
  ...voteHandlers,
  ...handoffHandlers,
  ...lockHandlers,
  ...fileHandlers,
  ...eventHandlers,
  ...monitorHandlers,
} satisfies Record<string, ToolHandler>;

export async function handleTool(
  name: string,
  args: Record<string, unknown>,
  db: D1Database
): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) {
    return fail(`Unknown tool: ${name}`);
  }

  const toolDef = tools.find((t) => t.name === name);
  const isReadOnly = toolDef?.annotations?.readOnlyHint === true;

  return instrument(
    db,
    {
      tool_name: name,
      agent: args.agent as string | undefined,
      task_id: args.task_id as string | undefined,
      op_type: isReadOnly ? 'read' : 'write',
    },
    () => handler(args, db),
  );
}
