-- ============================================================
-- MCP DEV HUB v2 — AI 토론·협업 확장 스키마
-- GitHub / Linear 의존성 없음. D1 단독 동작.
-- ============================================================

-- 1. AI 에이전트 상태 원장 (v1 동일)
CREATE TABLE IF NOT EXISTS ai_state (
  agent        TEXT PRIMARY KEY,
  task_id      TEXT,
  task_title   TEXT,
  status       TEXT DEFAULT 'idle',   -- idle|working|blocked|review|discussing|done
  current_file TEXT,
  progress     INTEGER DEFAULT 0,
  note         TEXT,
  updated_at   DATETIME DEFAULT (datetime('now'))
);

-- 2. 태스크 레지스트리
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,      -- TASK-001
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT DEFAULT 'open',   -- open|in_progress|review|done|blocked
  priority     TEXT DEFAULT 'normal',
  assigned_to  TEXT,
  created_by   TEXT,
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now'))
);

-- 3. ★ 토론 스레드 (이슈별 의논 공간)
CREATE TABLE IF NOT EXISTS discussion_thread (
  id           TEXT PRIMARY KEY,      -- DISC-001
  task_id      TEXT NOT NULL,         -- 어떤 태스크/이슈에 대한 토론인지
  title        TEXT NOT NULL,         -- 토론 주제
  topic        TEXT,                  -- 세부 의제
  status       TEXT DEFAULT 'open',   -- open|voting|consensus|closed|blocked
  initiated_by TEXT NOT NULL,         -- 토론을 시작한 AI
  consensus    TEXT,                  -- 최종 합의 내용 (도달 시)
  consensus_at DATETIME,
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now'))
);

-- 4. ★ 토론 메시지 (AI 발언)
CREATE TABLE IF NOT EXISTS discussion_message (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT NOT NULL,
  agent        TEXT NOT NULL,         -- codex|claude|opencode|minimax
  role         TEXT NOT NULL,         -- propose|agree|disagree|question|clarify|summarize|decide
  content      TEXT NOT NULL,         -- 발언 내용
  reply_to     INTEGER,               -- 특정 메시지에 대한 답변 (NULL이면 새 발언)
  evidence     TEXT,                  -- 근거 자료 (JSON array: 파일경로/코드스니펫)
  confidence   REAL DEFAULT 0.8,      -- 발언 확신도 0~1
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 5. ★ 투표 (의견 충돌 시 결정)
CREATE TABLE IF NOT EXISTS vote (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT NOT NULL,
  question     TEXT NOT NULL,         -- 투표 질문
  options      TEXT NOT NULL,         -- JSON array: 선택지 목록
  status       TEXT DEFAULT 'open',   -- open|closed
  result       TEXT,                  -- 결정된 선택지
  created_by   TEXT,
  closes_at    DATETIME,
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 6. ★ 투표 결과 (AI별 선택)
CREATE TABLE IF NOT EXISTS vote_ballot (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vote_id    INTEGER NOT NULL,
  agent      TEXT NOT NULL,
  choice     TEXT NOT NULL,           -- 선택한 옵션
  reason     TEXT,                    -- 선택 이유
  voted_at   DATETIME DEFAULT (datetime('now')),
  UNIQUE(vote_id, agent)              -- AI당 1표
);

-- 7. ★ 컨센서스 체크포인트 (합의 도달 기록)
CREATE TABLE IF NOT EXISTS consensus_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT NOT NULL,
  agreed_by    TEXT NOT NULL,         -- JSON array: 동의한 AI 목록
  disagreed_by TEXT DEFAULT '[]',     -- JSON array: 반대한 AI 목록
  summary      TEXT NOT NULL,         -- 합의 내용 요약
  action_items TEXT DEFAULT '[]',     -- JSON array: 결정된 액션 아이템
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 8. 핸드오프 로그 (v1 동일)
CREATE TABLE IF NOT EXISTS handoff_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  from_agent   TEXT NOT NULL,
  to_agent     TEXT NOT NULL,
  task_id      TEXT NOT NULL,
  summary      TEXT,
  changed_files TEXT DEFAULT '[]',
  risks        TEXT DEFAULT '[]',
  instructions TEXT,
  status       TEXT DEFAULT 'pending',
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 9. 태스크 잠금
CREATE TABLE IF NOT EXISTS task_lock (
  task_id    TEXT PRIMARY KEY,
  locked_by  TEXT NOT NULL,
  locked_at  DATETIME DEFAULT (datetime('now')),
  expires_at DATETIME NOT NULL
);

-- 10. 이벤트 로그
CREATE TABLE IF NOT EXISTS event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  agent      TEXT,
  task_id    TEXT,
  thread_id  TEXT,
  payload    TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

-- 11. 파일 변경 이력
CREATE TABLE IF NOT EXISTS file_changes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  agent        TEXT NOT NULL,
  task_id      TEXT,
  file_path    TEXT NOT NULL,
  change_type  TEXT,
  summary      TEXT,
  diff_snippet TEXT,
  created_at   DATETIME DEFAULT (datetime('now'))
);

-- 초기 에이전트 등록
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('codex',    'idle');
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('claude',   'idle');
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('opencode', 'idle');
INSERT OR IGNORE INTO ai_state (agent, status) VALUES ('minimax',  'idle');
