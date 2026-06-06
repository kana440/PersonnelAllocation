-- positions テーブルを新スキーマに作り直す（旧: department_code あり）
-- NOTE: better-sqlite3 では条件付き DROP+CREATE を直接書けないため
-- sqlite.ts の runMigrations() が旧スキーマを検出したときのみ実行する
DROP TABLE IF EXISTS positions;
