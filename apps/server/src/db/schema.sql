-- ── ユーザー管理 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'assignee' -- super_admin | admin | assignee
);

-- ── アクセスポリシー（ユーザーごとの閲覧・編集スコープ） ──────────────────────
-- org_level_min: この階層以上の行が対象 (NULL = 制限なし)
-- org_codes:     対象組織コードの JSON 配列 (NULL = 制限なし)
CREATE TABLE IF NOT EXISTS user_access_policies (
  user_id       TEXT NOT NULL REFERENCES users(id),
  org_level_min INTEGER,
  org_codes     TEXT  -- JSON array e.g. '["A01","A02"]'
);

-- ── セッション（インポート単位） ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft', -- draft | submitted | finalized
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 配置行（AllocationRow の永続化） ─────────────────────────────────────────────
-- data: AllocationRow を JSON シリアライズ（将来は個別カラムに移行）
CREATE TABLE IF NOT EXISTS allocation_rows (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  row_id      INTEGER NOT NULL,
  assignee    TEXT    REFERENCES users(id),
  data        TEXT    NOT NULL, -- JSON blob of AllocationRow fields
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, row_id)
);

-- ── 整合エラー（出向/兼務の矛盾検出結果） ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS consistency_issues (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  group_member_id TEXT    NOT NULL,
  field           TEXT    NOT NULL, -- 矛盾フィールド名
  value_a         TEXT,             -- 出向元の値
  value_b         TEXT,             -- 出向先の値
  status          TEXT    NOT NULL DEFAULT 'open', -- open | resolved
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── コメント（整合エラーへの返信フロー） ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id    INTEGER NOT NULL REFERENCES consistency_issues(id) ON DELETE CASCADE,
  author_id   TEXT    NOT NULL REFERENCES users(id),
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── 通知キュー ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id TEXT    NOT NULL REFERENCES users(id),
  template     TEXT    NOT NULL,
  payload      TEXT    NOT NULL, -- JSON
  sent_at      TEXT              -- NULL = 未送信
);

-- ── ポジションプール（SFコード台帳） ─────────────────────────────────────────────
-- SF で払い出された正式コード（P########）を管理するプール。
-- AllocationList との紐付けは行わず、取得者・取得日・備考のみ保持する。
CREATE TABLE IF NOT EXISTS positions (
  code          TEXT PRIMARY KEY,                       -- P########
  status        TEXT NOT NULL DEFAULT 'available',      -- available | in_use | retired
  acquired_by   TEXT,                                   -- 取得者（自由テキスト）
  acquired_at   TEXT,                                   -- 取得日 (ISO date)
  notes         TEXT,                                   -- 備考
  registered_by TEXT REFERENCES users(id),              -- プールに登録した管理者
  registered_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

