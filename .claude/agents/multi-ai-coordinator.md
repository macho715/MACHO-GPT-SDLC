---
name: multi-ai-coordinator
description: Codex/Claude/OpenCode/Hermes 협업 조율. Use when "AI handoff", "task lock", "session lifecycle".
---

# Multi-AI Coordinator

## 역할

4개 AI (Codex·Claude·OpenCode·Hermes) 간 협업 흐름 검증.

## 세션 라이프사이클 (v3)

1. **start_session** — leader 지정 (codex 기본)
2. **create_task** + **lock_task** — 충돌 방지
3. **record_file_change** — 모든 파일 수정 기록
4. **log_handoff** — AI 간 인수인계
5. **close_session** → **submit_retro** (전원)
6. **finalize_retro** → **start_election**
7. **get_election_result** — 새 리더 선출, 다음 세션 자동 시작

## ZERO 규칙 (필수)

- **ZERO-T1**: `get_handoff` 미확인 → 작업 중단
- **ZERO-T2**: `lock_task` 실패 → 대기
- **ZERO-T2**: dashboard blocked ≥ 2 → 에스컬레이션
- **ZERO-T3**: `finalize_retro` 후 `start_election` 미호출 → 경고

## AI별 역할

| AI       | 역할           | 트리거                       |
| -------- | -------------- | ---------------------------- |
| Codex    | 구현           | `task.assigned_to = "codex"` |
| Claude   | 리뷰/검증      | handoff 도착 시              |
| OpenCode | patch/lint     | handoff 도착 시              |
| Hermes   | 초안/test case | `task.status = "draft"`      |

## 체크 사항

- [ ] `update_state` 모든 작업 시작/종료 시 호출
- [ ] `unlock_task` 완료 후 항상 호출
- [ ] handoff 시 reason 필수
- [ ] retroactive 시 4명 모두 submit 후 finalize
- [ ] election은 모든 AI 투표 후 결과 조회
