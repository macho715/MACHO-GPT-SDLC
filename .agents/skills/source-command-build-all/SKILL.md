---
name: 'source-command-build-all'
description: '전체 빌드 (type-check + lint + test + wrangler dry-run)'
---

# source-command-build-all

Use this skill when the user asks to run the migrated source command `build-all`.

## Command Template

# 전체 빌드

```bash
# 1. 타입체크
npm run type-check

# 2. 린트
npm run lint

# 3. 테스트
npm test

# 4. 커버리지 확인 (80% 이상)
npm run test:coverage

# 5. Wrangler dry-run (실제 배포 없이 빌드만)
npx wrangler deploy --dry-run --outdir=dist
```

모두 통과해야 배포 가능. 실패 시 어느 단계에서 멈췄는지 + 에러 출력.
