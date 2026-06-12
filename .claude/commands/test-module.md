---
name: test-module
description: 모듈별 Vitest 테스트 실행 (예: tools/session, tools/retro)
---

# 모듈별 테스트

## 사용법

`/test-module <module-path>` — 예: `/test-module tools/session`

## 실행

```bash
# 특정 모듈
npx vitest run src/tools/${MODULE} --reporter=verbose

# 파일 매칭
npx vitest run --reporter=verbose -t "${MODULE}"

# Watch 모드
npx vitest watch src/tools/${MODULE}
```

## 결과 리포트

- ✅ Passed: N
- ❌ Failed: N
- 커버리지: X%
- 실패 시: 파일:라인 + 에러 메시지
