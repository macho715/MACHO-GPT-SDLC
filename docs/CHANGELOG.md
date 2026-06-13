# Changelog

This changelog records verified repository state and recent local evidence. It does not invent release history beyond checked git/file evidence.

## Documented Current State - 2026-06-13

### Added

- `validate_agent_start` MCP tool in `src/tools/guard.ts`.
- Tool contract metadata for all registered tools through `src/lib/mcp.ts` and `src/tools/index.ts`.
- Contract snapshot test in `src/tools/tool-contract.test.ts`.
- Secret leak scan script in `scripts/security/no-secret-leak.mjs`.
- `security:secrets` npm script and expanded `validate` script in `package.json`.
- Standard docs under `docs/`: architecture, layout, guide, changelog, and traceability inventory.

### Changed

- Tool inventory now reflects 32 active tools and contract version `v3.1`.
- README now links to the `docs/` documentation set and uses safe verification commands.
- UTF-8 request validation now checks bytes with a fatal decoder before JSON parsing.

### Fixed

- Valid JSON payloads containing a legitimate `U+FFFD` character are no longer rejected.
- Documentation no longer treats remote deploy as completed when only Wrangler dry-run evidence exists.

### Verified

- `npm run validate` passed in this workspace.
- `npm run test:coverage` passed in this workspace.
- `npx wrangler deploy --dry-run --env="" --outdir .wrangler\dry-run` passed in this workspace.

## Git Evidence

Recent relevant commits reported by `git log --oneline`:

- `a5f2aec` feat(dashboard): auto-fill API key in local dev via DASHBOARD_AUTOFILL
- `558a152` docs: split architecture/layout into dedicated docs, add README overview+TOC
- `bbead5f` feat(dashboard): add MCP ops dashboard with AI status + health view
- `405db42` chore: bump compatibility_date to 2026-06-13, single-source test runtime
- `c150810` fix: nextId uses MAX(suffix) not COUNT to avoid id collision
- `91f7846` fix: reject non-UTF-8 request bodies at boundary (-32602)
- `e5a1265` feat: mcp-dev-hub v3 initial commit with branch coverage evidence

## Unverified

- Remote production Worker state was not revalidated by this documentation pipeline run.
- Root-level historical docs `SYSTEM_ARCHITECTURE.md`, `SYSTEM_LAYOUT.md`, and `CHANGELOG.md` remain present but are no longer the canonical docs targeted by this pipeline.
