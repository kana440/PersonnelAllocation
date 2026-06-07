-- デモ用シードデータ（開発・テスト環境のみ）
-- 冪等: ON CONFLICT DO NOTHING

-- ─── 会社 ────────────────────────────────────────────────────────────────────

INSERT INTO companies (id, name, code, locale) VALUES
  ('company-demo', '株式会社デモ', 'DEMO',     'ja'),
  ('company-sub',  'デモ子会社',   'DEMO-SUB', 'ja')
ON CONFLICT DO NOTHING;

-- ─── ユーザー（グループ横断） ─────────────────────────────────────────────
-- 5名構成: 管理者×1、人事（取りまとめ）×2、部門担当×2

INSERT INTO users (id, name, email, role) VALUES
  ('user-admin',  '管理者A',   'admin@example.com',       'admin'),
  ('user-hr1',    'HR担当A',   'hr1@example.com',         'coordinator'),
  ('user-hr2',    'HR担当B',   'hr2@example.com',         'coordinator'),
  ('user-dept1',  '部門A担当', 'department1@example.com', 'member'),
  ('user-dept2',  '部門B担当', 'department2@example.com', 'member')
ON CONFLICT (id) DO UPDATE SET
  name  = EXCLUDED.name,
  email = EXCLUDED.email,
  role  = EXCLUDED.role;

-- ─── 会社ごとの役割・アクセス制御 ────────────────────────────────────────

INSERT INTO user_company_roles (user_id, company_id, role) VALUES
  ('user-admin',  'company-demo', 'admin'),
  ('user-hr1',    'company-demo', 'coordinator'),
  ('user-hr2',    'company-demo', 'coordinator'),
  ('user-dept1',  'company-demo', 'member'),
  ('user-dept2',  'company-demo', 'member')
ON CONFLICT DO NOTHING;

-- ─── ポジション ──────────────────────────────────────────────────────────────

INSERT INTO positions (code, company_id, status, registered_by) VALUES
  ('_pos_demo_001', 'company-demo', 'available', 'user-admin'),
  ('_pos_demo_002', 'company-demo', 'available', 'user-admin'),
  ('_pos_demo_003', 'company-demo', 'available', 'user-admin')
ON CONFLICT DO NOTHING;
