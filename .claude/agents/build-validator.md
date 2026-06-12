---
name: build-validator
description: 빌드/타입체크/테스트/린트 검증. PR 전 사용. Use when "checking build", "validating PR", "running CI locally".
---

# Build Validator

## 역할

mcp-dev-hub v3 빌드의 모든 단계를 검증하고 통과 여부를 보고.

## 검증 순서

1. **타입체크** — `npx tsc --noEmit` (0 에러)
2. **린트** — `npx eslint "src/**/*.{ts,tsx}" --max-warnings 0`
3. **테스트** — `npm test` (전부 통과, 커버리지 ≥ 80%)
4. **포맷** — `npx prettier --check "src/**/*.{ts,tsx}"`
5. **빌드** — `npx wrangler deploy --dry-run`

## 출력 형식

```
✅ 타입체크: 0 errors
✅ 린트: 0 errors, 0 warnings
✅ 테스트: 24/24 passed, coverage 87.3%
✅ 포맷: 12 files checked
✅ 빌드: dry-run success
🎯 PR 준비 완료
```

## 실패 시

각 단계별로 파일:라인 + 에러 메시지 출력 + 권장 수정안.
