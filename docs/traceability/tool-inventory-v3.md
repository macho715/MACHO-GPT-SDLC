# MCP DEV HUB v3 Tool Inventory

Source: active `src/tools/index.ts` registry.

Contract metadata:

- `schema_version`: `v3.1`
- `contract_hash`: deterministic FNV-1a hash of each tool name, description, input schema, annotations, and schema version.
- Snapshot test: `src/tools/tool-contract.test.ts`

Baseline result: active v3 defines 37 tools.

| #   | Tool                   | Domain file     | schema_version | contract_hash      |
| --- | ---------------------- | --------------- | -------------- | ------------------ |
| 1   | `validate_agent_start` | `guard.ts`      | `v3.1`         | `fnv1a32:779e52cf` |
| 2   | `get_dashboard`        | `dashboard.ts`  | `v3.1`         | `fnv1a32:581c5921` |
| 3   | `start_session`        | `session.ts`    | `v3.1`         | `fnv1a32:8b295f97` |
| 4   | `get_session`          | `session.ts`    | `v3.1`         | `fnv1a32:28acb7ec` |
| 5   | `close_session`        | `session.ts`    | `v3.1`         | `fnv1a32:6b5fbd7b` |
| 6   | `submit_retro`         | `retro.ts`      | `v3.1`         | `fnv1a32:257024fe` |
| 7   | `get_retro`            | `retro.ts`      | `v3.1`         | `fnv1a32:10e269a5` |
| 8   | `finalize_retro`       | `retro.ts`      | `v3.1`         | `fnv1a32:675501e7` |
| 9   | `start_election`       | `election.ts`   | `v3.1`         | `fnv1a32:6460c81b` |
| 10  | `cast_election_vote`   | `election.ts`   | `v3.1`         | `fnv1a32:4decb8e0` |
| 11  | `get_election_result`  | `election.ts`   | `v3.1`         | `fnv1a32:041882f2` |
| 12  | `get_state`            | `state.ts`      | `v3.1`         | `fnv1a32:aee53fc0` |
| 13  | `update_state`         | `state.ts`      | `v3.1`         | `fnv1a32:5eb490e3` |
| 14  | `create_task`          | `task.ts`       | `v3.1`         | `fnv1a32:64ab5f94` |
| 15  | `list_tasks`           | `task.ts`       | `v3.1`         | `fnv1a32:733a9727` |
| 16  | `update_task`          | `task.ts`       | `v3.1`         | `fnv1a32:8b051058` |
| 17  | `start_discussion`     | `discussion.ts` | `v3.1`         | `fnv1a32:7ab5d99a` |
| 18  | `post_message`         | `discussion.ts` | `v3.1`         | `fnv1a32:06a97405` |
| 19  | `get_discussion`       | `discussion.ts` | `v3.1`         | `fnv1a32:99d08b8e` |
| 20  | `close_discussion`     | `discussion.ts` | `v3.1`         | `fnv1a32:ba088010` |
| 21  | `check_consensus`      | `discussion.ts` | `v3.1`         | `fnv1a32:e2ad70e6` |
| 22  | `run_deliberation`     | `deliberation.ts` | `v3.1`       | `fnv1a32:a9f7a100` |
| 23  | `create_vote`          | `vote.ts`       | `v3.1`         | `fnv1a32:cf3a5dd0` |
| 24  | `cast_vote`            | `vote.ts`       | `v3.1`         | `fnv1a32:87822c9d` |
| 25  | `get_vote_result`      | `vote.ts`       | `v3.1`         | `fnv1a32:bc9dca05` |
| 26  | `log_handoff`          | `handoff.ts`    | `v3.1`         | `fnv1a32:0ef37aa1` |
| 27  | `get_handoff`          | `handoff.ts`    | `v3.1`         | `fnv1a32:3441d0a9` |
| 28  | `ack_handoff`          | `handoff.ts`    | `v3.1`         | `fnv1a32:71a2682d` |
| 29  | `lock_task`            | `lock.ts`       | `v3.1`         | `fnv1a32:4ad2ab0c` |
| 30  | `unlock_task`          | `lock.ts`       | `v3.1`         | `fnv1a32:6e27472c` |
| 31  | `record_file_change`   | `file.ts`       | `v3.1`         | `fnv1a32:18d8c0b5` |
| 32  | `broadcast_event`      | `event.ts`      | `v3.1`         | `fnv1a32:2616bf5e` |
| 33  | `get_events`           | `event.ts`      | `v3.1`         | `fnv1a32:3f29f915` |
| 34  | `audit_tool_contracts` | `monitor.ts`    | `v3.1`         | `fnv1a32:916ea521` |
| 35  | `get_d1_health`        | `monitor.ts`    | `v3.1`         | `fnv1a32:62ff9351` |
| 36  | `heartbeat`            | `monitor.ts`    | `v3.1`         | `fnv1a32:b8e565a9` |
| 37  | `reap_stale_agents`    | `monitor.ts`    | `v3.1`         | `fnv1a32:4b1a09be` |

Verification commands:

```bash
npm test -- src/tools/tool-contract.test.ts
npm run security:secrets
```
