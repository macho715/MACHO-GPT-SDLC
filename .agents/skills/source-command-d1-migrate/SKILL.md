---
name: 'source-command-d1-migrate'
description: 'D1 스키마 마이그레이션 (local/prod)'
---

# source-command-d1-migrate

Use this skill when the user asks to run the migrated source command `d1-migrate`.

## Command Template

# D1 Schema Migration

## 1단계: 로컬 적용

```bash
npm run db:init:local
```

## 2단계: 로컬 검증

```bash
# 테이블 목록
npx wrangler d1 execute mcp-dev-hub-db --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

기대 테이블: `ai_state`, `tasks`, `task_lock`, `handoff_log`, `event_log`, `file_changes`, `sessions`, `retrospectives`, `elections`, `discussions`, `votes`

## 3단계: 프로덕션 적용 (주의!)

```bash
# 적용 전: 스키마 백업
npx wrangler d1 export mcp-dev-hub-db --output=backups/schema-$(date +%Y%m%d).sql

# 적용
npm run db:init:prod
```

## 주의

- 프로덕션 적용 전 항상 백업
- 시크릿은 별도 (`wrangler secret put API_KEY`)
- 마이그레이션 롤백은 수동 (D1은 트랜잭션 지원)
