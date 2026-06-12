---
name: 'source-command-lint-fix'
description: 'ESLint 자동 수정 + Prettier 포맷'
---

# source-command-lint-fix

Use this skill when the user asks to run the migrated source command `lint-fix`.

## Command Template

# Lint & Format 자동 수정

```bash
# 1. ESLint 자동 수정
npx eslint --fix "src/**/*.{ts,tsx}"

# 2. Prettier 포맷
npx prettier --write "src/**/*.{ts,tsx,json,md}"

# 3. 확인 (에러 0이어야 함)
npx eslint "src/**/*.{ts,tsx}" --max-warnings 0
```

수정 불가능한 에러는 파일:라인과 함께 보고.
