# G6-03 マージ/リベースの対話的レビュー仕様

> **ステータス**: STEP1 実装済み（2026-07）
> コード上の識別子: `MergeSession` / `MergeSessionRow` / `MergeHistoryEntry`
> 実装詳細・設計経緯: [`docs/22-merge-rebase-review.md`](../../docs/22-merge-rebase-review.md)
> 関連: [`G6-01 担当者ワークフロー`](01-assignee-workflow.md)、[`G8-01 スナップショット・マージ実装仕様`](../G8-delegation/01-snapshot-merge.md)

---

## 概要

分割エクスポート運用（担当者から提出物を回収する「マージ」）と、人事システムからの
要員配置リスト再生成運用（「リベース」＝新しいPrevの上に今の作業を引き継ぐ）を、
共通の対話的レビュー画面に統合したもの。マッチングキーは Excel の **No.列**。

---

## 実装状況

| 項目 | 状態 |
|---|---|
| No.必須・重複チェック（`validateNoColumn`） | ✓ 実装済み |
| マージ差分計算（`computeRowDiffs` + `MERGEABLE_FIELDS`） | ✓ 実装済み |
| リベース計画計算（`computeRebasePlan`。新Prev+旧Afterの合成） | ✓ 実装済み |
| 統合エントリポイント（`ListIntegrationButton`。モード選択→ファイル選択） | ✓ 実装済み |
| インポートプレビュー画面 | ✗ 廃止（レビュー画面に統合） |
| インポートオプション選択画面（全件置換/新規追記等） | ✗ 廃止（固定値運用） |
| レビュー画面（比較形式・仮想化・組織別グループ化） | ✓ 実装済み |
| 1段階承認（承認・却下・差し戻し） | ✓ 実装済み |
| セッション破棄（baselineへの完全ロールバック） | ✓ 実装済み |
| 新規インポート時の未承認セッション上書きガード | ✓ 実装済み |
| セッション終了時の履歴記録（`mergeHistory`） | ✓ 実装済み |
| 履歴閲覧UI（`MergeHistoryModal`） | ✓ 実装済み |
| 再提出ファイルの自動紐付け（差し戻し→再提出の追跡） | ✗ 未実装（意図的にスコープ外） |
| STEP2への移行（`pendingMerge`/`mergeHistory` → `submissions`テーブル） | ✗ 未着手 |

---

## 業務ルール

1. **No.が唯一の正式なキー**。`groupEmployeeId`・`departmentCode` は正式なIDではない。
   取り込み元ファイルは No. が全行に存在し重複がないことを事前にブロッキングチェックする。
2. **行は絶対に削除しない**。取り込み元にない行（`removed`）は自動削除せず「確認のみ」
   （データ変更なしの `confirmed`）にとどめる。退職者も退職フラグで表現する運用のため。
3. **リベースはPrevも書き換える**（新しい要員配置リストのPrevが絶対の正）。
   **マージはAfterフィールド（+ metaフィールド）のみ反映**し、Prevはマージ元の実績として不変。
4. **マージ/リベースの取り込み対象フィールド**は、ポジション・組織等の業務フィールド
   （`FIELD_METADATA`）に加え、ID・氏名・異動事由・メモ等の meta フィールドも含む
   （`MERGEABLE_FIELDS`）。ふりがな（lastNameKana/firstNameKana）はExcel列定義がないため対象外。
5. **差し戻し先の特定は既存の `assignee` フィールドを再利用**する（分割エクスポート時点で
   実名が入っている）。新しい紐付け構造は作らない。

---

## 行の状態遷移

```
pending → committed  （added/modified: 承認 → 実データに反映）
pending → confirmed  （removed: 確認のみ・データ変更なし）
pending → rejected   （added/modified: 却下・取り込まない・再提出も求めない）
pending → returned   （added/modified: 差し戻し・担当者に再提出を依頼）
```

- `rejected`/`returned` は `removed` には使わない（削除しない運用のため）。
- 全行が `pending` 以外になったら「リリース」でセッション終了（履歴に記録）。
- セッションはいつでも「破棄」できる。破棄はセッション開始時点（rebaseの自動反映より前）の
  スナップショットへの完全ロールバック（git の `merge --abort` 相当）。

---

## 画面構成

```
ListIntegrationButton（ヘッダー）
  choose-mode: 「マージ」「新バージョンのリストに載せ替え」を選択
  → ファイル選択 → No.検証 → 既存セッションがあれば overwrite-confirm
  → MergeReviewView を開く

MergeReviewView（モーダル）
  ヘッダー: ファイル名・全体件数の内訳（反映/確認/却下/差し戻し/残り）
  FilterBar: 検索・詳細条件・変更種別チップ・要確認チップ（既存UnifiedReviewViewのFilterBarを再利用）
  MergeReviewTable: 組織別グループ・仮想化・比較形式の全フィールド表示（meta列は紫、業務列は藍）
  MergeReviewFooter: 承認/却下/差し戻し/残り一括承認/破棄/リリース

MergeHistoryModal（ヘッダーから開く）
  過去のセッション（リリース/破棄）の一覧。行ごとの最終結果・差し戻し先担当者名
```

---

## STEP1 / STEP2 設計対比

| 観点 | STEP1（実装済み） | STEP2（依頼モデル。既存・別実装） |
|---|---|---|
| 想定する状況 | 単一ブラウザセッションへの外部ファイル取り込み | 複数人が並行してRoundを編集 |
| マッチングキー | `no`（Excel No.列） | `rowId`（サーバー管理の連番） |
| 差分対象フィールド | `MERGEABLE_FIELDS`（meta含む） | `FIELD_METADATA` のみ |
| 競合解決 | 人間が1行ずつ承認/却下/差し戻し | `mergeRow` による自動3-way merge |
| 保存先 | `PersistedPayload.pendingMerge`（ブラウザのみ） | `submissions` テーブル（サーバー） |
| 履歴 | `mergeHistory`（軽量ローカルログ） | `submissions.status`・`conflict_fields`（DB） |

**共有しているコード**: `packages/domain/src/diffMerge.ts` の `computeRowDiffs`。
STEP2側のデフォルト挙動（`FIELD_METADATA` のみ差分対象）を変えないため、第4引数 `diffFields`
（省略可）でSTEP1側だけがオプトインする設計にしている。**STEP2側の呼び出し箇所
（`apps/server/src/routes/submissions.ts`）を変更するときは、この共有関係に注意すること。**

---

## やらないこと（スコープ外）

- 複数セッションの同時並行管理（`pendingMerge` は常に1つ）
- 再提出ファイルの自動紐付け（差し戻し→再提出の追跡）
- 正式なファイル形式（ZIP等）でのバックアップ（JSONダウンロードの簡易実装のみ）
- リベース衝突専用の解決UI（既存の「要確認」タブに委ねる）
