/* v8 ignore file */
export const queryGroups = {
  dashboard: 'Dashboard snapshot queries live in src/tools/dashboard.ts.',
  session: 'Session lifecycle queries live in src/tools/session.ts.',
  retro: 'Retrospective queries live in src/tools/retro.ts.',
  election: 'Leader election queries live in src/tools/election.ts.',
  state: 'Agent state queries live in src/tools/state.ts.',
  task: 'Task registry queries live in src/tools/task.ts.',
  discussion: 'Discussion queries live in src/tools/discussion.ts.',
  vote: 'Vote queries live in src/tools/vote.ts.',
  handoff: 'Handoff queries live in src/tools/handoff.ts.',
  lock: 'Task lock queries live in src/tools/lock.ts.',
  guard: 'Agent start guard queries live in src/tools/guard.ts.',
  file: 'File change queries live in src/tools/file.ts.',
  event: 'Event log queries live in src/tools/event.ts.',
} as const;
