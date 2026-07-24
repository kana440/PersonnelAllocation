# G8-01 — スナップショット・マージ実装仕様（Phase B2）

> 設計の背景・判断理由・Git 対応表・ステータス遷移・3-way merge アルゴリズム・データモデルは
> `docs/14-delegation-model.md` 参照（本ファイルとの重複を避けるため、そちらを正とする）。
> 本ファイルは**実装済みエンドポイントの一覧**と、**docs/14 に記載のない実装レベルの詳細・既知の差異**のみを記す。

---

## 実装状況

| 項目 | 状態 |
|---|---|
| `diffRow` / `mergeRow` / `mergeSubmission` / `computeRowDiffs`（`packages/domain/src/diffMerge.ts`） | ✓ |
| `submissions.snapshot_data` / `conflict_fields` カラム | ✓ |
| `submission_rows` テーブル | ✓ |
| `POST /submissions` — 依頼作成時のスナップショット取得（親の submission_rows 優先） | ✓ |
| `GET /submissions/:id/rows` — 自分 → 親 → allocation_rows の順にフォールバック | ✓ |
| `PUT /submissions/:id/rows` — submission_rows への保存 | ✓ |
| `POST /submissions/:id/submit` — バリデーション + status 変更のみ（マージは行わない） | ✓ |
| `POST /submissions/:id/merge` — 親による手動マージ | ✓ |
| `POST /submissions/:id/sync` — 親による途中状態取り込み | ✓ |
| `POST /submissions/:id/request-revision` — 差し戻し | ✓ |
| `GET /submissions/:id/child-diffs` — 配下差分プレビュー（docs/14 未記載） | ✓ |
| `merged` ステータス | ✓ |
| 強制提出（`force: true`） | ✓（docs/14 の記述と実装に差異あり。下記参照） |
| Excel アップロード（Round 初期化・`POST /api/rounds`） | ✓（docs/14 §9 参照） |

実装箇所: `apps/server/src/routes/submissions.ts`（全エンドポイント共通ファイル）。

---

## docs/14 に記載のない実装詳細

### 権限モデル

`/merge`・`/sync`・`/request-revision` はいずれも `requireRole('admin', 'coordinator')` に加えて、
**直接の親 Submission の担当者（`parent.assigneeId === user.id`）のみ**に限定する（admin は無条件）。
祖父母世代の Submission や兄弟 Submission からは実行できない。最上位 Submission（`parentId` なし）に
対しては `/merge`・`/sync` 自体がエラーを返す（「最上位 Submission はマージ/sync 不要です」）。

### `GET /:id/child-diffs`（docs/14 未記載）

親が配下 Submission ごとの差分プレビューを取得する専用エンドポイント。各子について
`snapshot_data` と現在の `submission_rows`（空なら snapshot にフォールバック）を
`computeRowDiffs()` で比較し、行単位の diff 配列を返す。マージ実行前に「何が変わるか」を
確認する UI（PortalView）から呼ばれる。

### `performMerge` の共通化

`/merge` と `/sync` は同一の `performMerge(db, sub)` ヘルパーを共有する。差分は「ステータスを
`merged` に更新するかどうか」のみ（`/sync` はステータスを変更しない）。書き込み先の分岐は
`sub.parentId` の有無で決まる（親があれば親の `submission_rows`、なければ `allocation_rows`）。
`sub.snapshot_data` が空の場合（レガシーデータ等）は `performMerge` が早期リターンし、
コンフリクトなし・書き込みなしで終わる点は要注意（サイレントスキップ）。

### 提出時の整合性チェック

`POST /submit` は `validateCrossRowConsistency()`（ドメイン層の純粋関数）でスコープ内行を検証し、
問題があれば `groupEmployeeId` / `field` / `valueA` / `valueB` を含む一覧とともに 422 を返す
（マージそのものはブロックしないが、提出自体をブロックする）。

### 既知の差異: 強制提出（force）が docs/14 の記述と一致しない

docs/14 §4-D は「配下の各未完了子について sync 相当の merge を実行（部分マージ）→ 親ワークスペースに
反映 → 対象子を `cancelled` に変更」と記述しているが、実装の `forceCancelDescendants()` は
**マージを実行せず**、`merged`/`cancelled` 以外の子を再帰的に `cancelled` へ変更するだけになっている
（`performMerge` の呼び出しがない）。つまり強制提出で打ち切られた子の未反映分は失われる。
❓ 仕様どおり部分マージを行うべきか、現状の「打ち切りのみ」で意図した挙動かは要確認。

### 既知の差異: `PUT /:id/rows` の編集ブロック条件に残る `accepted`

編集ブロック判定が `['submitted', 'merged', 'accepted'].includes(sub.status)` になっているが、
`accepted` は docs/14 で「削除したステータス」と明記されており実際には発行されない
（無害なデッドコード。クリーンアップ候補）。
