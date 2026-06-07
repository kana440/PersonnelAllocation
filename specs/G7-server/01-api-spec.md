# G7-01 — STEP2 サーバー API 仕様（Phase 1）

> **対象**: STEP2 初期リリース（F-01〜F-17）  
> **実装状況**: ✗ 未実装  
> **依存 doc**: `docs/12-step2-requirements.md`

---

## 1. 前提・設計方針

### 1-1. 環境変数

```
VITE_APP_MODE=step2  VITE_AUTH_MODE=stub   → DEV（Hono + PGlite）
VITE_APP_MODE=step2  VITE_AUTH_MODE=sso    → 本番（Aurora + SAML）
```

サーバー側の認証アダプタは `apps/server/src/auth/` に配置し、`stub.ts`（X-User-Id ヘッダー）と `saml.ts`（本番）を切り替える。切り替えは `AUTH_MODE` 環境変数で行う。

### 1-2. 認証ミドルウェア

すべての `/api/*` ルートに認証ミドルウェアを適用する。

```typescript
// apps/server/src/auth/middleware.ts
export function authMiddleware(c: Context, next: Next) {
  // AUTH_MODE=stub: X-User-Id ヘッダーからユーザー解決
  // AUTH_MODE=sso:  セッション Cookie → JWT 検証
}
```

レスポンスに含む `currentUser`:
```typescript
type CurrentUser = {
  id: string
  name: string
  email: string
  role: 'admin' | 'coordinator' | 'member'
}
```

> **注**: 既存の `users.role` カラムは `super_admin | admin | assignee` になっているが、STEP2 では `admin | coordinator | member` に変更する（§2-1 のスキーマ参照）。

### 1-3. ロールと操作権限の対応

| 操作 | admin | coordinator | member |
|---|---|---|---|
| Round 作成 | ✅ | ❌ | ❌ |
| Revision 確定 | ✅ | ❌ | ❌ |
| 委任（Submission 作成） | ✅ | ✅（自分のスコープ内） | ❌ |
| Submission 編集 | ✅ | ✅（自分のスコープ） | ✅（自分のスコープ） |
| Submission 提出 | ✅ | ✅ | ✅ |
| マージ結果確認（コンフリクト解消） | ✅（最上位） | ✅（自分の配下） | ❌ |
| 差し戻し | ✅ | ✅（自分の直接委任先） | ❌ |
| 全行閲覧 | ✅ | ❌ | ❌ |

---

## 2. DB スキーマ拡張

### 2-1. 既存テーブルの変更

```sql
-- users.role の値を変更
-- 旧: super_admin | admin | assignee
-- 新: admin | coordinator | member
ALTER TABLE users RENAME COLUMN role TO role_old;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
-- データ移行: super_admin→admin, admin→coordinator, assignee→member
UPDATE users SET role = CASE role_old
  WHEN 'super_admin' THEN 'admin'
  WHEN 'admin'       THEN 'coordinator'
  WHEN 'assignee'    THEN 'member'
END;
```

### 2-2. 新規テーブル

```sql
-- ── Revision（改訂版）────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revisions (
  id          TEXT PRIMARY KEY,           -- UUID
  seq         INTEGER NOT NULL UNIQUE,    -- Rev.1, Rev.2, ...（連番）
  label       TEXT NOT NULL,              -- 例: "2026年1月版 確定"
  status      TEXT NOT NULL DEFAULT 'active', -- active | archived
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Round（申請回）────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
  id          TEXT PRIMARY KEY,           -- UUID
  label       TEXT NOT NULL,              -- 例: "2026年度1月版"
  kind        TEXT NOT NULL DEFAULT 'annual', -- annual | patch
  status      TEXT NOT NULL DEFAULT 'draft', -- draft | in_progress | ready | merged
  based_on    TEXT NOT NULL REFERENCES revisions(id),
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Submission（提出物）───────────────────────────────────────────────────────
-- 委任ツリーの1ノード。1ユーザー × 担当範囲 × Round の組み合わせ。
CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,           -- UUID
  round_id    TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES submissions(id), -- NULLならトップレベル（管理者直下）
  assignee_id TEXT NOT NULL REFERENCES users(id),
  scope       TEXT NOT NULL,              -- JSON: { kind: 'org' | 'level' | 'condition' | 'manual', ... }
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | submitted | accepted | revision_requested
  request_comment TEXT,                   -- 委任元からの依頼コメント
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── 配置行（Round 内の変更差分）──────────────────────────────────────────────
-- 既存の allocation_rows を Round に紐付け直す
-- 旧: session_id → 新: round_id + submission_id
ALTER TABLE allocation_rows ADD COLUMN round_id TEXT REFERENCES rounds(id);
ALTER TABLE allocation_rows ADD COLUMN submission_id TEXT REFERENCES submissions(id);

-- ── コンフリクト（Cross-Round マージ時）────────────────────────────────────
CREATE TABLE IF NOT EXISTS conflicts (
  id            TEXT PRIMARY KEY,
  round_a_id    TEXT NOT NULL REFERENCES rounds(id),
  round_b_id    TEXT NOT NULL REFERENCES rounds(id),
  row_id        INTEGER NOT NULL,         -- 競合した AllocationRow の rowId
  field         TEXT,                     -- 競合フィールド名（NULL = 行全体）
  value_a       TEXT,                     -- Round A での値（JSON）
  value_b       TEXT,                     -- Round B での値（JSON）
  resolved_by   TEXT REFERENCES users(id),
  resolved_at   TEXT,
  resolution    TEXT,                     -- 採用した値（JSON）
  status        TEXT NOT NULL DEFAULT 'open', -- open | resolved
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Revision のスナップショット行────────────────────────────────────────────
-- Revision 確定時に allocation_rows の確定状態をコピーして保持
CREATE TABLE IF NOT EXISTS revision_rows (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  row_id      INTEGER NOT NULL,
  data        TEXT NOT NULL,              -- JSON blob of AllocationRow
  UNIQUE(revision_id, row_id)
);
```

---

## 3. API ルート一覧

### 3-1. 認証

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/auth/me` | ログイン中ユーザーの情報取得 |
| `GET` | `/api/auth/login` | SSO ログイン開始（stub では X-User-Id を読む） |
| `POST` | `/api/auth/logout` | セッション削除 |

### 3-2. Revision

| メソッド | パス | ロール | 説明 |
|---|---|---|---|
| `GET` | `/api/revisions` | admin | Revision 一覧 |
| `GET` | `/api/revisions/:id` | admin | Revision 詳細 |
| `GET` | `/api/revisions/:id/rows` | admin | Revision のスナップショット行一覧 |

### 3-3. Round

| メソッド | パス | ロール | 説明 |
|---|---|---|---|
| `GET` | `/api/rounds` | admin | Round 一覧 |
| `POST` | `/api/rounds` | admin | Round 新規作成（Excel インポートまたは Revision ベース）|
| `GET` | `/api/rounds/:id` | admin, coordinator | Round 詳細 |
| `PATCH` | `/api/rounds/:id` | admin | Round のステータス更新 |
| `POST` | `/api/rounds/:id/finalize` | admin | Revision 確定（Round を closed にして revision_rows を生成）|
| `POST` | `/api/rounds/:id/merge` | admin | Cross-Round マージ実行 |
| `GET` | `/api/rounds/:id/conflicts` | admin, coordinator | コンフリクト一覧 |
| `PATCH` | `/api/rounds/:roundId/conflicts/:conflictId` | admin, coordinator | コンフリクト解消 |

### 3-4. Submission

| メソッド | パス | ロール | 説明 |
|---|---|---|---|
| `GET` | `/api/rounds/:roundId/submissions` | admin | Round の全 Submission 一覧（ツリー構造）|
| `POST` | `/api/rounds/:roundId/submissions` | admin, coordinator | Submission 作成（委任）|
| `GET` | `/api/submissions` | coordinator, member | 自分の Submission 一覧 |
| `GET` | `/api/submissions/:id` | - | Submission 詳細（スコープチェック）|
| `POST` | `/api/submissions/:id/submit` | coordinator, member | Submission を提出 |
| `POST` | `/api/submissions/:id/request-revision` | admin, coordinator | 差し戻し（コメント必須）|

### 3-5. 行データ（Submission スコープ付き）

| メソッド | パス | ロール | 説明 |
|---|---|---|---|
| `GET` | `/api/submissions/:submissionId/rows` | - | Submission スコープ内の行一覧 |
| `PUT` | `/api/submissions/:submissionId/rows` | - | 行一括更新（`AllocationRow[]` を受け取る）|
| `POST` | `/api/submissions/:submissionId/rows/import` | - | Excel ファイルアップロードして行をインポート |
| `GET` | `/api/submissions/:submissionId/rows/export` | - | 担当範囲の行を Excel エクスポート |

### 3-6. 整合チェック

| メソッド | パス | ロール | 説明 |
|---|---|---|---|
| `POST` | `/api/rounds/:roundId/consistency-check` | admin | 全体の整合チェック実行（グループ社員 ID 重複行の突き合わせ）|
| `GET` | `/api/submissions/:submissionId/consistency-issues` | - | 自分の Submission に関係する整合エラー一覧 |

### 3-7. 照会（担当者間コミュニケーション）

| メソッド | パス | ロール | 説明 |
|---|---|---|---|
| `POST` | `/api/inquiries` | - | 照会送信（`rowId` + `fields[]` + `message`）|
| `GET` | `/api/inquiries` | - | 自分宛ての照会一覧 |
| `POST` | `/api/inquiries/:id/reply` | - | 照会への返信 |

### 3-8. 通知

| メソッド | パス | ロール | 説明 |
|---|---|---|---|
| `GET` | `/api/notifications` | - | 自分宛ての通知一覧（未読件数含む）|
| `PATCH` | `/api/notifications/:id/read` | - | 既読マーク |

---

## 4. 主要 API の詳細

### 4-1. Round 作成（POST /api/rounds）

**リクエスト**:
```typescript
{
  label: string          // "2026年度1月版"
  kind: 'annual' | 'patch'
  basedOnRevisionId: string   // ベース Revision の ID
  // 方法 A: Excel ファイルから（multipart/form-data で別途アップロード）
  importSessionId?: string    // 既存の import セッション ID
  // 方法 B: Revision をそのままベースに使う（ベースデータ整備は別途）
}
```

**処理**:
1. `revisions` テーブルから `based_on` の行を取得
2. `revision_rows` からベースデータを読み込む（方法 B の場合）
3. `rounds` テーブルに新規レコードを挿入
4. `allocation_rows` に Round に紐づく行データを投入

**レスポンス**: `{ roundId, status, rowCount }`

### 4-2. Submission 作成（委任）（POST /api/rounds/:roundId/submissions）

**リクエスト**:
```typescript
{
  assigneeId: string
  parentSubmissionId?: string   // null = トップレベル（管理者直下）
  scope: {
    kind: 'org' | 'level' | 'condition' | 'manual'
    // kind='org':       orgCodes: string[]
    // kind='level':     orgLevelMin: number, orgLevelMax?: number
    // kind='condition': concurrentType: string
    // kind='manual':    rowIds: number[]
  }
  requestComment?: string
}
```

**処理**:
1. スコープが親 Submission のスコープ内に収まるか検証（委任元の範囲を超えてはいけない）
2. `submissions` テーブルに新規レコードを挿入
3. 委任先ユーザーにメール通知（notifications テーブル経由）

### 4-3. Submission 提出（POST /api/submissions/:id/submit）

**処理**:
1. 対象 Submission の直接の子 Submission がすべて `accepted` または `submitted` か確認
2. Submission スコープ内の行に対してバリデーション実行（domain の validation 関数を呼ぶ）
3. エラーあり → 400 でエラー一覧返却
4. ステータスを `submitted` に更新
5. 親 Submission の担当者（委任元）にメール通知

### 4-4. Revision 確定（POST /api/rounds/:id/finalize）

**処理**:
1. Round の全 Submission がすべて `accepted` か確認
2. Cross-Round のコンフリクトがすべて解消済みか確認
3. `revisions` テーブルに新規 Revision を挿入（seq は現在の最大 + 1）
4. `revision_rows` に現在の `allocation_rows`（この Round）をスナップショットとして挿入
5. Round ステータスを `merged` に更新

---

## 5. スコープチェックの実装方針

行レベルのアクセス制御は「Submission のスコープ定義から対象 rowId セットを計算」する方式。

```typescript
// apps/server/src/lib/scopeFilter.ts

function resolveScope(scope: SubmissionScope, rows: AllocationRow[]): number[] {
  switch (scope.kind) {
    case 'org':       return rows.filter(r => scope.orgCodes.includes(r.departmentCode)).map(r => r.rowId)
    case 'level':     return rows.filter(r => r.orgLevel >= scope.orgLevelMin).map(r => r.rowId)
    case 'condition': return rows.filter(r => r.concurrentType === scope.concurrentType).map(r => r.rowId)
    case 'manual':    return scope.rowIds
  }
}
```

- API ハンドラは「リクエストユーザーの Submission スコープ」と「操作対象 rowId セット」の積集合を検証してから処理する
- スコープ外の行は API レスポンスに含めない（サーバーサイドフィルタ）

---

## 6. 整合チェックの実装方針

グループ社員 ID が複数行に跨るケース（出向元/出向先、本務/兼務）を検出して、一致すべき項目が一致しているか確認する。

```typescript
// packages/domain/src/validation/validateCrossSubmissionConsistency.ts

const CONSISTENCY_FIELDS: (keyof AllocationRow)[] = [
  'name', 'band', 'officialPosition',
  // ❓ 他に一致確認が必要な項目は要業務確認（Q-12 参照）
]

export function validateCrossSubmissionConsistency(
  rows: AllocationRow[]
): ConsistencyIssue[] {
  // 同一グループ社員 ID を持つ行をグループ化
  // 各グループ内で CONSISTENCY_FIELDS が一致しているか確認
  // 不一致の場合は ConsistencyIssue を返す
}
```

- 実装は `packages/domain/src/validation/` に追加（純粋関数）
- サーバーは `validateCrossSubmissionConsistency` を呼び出し、結果を `consistency_issues` テーブルに保存
- 既存の `validateCrossRowConsistency` との統合・整理が必要

---

## 7. 未実装・確認待ち事項

| # | 項目 | 参照 |
|---|---|---|
| Q-01 | SSO の IdP（SAML アダプタの実装は IdP 確定後） | docs/12 Q-01 |
| Q-08 | ベースデータ整備の手動入力フォーマット | docs/12 Q-08 |
| Q-12 | 整合チェックの確認フィールド一覧 | docs/12 Q-12 |
| - | `allocation_rows` の `session_id` → `submission_id` への移行: **既存データは捨てて完全書き換え**。`sessions` テーブルも削除。 | — |
| - | ポジション自動共有（同 Round・同組織スコープの担当者への通知）のトリガータイミング | docs/12 §5-2 |
