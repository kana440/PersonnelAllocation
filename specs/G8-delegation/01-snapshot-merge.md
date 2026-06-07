# G8-01 — スナップショット・マージ実装仕様（Phase B2）

> 設計の背景・判断理由は `docs/14-delegation-model.md` 参照。
> 旧仕様（自動マージ）から手動マージ方式へ改訂（2026-06-07）。

---

## 実装状況

| 項目 | 状態 |
|---|---|
| `diffRow` / `mergeRow` / `mergeSubmission` 純粋関数 | ✓ 実装済み |
| `submissions.snapshot_data` カラム追加（0003） | ✓ 実装済み |
| `submission_rows` テーブル追加（0004） | ✓ 実装済み |
| 依頼作成時スナップショット保存（allocation_rows から取得） | ✓ 実装済み（要修正: 親の submission_rows を優先すべき）|
| `GET /submissions/:id/rows` — 初期表示に allocation_rows 使用 | ✓ 実装済み（要修正: 親の submission_rows を優先すべき）|
| `PUT /submissions/:id/rows` — submission_rows に保存 | ✓ 実装済み |
| `POST /submit` — 自動マージ | ✓ 実装済み（要変更: status 変更のみに） |
| `POST /merge` — 親による手動マージ | ✗ 未実装 |
| `POST /sync` — 親による途中状態取り込み | ✗ 未実装 |
| `merged` ステータス | ✗ 未実装 |
| スナップショット取得元を親の submission_rows に修正 | ✗ 未実装 |
| submit 時のマージ先を親の submission_rows に修正 | ✗ 未実装 |
| Excel アップロード（Round 初期化） | ✗ 未実装 |

---

## 1. ステータス定義（変更点）

```typescript
// adminApi.ts の SubmissionStatus に追加
type SubmissionStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'         // 提出済み。親のマージ待ち（自動マージは行わない）
  | 'merged'            // 【新規】親がマージ済み。親の submission_rows に反映済み
  | 'revision_requested'
  | 'cancelled'
```

---

## 2. 修正: スナップショット取得元と初期表示

### 2-1. 依頼作成時（`POST /api/submissions`）

**変更前**: snapshot_data を `allocation_rows` から取得  
**変更後**: 親の `submission_rows` があればそちらから取得。なければ `allocation_rows`

```typescript
// 依頼作成時のスナップショット取得
function loadSnapshotForDelegation(
  db: DB, roundId: string, parentSubmissionId: string | null, scope: SubmissionScope, allRows: AllocationRow[]
): AllocationRow[] {
  const scopeIds = new Set(resolveScope(scope, allRows))

  if (parentSubmissionId) {
    const parentBranchRows = loadSubmissionRows(db, parentSubmissionId)
    if (parentBranchRows.length > 0) {
      return parentBranchRows.filter(r => scopeIds.has(r.rowId))
    }
  }
  // 親が submission_rows を持っていない場合は allocation_rows から
  return allRows.filter(r => scopeIds.has(r.rowId))
}
```

### 2-2. 行の初期表示（`GET /api/submissions/:id/rows`）

**変更前**: submission_rows がなければ allocation_rows を返す  
**変更後**: submission_rows がなければ「親の submission_rows」→ なければ allocation_rows

```typescript
// GET /submissions/:id/rows
const branchRows = loadSubmissionRows(db, sub.id)
if (branchRows.length > 0) return c.json(branchRows)

// 親の submission_rows を確認
if (sub.parent_id) {
  const parentRows = loadSubmissionRows(db, sub.parent_id)
  if (parentRows.length > 0) {
    const scope = JSON.parse(sub.scope) as SubmissionScope
    const allRows = loadRoundRows(db, sub.round_id)
    const scopeIds = new Set(resolveScope(scope, allRows))
    return c.json(parentRows.filter(r => scopeIds.has(r.rowId)))
  }
}

// 最終フォールバック: allocation_rows
const trunkRows = loadRoundRows(db, sub.round_id)
const scope = JSON.parse(sub.scope) as SubmissionScope
const scopeIds = new Set(resolveScope(scope, trunkRows))
return c.json(trunkRows.filter(r => scopeIds.has(r.rowId)))
```

---

## 3. 修正: `POST /api/submissions/:id/submit`

**変更前**: 3-way merge を実行して allocation_rows に書く  
**変更後**: バリデーションのみ実行して status を `submitted` に変更するだけ（マージは実行しない）

```typescript
// submit ハンドラの変更点
// --- 削除 ---
// mergeSubmission(...) の呼び出し
// allocation_rows への upsert

// --- 残す ---
// バリデーション（validateCrossRowConsistency）
// 配下チェック（merged/cancelled のみ OK）
// status = 'submitted' への更新
// 親への通知
```

配下チェックの条件も変更：
```sql
-- 変更前
WHERE parent_id = ? AND status NOT IN ('submitted', 'cancelled')
-- 変更後
WHERE parent_id = ? AND status NOT IN ('merged', 'cancelled')
```

---

## 4. 新設: `POST /api/submissions/:id/merge`

親 coordinator が子 Submission をマージする。

**リクエスト**: body なし（または空）  
**権限**: 親 Submission の assignee_id = 自分（または admin）  
**前提**: 子の status が `submitted` であること

```typescript
app.post('/:id/merge', async (c) => {
  const user = c.get('user')
  const db = getDb()
  const sub = db.prepare('SELECT * FROM submissions WHERE id = ?').get(id)

  // 権限チェック: 自分が親の assignee か admin か
  if (user.role !== 'admin') {
    if (!sub.parent_id) return c.json({ error: '最上位 Submission はマージ不要です' }, 400)
    const parent = db.prepare('SELECT assignee_id FROM submissions WHERE id = ?').get(sub.parent_id)
    if (!parent || parent.assignee_id !== user.id)
      return c.json({ error: '親 Submission の担当者のみマージできます' }, 403)
  }

  if (sub.status !== 'submitted')
    return c.json({ error: '提出済み（submitted）の Submission のみマージできます' }, 409)

  // 3-way merge 実行
  const conflicts = await performMerge(db, sub)

  // 子のステータスを merged に変更
  db.prepare("UPDATE submissions SET status = 'merged', updated_at = datetime('now') WHERE id = ?")
    .run(sub.id)

  return c.json({ status: 'merged', conflicts })
})
```

**`performMerge` 内部処理**（merge と sync で共用）:

```typescript
function performMerge(db: DB, sub: SubmissionRecord): ConflictResult[] {
  const snapshotRows: AllocationRow[] = sub.snapshot_data
    ? JSON.parse(sub.snapshot_data)
    : []

  const branchRows = loadSubmissionRows(db, sub.id)
  const theirs = branchRows.length > 0 ? branchRows : snapshotRows

  // ours: 親の submission_rows（なければ allocation_rows）
  let ours: AllocationRow[]
  if (sub.parent_id) {
    const parentRows = loadSubmissionRows(db, sub.parent_id)
    ours = parentRows.length > 0 ? parentRows : loadRoundRows(db, sub.round_id)
  } else {
    ours = loadRoundRows(db, sub.round_id)
  }

  const mergeResults = mergeSubmission(snapshotRows, ours, theirs)

  // 書き込み先: 親の submission_rows（最上位なら allocation_rows）
  const conflicts: ConflictResult[] = []

  if (sub.parent_id) {
    const upsert = db.prepare(`
      INSERT INTO submission_rows (submission_id, row_id, data)
      VALUES (?, ?, ?)
      ON CONFLICT(submission_id, row_id) DO UPDATE SET
        data = excluded.data, updated_at = datetime('now')
    `)
    db.transaction(() => {
      for (const [rowId, result] of mergeResults) {
        upsert.run(sub.parent_id, rowId, JSON.stringify(result.merged))
        if (result.conflicts.length > 0)
          conflicts.push({ rowId, fields: result.conflicts as string[] })
      }
    })()
  } else {
    // 最上位: allocation_rows に書く
    const upsert = db.prepare(`
      INSERT INTO allocation_rows (round_id, submission_id, row_id, data)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(round_id, row_id) DO UPDATE SET
        submission_id = excluded.submission_id,
        data = excluded.data, updated_at = datetime('now')
    `)
    db.transaction(() => {
      for (const [rowId, result] of mergeResults) {
        upsert.run(sub.round_id, sub.id, rowId, JSON.stringify(result.merged))
        if (result.conflicts.length > 0)
          conflicts.push({ rowId, fields: result.conflicts as string[] })
      }
    })()
  }

  // conflict 記録
  if (conflicts.length > 0) {
    db.prepare("UPDATE submissions SET conflict_fields = ? WHERE id = ?")
      .run(JSON.stringify(conflicts), sub.id)
  }

  return conflicts
}
```

---

## 5. 新設: `POST /api/submissions/:id/sync`

親 coordinator が子の途中状態を自分のワークスペースに取り込む。子の status は変わらない。

**リクエスト**: body なし  
**権限**: merge と同じ（親の assignee_id = 自分、または admin）  
**前提**: 子の status を問わない（pending / in_progress / submitted どれでも可）

```typescript
app.post('/:id/sync', async (c) => {
  // merge と同じ権限チェック

  // performMerge を実行（merge と共用）
  const conflicts = await performMerge(db, sub)

  // 子のステータスは変更しない（sync の特徴）

  return c.json({ conflicts })
})
```

---

## 6. `POST /api/submissions/:id/submit` の修正

強制提出の `forceCancelDescendants` 内部も `performMerge` を使うよう変更。  
子が `merged` になった後は再度 `submitted` に変更できない（`submitted` への逆戻りは不可）。

配下チェック条件を変更：

```typescript
// 変更前
WHERE parent_id = ? AND status NOT IN ('submitted', 'cancelled')
// 変更後
WHERE parent_id = ? AND status NOT IN ('merged', 'cancelled')
```

---

## 7. Excel アップロード（Round 初期化）

### サーバー: `POST /api/rounds`

`rows` フィールドを受け取って `allocation_rows` に保存する処理を追加。

```typescript
// POST /rounds の body
interface CreateRoundBody {
  label: string
  kind?: RoundKind
  basedOnRevisionId: string
  rows?: AllocationRow[]  // Excel からインポートした行
}

// 処理: rows が渡された場合は allocation_rows に一括 upsert
if (body.rows && body.rows.length > 0) {
  const upsert = db.prepare(`
    INSERT INTO allocation_rows (round_id, row_id, data)
    VALUES (?, ?, ?)
    ON CONFLICT(round_id, row_id) DO UPDATE SET
      data = excluded.data, updated_at = datetime('now')
  `)
  db.transaction(() => {
    for (const row of body.rows!) {
      upsert.run(roundId, row.rowId, JSON.stringify(row))
    }
  })()
}
```

### フロントエンド: `RoundCreateModal`

Excel アップロードステップを追加する（Phase B2 の UI 実装）。  
STEP1 の `excelImporter` 等の既存インフラを再利用して行データを生成する。

---

## 8. 実装順序（Phase B2）

1. **`merged` ステータス追加** — `adminApi.ts` の型 + 各 `STATUS_LABELS/COLORS` に追加
2. **スナップショット取得元修正** — `POST /submissions` の snapshot 取得ロジック変更
3. **GET rows 修正** — 親の submission_rows フォールバック追加
4. **`POST /submit` 変更** — 自動マージ削除・status=`submitted` のみ・配下チェック条件変更
5. **`performMerge` ヘルパー実装** — `apps/server/src/routes/submissions.ts`
6. **`POST /merge` 新設** — 親による手動マージ
7. **`POST /sync` 新設** — 親による途中状態取り込み
8. **`forceCancelDescendants` 修正** — `performMerge` を使うよう変更・配下チェック条件修正
9. **PortalView UI** — `submitted` 行に「マージする」、`in_progress`/`pending` 行に「現状を確認・反映」
10. **SubmissionEditView UI** — `merged` ステータスの表示追加
11. **Excel アップロード** — `POST /rounds` の rows 保存 + RoundCreateModal の UI
12. **型チェック** — `apps/server` + `apps/web`
