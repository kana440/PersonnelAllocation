-- デモ用初期データ（開発・テスト環境のみ）
-- 本番では実行しない

INSERT OR IGNORE INTO users (id, name, email, role) VALUES
  ('user-admin',  '取りまとめ 太郎', 'admin@example.com',   'super_admin'),
  ('user-dept-a', '部門A 担当',      'dept-a@example.com',  'admin'),
  ('user-dept-b', '部門B 担当',      'dept-b@example.com',  'admin'),
  ('user-lv3',    '3階層 専任',      'lv3@example.com',     'assignee');

INSERT OR IGNORE INTO user_access_policies (user_id, org_level_min, org_codes) VALUES
  ('user-admin',  NULL, NULL),
  ('user-dept-a', NULL, '["A01","A02","A03"]'),
  ('user-dept-b', NULL, '["B01","B02"]'),
  ('user-lv3',    3,    NULL);
