# MCP DEV HUB v3 Tool Inventory

Source captured from `v3_tools.ts`.

Baseline result: `v3_tools.ts` defines 31 tools. The plan mentioned 32 tools, but `get_file_history` exists only in the older root `tools_index.ts` and README text, not in `v3_tools.ts`.

| #   | Tool                  | Domain file     | Preserved in `src/tools` |
| --- | --------------------- | --------------- | ------------------------ |
| 1   | `get_dashboard`       | `dashboard.ts`  | yes                      |
| 2   | `start_session`       | `session.ts`    | yes                      |
| 3   | `get_session`         | `session.ts`    | yes                      |
| 4   | `close_session`       | `session.ts`    | yes                      |
| 5   | `submit_retro`        | `retro.ts`      | yes                      |
| 6   | `get_retro`           | `retro.ts`      | yes                      |
| 7   | `finalize_retro`      | `retro.ts`      | yes                      |
| 8   | `start_election`      | `election.ts`   | yes                      |
| 9   | `cast_election_vote`  | `election.ts`   | yes                      |
| 10  | `get_election_result` | `election.ts`   | yes                      |
| 11  | `get_state`           | `state.ts`      | yes                      |
| 12  | `update_state`        | `state.ts`      | yes                      |
| 13  | `create_task`         | `task.ts`       | yes                      |
| 14  | `list_tasks`          | `task.ts`       | yes                      |
| 15  | `update_task`         | `task.ts`       | yes                      |
| 16  | `start_discussion`    | `discussion.ts` | yes                      |
| 17  | `post_message`        | `discussion.ts` | yes                      |
| 18  | `get_discussion`      | `discussion.ts` | yes                      |
| 19  | `close_discussion`    | `discussion.ts` | yes                      |
| 20  | `check_consensus`     | `discussion.ts` | yes                      |
| 21  | `create_vote`         | `vote.ts`       | yes                      |
| 22  | `cast_vote`           | `vote.ts`       | yes                      |
| 23  | `get_vote_result`     | `vote.ts`       | yes                      |
| 24  | `log_handoff`         | `handoff.ts`    | yes                      |
| 25  | `get_handoff`         | `handoff.ts`    | yes                      |
| 26  | `ack_handoff`         | `handoff.ts`    | yes                      |
| 27  | `lock_task`           | `lock.ts`       | yes                      |
| 28  | `unlock_task`         | `lock.ts`       | yes                      |
| 29  | `record_file_change`  | `file.ts`       | yes                      |
| 30  | `broadcast_event`     | `event.ts`      | yes                      |
| 31  | `get_events`          | `event.ts`      | yes                      |

Verification command:

```bash
rg "name:\s*'([^']+)'" v3_tools.ts src/tools
```
