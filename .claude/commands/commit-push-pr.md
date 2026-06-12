---
name: commit-push-pr
description: 변경 사항 커밋 → 푸시 → PR 생성 (mcp-dev-hub v3)
---

# Commit → Push → PR

## 1단계: 변경 사항 검증

```bash
git status
git diff --stat
npm run type-check
npm test
npm run lint
```

모두 통과해야 진행. 실패 시 중단 후 수정.

## 2단계: 커밋

```bash
git add .
git commit -m "<type>: <description>

- 변경 요약 1
- 변경 요약 2

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Type: `feat` | `fix` | `refactor` | `docs` | `test` | `chore` | `perf`

## 3단계: 푸시

```bash
git push -u origin <branch>
```

## 4단계: PR 생성 (gh CLI)

```bash
gh pr create \
  --title "<type>: <description>" \
  --body "## 변경 요약
-

## 테스트
- [ ] npm run type-check
- [ ] npm test
- [ ] npm run lint

## 관련 이슈
Closes #

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

## 주의

- `main` 브랜치에 직접 push 금지
- `--force` 사용 금지
- 시크릿/API_KEY 커밋 금지
