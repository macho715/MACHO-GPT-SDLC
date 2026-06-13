-- ============================================================
-- MCP DEV HUB v3 — Session Lifecycle + Retro + Leader Election
-- ============================================================

-- ── 기존 테이블 (v2 동일) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_state (
  agent        TEXT PRIMARY KEY,
  task_id      TEXT,
  task_title   TEXT,
  status       TEXT DEFAULT 'idle',
  current_file TEXT,
  progress     INTEGER DEFAULT 0,
  note         TEXT,
  session_id   TEXT,                    -- ★ 현재 소속 세션
  updated_at   DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT DEFAULT 'open',
  priority     TEXT DEFAULT 'normal',
  assigned_to  TEXT,
  created_by   TEXT,
  session_id   TEXT,                    -- ★ 세션 연결
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discussion_thread (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  session_id   TEXT,                    -- ★ 세션 연결
  title        TEXT NOT NULL,
  topic        TEXT,
  status       TEXT DEFAULT 'open',
  initiated_by TEXT NOT NULL,
  consensus    TEXT,
  consensus_at DATETIME,
  created_at   DATETIME DEFAULT (datetime('now')),
  updated_at   DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discussion_message (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT NOT NULL,
  agent        TEXT NOT NULL,
  role         TEXT NOT NULL,
  content      TEXT NOT NULL,
  reply_to     INTEGER,
  evidence     TEXT DEFAULT '[]',
  confidence   REAL DEFAULT 0.8,
  created_at   DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vote (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT,
  session_id   TEXT,                    -- ★ 세션 투표 연결
  vote_type    TEXT DEFAULT 'general',  -- general | leader_election
  question     TEXT NOT NULL,
  options      TEXT NOT NULL,
  status       TEXT DEFAULT 'open',
  result       TEXT,
  created_by   TEXT,
  closes_at    DATETIME,
  created_at   DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vote_ballot (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vote_id    INTEGER NOT NULL,
  agent      TEXT NOT NULL,
  choice     TEXT NOT NULL,
  reason     TEXT,
  voted_at   DATETIME DEFAULT (datetime('now')),
  UNIQUE(vote_id, agent)
);

CREATE TABLE IF NOT EXISTS consensus_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id    TEXT NOT NULL,
  agreed_by    TEXT DEFAULT '[]',
  disagreed_by TEXT DEFAULT '[]',
  summary      TEXT NOT NULL,
  action_items TEXT DEFAULT '[]',
  created_at   DATETIME DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS task_lock (
  task_id    TEXT PRIMARY KEY,
  locked_by  TEXT NOT NULL,
  locked_at  DATETIME DEFAULT (datetime('now')),
  expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  agent      TEXT,
  task_id    TEXT,
  thread_id  TEXT,
  session_id TEXT,
  payload    TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

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

-- ════════════════════════════════════════════════════════════
-- ★ NEW v3: Session Lifecycle 테이블
-- ════════════════════════════════════════════════════════════

-- 12. 세션 원장
CREATE TABLE IF NOT EXISTS session (
  id           TEXT PRIMARY KEY,        -- SESS-001
  title        TEXT NOT NULL,           -- 세션 이름 (예: "Sprint-03 API 설계")
  leader       TEXT NOT NULL,           -- 세션 리더 AI
  status       TEXT DEFAULT 'active',   -- active | closing | retro | voting | closed
  goals        TEXT DEFAULT '[]',       -- JSON array: 세션 목표
  project      TEXT,                    -- 세션이 속한 로컬 폴더 경로 (대시보드 프로젝트별 그룹핑용)
  created_at   DATETIME DEFAULT (datetime('now')),
  closed_at    DATETIME,
  next_session_id TEXT                  -- 다음 세션 연결
);
CREATE INDEX IF NOT EXISTS idx_session_project ON session(project);

-- 13. ★ 회고 리뷰 (AI별 잘된점/못된점 기록)
CREATE TABLE IF NOT EXISTS retro_review (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  agent        TEXT NOT NULL,           -- 리뷰 작성 AI
  went_well    TEXT NOT NULL,           -- 잘된 점 (JSON array)
  went_wrong   TEXT NOT NULL,           -- 못된 점 (JSON array)
  suggestions  TEXT DEFAULT '[]',       -- 개선 제안 (JSON array)
  highlight    TEXT,                    -- 이 세션의 핵심 성과 한 줄
  mvp_vote     TEXT,                    -- 이 AI가 MVP로 뽑은 에이전트
  submitted_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(session_id, agent)             -- AI당 1회 제출
);

-- 14. ★ 세션 회고 요약 (전체 집계)
CREATE TABLE IF NOT EXISTS retro_summary (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL UNIQUE,
  top_went_well   TEXT DEFAULT '[]',   -- 가장 많이 언급된 잘된 점
  top_went_wrong  TEXT DEFAULT '[]',   -- 가장 많이 언급된 못된 점
  top_suggestions TEXT DEFAULT '[]',   -- 상위 개선 제안
  mvp_agent       TEXT,                -- MVP 에이전트 (득표 최다)
  participation   INTEGER DEFAULT 0,   -- 참여 AI 수
  created_at      DATETIME DEFAULT (datetime('now'))
);

-- 15. ★ 리더 선출 선거
CREATE TABLE IF NOT EXISTS leader_election (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,           -- 어느 세션 종료 후 선거인지
  next_session_id TEXT,                 -- 다음 세션 ID (선거 후 생성)
  status       TEXT DEFAULT 'open',     -- open | closed
  winner       TEXT,                    -- 선출된 리더
  total_votes  INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT (datetime('now')),
  closed_at    DATETIME
);

-- 16. ★ 리더 선출 투표 결과
CREATE TABLE IF NOT EXISTS election_ballot (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  election_id INTEGER NOT NULL,
  agent       TEXT NOT NULL,            -- 투표한 AI
  nominee     TEXT NOT NULL,            -- 지지한 후보 AI
  reason      TEXT,
  voted_at    DATETIME DEFAULT (datetime('now')),
  UNIQUE(election_id, agent)            -- AI당 1표
);

-- 초기 에이전트 등록
-- updated_at은 NULL로 둔다: seed 직후 datetime('now')를 박으면 10분 뒤 presence가
-- offline(빨강)으로 보여 "한 번도 연결 안 함"과 "연결됐다 끊김"이 구분되지 않는다.
-- NULL이면 derivePresence가 'unknown'(회색·미연결)을 반환하고, 첫 update_state
-- 호출 시 updated_at이 채워지며 online으로 전환된다.
INSERT OR IGNORE INTO ai_state (agent, status, updated_at) VALUES ('codex',    'idle', NULL);
INSERT OR IGNORE INTO ai_state (agent, status, updated_at) VALUES ('claude',   'idle', NULL);
INSERT OR IGNORE INTO ai_state (agent, status, updated_at) VALUES ('opencode', 'idle', NULL);
INSERT OR IGNORE INTO ai_state (agent, status, updated_at) VALUES ('minimax',  'idle', NULL);
