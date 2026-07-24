# 22 — マージ/リベースの対話的レビュー 実装リファレンス

> 仕様書: [`specs/G6-workflow/03-merge-rebase-review.md`](../specs/G6-workflow/03-merge-rebase-review.md)
> 実装状況: STEP1 実装済み（2026-07）

---

## 概要

STEP1（Excel ローカル運用）で、外部から届いた要員配置データを今の作業内容と突き合わせる2つのシナリオを、
共通の「対話的レビュー」フローとして実装したもの。

1. **マージ**: 担当者が分割エクスポートしたExcelを提出してきたので、今の作業に取り込みたい
2. **リベース**: 人事システムで再生成された最新の要員配置リスト（Prevが更新され、Afterはまっさら）が届いたので、
   今まで作業してきたAfter編集をその上に引き継ぎたい

どちらも「入ってくるファイルの行 vs 今のセッションの行」を **No.（Excel No.列）をキーに** 突き合わせ、
1行ずつ「承認・却下・差し戻し」を選べるレビュー画面（`MergeReviewView`）に集約している。

この機能はGit/GitHubの用語やメンタルモデルを何度も参考にしながら設計した。設計過程で最初の想定を
何度も覆す実装者側からの疑問・フィードバックがあり、最終形はそれらを反映したものになっている
（「3. 設計の経緯」に詳しい）。

---

## アーキテクチャ全体像

```
UI 層
  ListIntegrationButton  ─ マージ/リベース統合エントリポイント
    ├─ choose-mode ステップ  ─「マージ」「新バージョンに載せ替え」を選ぶ
    └─ overwrite-confirm     ─ 既存の未承認セッションがあれば確認
  MergeReviewView  ─ レビュー画面本体（フィルタ・件数・履歴）→ MergeReviewTable（仮想化・比較形式）+ MergeReviewFooter（承認/却下/差し戻し/破棄/リリース）
  MergeHistoryModal  ─ 過去のセッションの記録閲覧
       │ Zustand（useStore.ts）
Store 層（useStore.ts）
  pendingMerge: MergeSession | null  ─ 進行中セッション（1つのみ）
  mergeHistory: MergeHistoryEntry[]  ─ 終了したセッションの記録
  approveMergeRows / rejectMergeRows / returnMergeRows / releaseMergeSession / discardMergeSession
       │
Application 層（HRApplicationService）
  acceptMergeRowsAdd / acceptMergeRowsModify / acceptMergeRowsReplace
  restoreAllocationList  ─ 破棄時の完全ロールバック（1 Undoエントリ）
       │
Domain 層（packages/domain/src/）
  importValidation.ts  ─ validateNoColumn（No.必須・重複チェック）
  diffMerge.ts          ─ computeRowDiffs（STEP2委任と共有）
  rebasePlan.ts         ─ computeRebasePlan（新Prev+旧Afterの合成）
  allocationRow.ts      ─ META_FIELDS / MERGEABLE_FIELDS
       │
Infrastructure 層（infrastructure/workspace/）
  PersistedPayload.pendingMerge / mergeHistory
  （専用の永続化ストアは作らず、既存の autosave payload に同居）
```

---

## データモデル

```typescript
// infrastructure/workspace/types.ts

interface MergeSessionRow {
  key:          string   // row.no
  kind:         'added' | 'removed' | 'modified'
  incomingRow?: AllocationRow   // added/modified のみ。レビュー中インライン編集可能
  status:       'pending' | 'committed' | 'confirmed' | 'rejected' | 'returned'
}

interface MergeSession {
  mode:                    'merge' | 'rebase'
  sourceFileName:          string
  importedAt:              string
  importMode?:             ImportMode        // merge のみ（固定値 'replace-all'）
  assigneeMode?:           AssigneeImportMode // merge のみ（固定値 'overwrite'）
  rows:                    MergeSessionRow[]
  autoAppliedCount?:       number            // rebase のみ。差分なし行の自動反映件数
  baselineAllocationList?: AllocationRow[]   // 破棄時の完全ロールバック用スナップショット
}

interface MergeHistoryEntry {
  mode:           'merge' | 'rebase'
  sourceFileName: string
  importedAt:     string
  endedAt:        string
  endReason:      'released' | 'discarded'
  rows: {
    key: string; kind: MergeSessionRow['kind']
    outcome: 'committed' | 'confirmed' | 'rejected' | 'returned' | 'abandoned'
    assignee?: string   // returned のときの差し戻し先
  }[]
}
```

`PersistedPayload` に `pendingMerge: MergeSession | null` と `mergeHistory: MergeHistoryEntry[]`
（新しい順・上限50件）を持たせている。専用の永続化ストアは作らず、既存の `LocalWorkspaceStore`
の単一 OPFS ファイルに同居させている（理由は後述）。

---

## 行の状態遷移（1段階承認）

`pending` から3方向に遷移し、いずれも終端状態（`committed`/`confirmed` は実データに反映、`rejected`/`returned` はデータ変更なし）。セッション破棄はどの状態からでも `baselineAllocationList` へ完全ロールバックする。

- **added/modified**: 承認 → `committed`（実データに反映）／却下 → `rejected`／差し戻し → `returned`
- **removed**（取り込み元にない行）: 承認に相当する操作は「確認」のみ → `confirmed`（データ変更なし）
- 却下・差し戻しは `removed` には使わない（後述の「行は絶対に削除しない」ルールのため）
- 全行が `pending` 以外になったら「リリース」が押せる（`releaseMergeSession`）
- いつでも「破棄」で `baselineAllocationList` に完全ロールバックできる（`discardMergeSession`）

---

## 3. 主要な決定

実装者からの疑問・利用シーンの深掘りを経て、当初プランから以下の点が確定している。

- **マッチングキーは No.（Excel No.列）**。`groupEmployeeId + departmentCode` は正式な ID ではないため不採用。取り込み元ファイルは「No.が全行に存在し重複がないこと」を事前にブロッキングチェックする（`validateNoColumn`）
- **削除は絶対に行わない**。退職者も行削除ではなく退職フラグで表現する運用のため、「取り込み元にない行」（`removed` kind）は自動削除せず「確認のみ」（データ変更なしの `confirmed`）にとどめる
- **1段階承認**（ステージングは再導入しない）。承認した瞬間に実データへ反映し、差し戻したい行は単に承認せず残す。承認前の `incomingRow` インライン編集で「直してから確定」のニーズをカバーする
- **破棄は完全ロールバック**（git の `merge --abort` 相当）。セッション開始直後に `allocationList` のスナップショットを取り、破棄時はそこへ戻す（`HRApplicationService.restoreAllocationList`）。「承認済みの変更は実データに残る」ワークアラウンドは不採用
- **行レベルの結果は3択**（承認・却下・差し戻し、GitHub PR レビュー相当）。差し戻し先の特定は既存の `assignee` フィールドを流用し、新しい紐付け構造は作らない。再提出ファイルの自動連携（「差し戻した行への回答」検出）も作らない
- **表示形式は比較形式**（`UnifiedReviewView` の diff モードと同じ1フィールド1列スタック表示）。列順（取り込み値=左・現在値=右）は Prev/After の慣習とは逆に、Git の「ours/theirs」に寄せている
- **差分対象フィールドは `MERGEABLE_FIELDS`**（`META_FIELDS` + `FIELD_METADATA.after`）まで拡張。中核関数 `computeRowDiffs`（`packages/domain/src/diffMerge.ts`）は STEP2 の委任ワークフロー（`mergeSubmission`）とも共有されているため、第4引数 `diffFields`（省略可）でオプトインにし、STEP2 側のデフォルト（`FIELD_METADATA` のみ）は変えていない
- **3万行想定で仮想化必須**。`UnifiedTable.tsx` と同じ手動仮想化（累積高さ配列 + 二分探索 + 前後パディング行）を追加。メタフィールド（ID・氏名・異動事由・メモ）は列の先頭に固定しヘッダー色を分離（紫＝メタ情報、藍＝業務フィールド）
- **インポートプレビュー・オプション選択画面は廃止**。マージレビュー画面に統合し、インポートオプションは `FIXED_IMPORT_MODE='replace-all'` / `FIXED_ASSIGNEE_MODE='overwrite'` に固定
- **セッション終了時に `MergeHistoryEntry` を記録**。行キー・種別・最終結果・差し戻し先担当者名のみを持つ軽量なサマリー（STEP1 にはサーバー監査基盤がないため）

---

## 4. STEP2（依頼・委任ワークフロー）との関係

STEP2には既に、Excel運用の「スナップショット渡し → 担当者が差分を入れる → coordinatorがマージ確認」
を構造化した **依頼・委任モデル**（`docs/14-delegation-model.md` / `specs/G8-delegation/01-snapshot-merge.md`）
がある。これは本機能より先に設計されたもので、Gitのメタファーで次のように対応づけられている。

| Git 概念 | STEP2の依頼モデル |
|---|---|
| リポジトリ | Round |
| main ブランチ | `allocation_rows`（最終確定データ） |
| feature ブランチ | coordinator の `submission_rows` |
| `git merge`（手動） | 親が「マージする」→ 3-way merge（snapshot/ours/theirs） |

本機能とSTEP2の依頼モデルは、**同じ `diffMerge.ts` の `computeRowDiffs` を共有**しているが、以下の点で明確に異なる。

| 観点 | STEP1（本機能） | STEP2（依頼モデル） |
|---|---|---|
| 想定する状況 | 単一ブラウザセッションに外部ファイルを取り込む | 複数人が並行して同じRoundを編集する |
| マッチングキー | `no`（Excel No.列） | `rowId`（サーバー管理の連番） |
| 差分対象フィールド | `MERGEABLE_FIELDS`（meta含む・オプトイン） | `FIELD_METADATA` のみ（デフォルト） |
| 競合解決 | 人間が1行ずつ承認/却下/差し戻しを判断 | `mergeRow` による自動3-way merge（conflict検出） |
| 途中状態の保存 | `PersistedPayload.pendingMerge`（ブラウザのみ） | `submissions` テーブル（サーバー） |
| 履歴 | `mergeHistory`（軽量ローカルログ） | `submissions.status`・`conflict_fields`（DB） |

STEP1が「人間が1行ずつ判断する」設計なのは、単一ユーザー・単一セッションのため Git のような真の並行編集競合が起きないから。STEP2で自動3-way mergeが必要なのは、複数の coordinator が同時に同じ Round を編集しうるため。`pendingMerge` を専用ストアでなく既存の `PersistedPayload` に同居させたのは、将来 STEP2 の Round/Submission 的なセッション概念へ拡張しやすくする意図（`snapshot_data` 相当へほぼそのままマッピングできる見込み）。

---

## 5. やらないと決めたこと（明示的なスコープ外）

- **複数セッションの同時並行管理**: `pendingMerge` は常に1つのみ。新規インポート時に未承認の
  セッションが残っていれば警告して確認を求める（`overwrite-confirm`）。真の並行処理はSTEP2の
  依頼モデルに委ねる。
- **再提出ファイルの自動紐付け**: 「差し戻した行への回答」を検出して自動連携する仕組みは作って
  いない。次にファイルが来ても普通の新規マージとして扱う。
- **正式なファイル形式（ZIP等）でのバックアップ**: セッションのJSONダウンロードのみ（簡易実装）。
- **リベース衝突専用の解決UI**: 新Prev＋旧Afterの合成で衝突が起きた行は、既存の「要確認」タブ・
  `validateRow` にそのまま委ねる。
