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
]);

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

  return handler(args, db);
}
