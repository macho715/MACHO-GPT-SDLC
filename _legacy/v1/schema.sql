-- ============================================================
-- MCP DEV HUB — Standalone Schema
-- GitHub / Linear 없이 완전 자립 동작
-- ============================================================

-- 1. AI 에이전트 상태 원장
CREATE TABLE IF NOT EXISTS ai_state (
  agent        TEXT PRIMARY KEY,          -- codex | claude | opencode | minimax
  task_id      TEXT,                      -- 내부 task ID (MCP 자체 발급)
  task_title   TEXT,                      -- 태스크 제목 (자유 텍스트)
  branch       TEXT,                      -- 작업 브랜치명 (선택)
  status       TEXT DEFAULT 'idle',       -- idle | working | blocked | review | done
  current_file TEXT,                      -- 현재 수정 중인 파일
  progress     INTEGER DEFAULT 0,         -- 0~100 진행률
  note         TEXT,                      -- 자유 메모
  updated_at   DATETIME DEFAULT (datetime('now'))
);

-- 2. 태스크 레지스트리 (Linear 대체)
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,          -- TASK-001 형식 자동 발급
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT DEFAULT 'open',       -- open | in_progress | review | done | blocked
  priority     TEXT DEFAULT 'normal',     -- low | normal | high | critical
  assigned_to  TEXT,                      -- codex | claude | opencode | minimax
  created_by   TEXT,                      -- 생성한 AI 또는 human
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now'))
);

-- 3. 핸드오프 로그 (AI 간 인수인계)
CREATE TABLE IF NOT EXISTS handoff_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent   TEXT NOT NULL,
  to_agent     TEXT NOT NULL,
  task_id      TEXT NOT NULL,
  summary      TEXT,                      -- 작업 요약
  changed_files TEXT,                     -- JSON array: 변경된 파일 목록
  risks        TEXT,                      -- JSON array: 미결 리스크
  instructions TEXT,                      -- 수신 AI에게 전달할 지시사항
  status       TEXT DEFAULT 'pending',    -- pending | acknowledged | rejected
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 4. 태스크 잠금 (동시 수정 충돌 방지)
CREATE TABLE IF NOT EXISTS task_lock (
  task_id      TEXT PRIMARY KEY,
  locked_by    TEXT NOT NULL,
  locked_at    DATETIME DEFAULT (datetime('now')),
  expires_at   DATETIME NOT NULL          -- 기본 30분 TTL
);

-- 5. 이벤트 브로드캐스트 로그
CREATE TABLE IF NOT EXISTS event_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL,             -- state_change | handoff | lock | task_update | alert
  agent        TEXT,
  task_id      TEXT,
  payload      TEXT,                      -- JSON
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 6. 파일 변경 추적 (Git 없이 변경 이력 관리)
CREATE TABLE IF NOT EXISTS file_changes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agent        TEXT NOT NULL,
  task_id      TEXT,
  file_path    TEXT NOT NULL,
  change_type  TEXT,                      -- create | modify | delete
  summary      TEXT,                      -- 변경 내용 요약
  diff_snippet TEXT,                      -- 핵심 diff (선택)
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 초기 에이전트 등록
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('codex',    'idle');
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('claude',   'idle');
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('opencode', 'idle');
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('minimax',  'idle');
