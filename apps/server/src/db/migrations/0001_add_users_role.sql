-- users テーブルに role カラムを追加（旧DBからのアップグレード）
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'assignee';
UPDATE users SET role = 'super_admin' WHERE id = 'user-admin';
UPDATE users SET role = 'admin'       WHERE id IN ('user-dept-a', 'user-dept-b');
UPDATE users SET role = 'assignee'    WHERE role IS NULL;
