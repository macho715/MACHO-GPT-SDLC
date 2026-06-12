---
name: 'source-command-typecheck-all'
description: 'TypeScript 전체 타입체크 (v3 src/ + 루트 v1/v2/v3)'
---

# source-command-typecheck-all

Use this skill when the user asks to run the migrated source command `typecheck-all`.

## Command Template

# TypeScript 전체 타입체크

```bash
# 1. v3 (메인)
npx tsc --noEmit

# 2. v2 (레거시, 타입만)
npx tsc --noEmit v2_*.ts --target ES2022 --module ES2022 --moduleResolution bundler --types "@cloudflare/workers-types" --strict 2>&1 | head -30

# 3. v1 (루트 index)
npx tsc --noEmit index.ts --target ES2022 --module ES2022 --moduleResolution bundler --types "@cloudflare/workers-types" --strict 2>&1 | head -30
```

에러 0개일 때까지 수정. 모든 v1/v2/v3가 통과해야 함.
