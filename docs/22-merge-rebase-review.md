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
┌──────────────────────────────────────────────────────────────────┐
│ UI 層                                                              │
│   ListIntegrationButton      ─ マージ/リベース統合エントリポイント   │
│     ├─ choose-mode ステップ  ─ 「マージ」「新バージョンに載せ替え」を選ぶ│
│     └─ overwrite-confirm     ─ 既存の未承認セッションがあれば確認     │
│   MergeReviewView            ─ レビュー画面本体（フィルタ・件数・履歴）│
│     ├─ MergeReviewTable      ─ 仮想化テーブル本体（比較形式表示）     │
│     └─ MergeReviewFooter     ─ 承認/却下/差し戻し/破棄/リリース      │
│   MergeHistoryModal          ─ 過去のセッションの記録閲覧            │
└──────────────────┬───────────────────────────────────────────────┘
                   │ Zustand（useStore.ts）
┌──────────────────▼───────────────────────────────────────────────┐
│ Store 層（useStore.ts）                                            │
│   pendingMerge: MergeSession | null   ─ 進行中セッション（1つのみ）  │
│   mergeHistory: MergeHistoryEntry[]  ─ 終了したセッションの記録     │
│   approveMergeRows / rejectMergeRows / returnMergeRows             │
│   releaseMergeSession / discardMergeSession                        │
└──────────────────┬───────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────┐
│ Application 層（HRApplicationService）                             │
│   acceptMergeRowsAdd / acceptMergeRowsModify / acceptMergeRowsReplace│
│   restoreAllocationList  ─ 破棄時の完全ロールバック（1 Undoエントリ）│
└──────────────────┬───────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────┐
│ Domain 層（packages/domain/src/）                                  │
│   importValidation.ts  ─ validateNoColumn（No.必須・重複チェック）  │
│   diffMerge.ts          ─ computeRowDiffs（STEP2委任と共有）        │
│   rebasePlan.ts         ─ computeRebasePlan（新Prev+旧Afterの合成）  │
│   allocationRow.ts      ─ META_FIELDS / MERGEABLE_FIELDS            │
└──────────────────┬───────────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────────┐
│ Infrastructure 層（infrastructure/workspace/）                     │
│   PersistedPayload.pendingMerge / mergeHistory                     │
│   （専用の永続化ストアは作らず、既存の autosave payload に同居）    │
└──────────────────────────────────────────────────────────────────┘
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

```
                    ┌──────────┐
   ┌──────────────► │ pending  │ ◄──────────────┐
   │                └────┬─────┘                │
   │       ┌──────────────┼──────────────┐       │
   │       ▼              ▼              ▼       │ セッション破棄
   │  承認（committed/  却下（rejected）  差し戻し   │ （baselineへ
   │  confirmed）        データ変更なし  （returned） │  完全ロールバック）
   │  実データに反映      終端状態        データ変更なし │
   │                                     終端状態  │
   └─────────────────────────────────────────────┘
```

- **added/modified**: 承認 → `committed`（実データに反映）／却下 → `rejected`／差し戻し → `returned`
- **removed**（取り込み元にない行）: 承認に相当する操作は「確認」のみ → `confirmed`（データ変更なし）
- 却下・差し戻しは `removed` には使わない（後述の「行は絶対に削除しない」ルールのため）
- 全行が `pending` 以外になったら「リリース」が押せる（`releaseMergeSession`）
- いつでも「破棄」で `baselineAllocationList` に完全ロールバックできる（`discardMergeSession`）

---

## 3. 設計の経緯（何を、なぜ変えたか）

この機能は最初のプラン承認後も、実装者からの疑問・利用シーンの深掘りで何度も設計が変わっている。
以下は時系列で見た主要な転換点。

### No.（Excel No.列）が唯一の正式なキー

当初 `groupEmployeeId + departmentCode` をマッチングキーと想定していたが、これは正式なIDではなく、
運用上は Excel の **No.列** が唯一の一意キーとして扱われていることが判明した。
取り込み元ファイルは「No.が全行に存在し、重複がないこと」を事前にブロッキングチェックする
（`validateNoColumn`）。

### 削除は絶対に行わない

退職者も行削除ではなく退職フラグで表現する運用のため、「取り込み元にない行」（`removed` kind）は
自動削除の対象にしない。マージ・リベースどちらでも「確認のみ」（データ変更なしの `confirmed`）に
とどめる。

### ステージング → 1段階承認への回帰

最初は Git のステージング（`git add` して `git commit`）を模した2段階（ステージング→コミット）で
実装した。コミット前に何度でも差し戻し・編集できる安全性を狙ったが、実際に使ってみると
「リリースが活性化しない」（ステージングしただけでコミットし忘れる）「コミットのイメージが難しい」
という指摘が繰り返された。中間状態が2つ以上あるとかえって分かりにくくなる、という反省を踏まえ、
**1段階承認**（承認した瞬間に実データへ反映。差し戻したい行は単に承認せず残す）に単純化した。
承認前の `incomingRow` インライン編集で「直してから確定」のニーズはカバーできている。

### 破棄は git の `merge --abort` と同じ意味に

1段階承認にしたことで「破棄」の意味が曖昧になった。当初は「セッションの追跡情報を消すだけ、
承認済みの変更は実データに残る」という実装だったが、これは実質ワークアラウンドだった。
「破棄する操作には、それまで仮で決めたものもロールバックしたいと自然と思う」という指摘を受け、
セッション開始直後（リベースの自動反映より前）に `allocationList` のスナップショットを取っておき、
破棄時はそこへ完全ロールバックするよう作り直した（`HRApplicationService.restoreAllocationList`）。
ステージングは再導入せず、UIは1段階承認のまま、破棄だけを本物のロールバックにした。

### 行レベルの結果を3択に拡張（承認・却下・差し戻し）

「担当者に、これだけ直しておいてと渡して、再提出されたものだけ取り込みたい」という運用ニーズから、
GitHubのPRレビュー（Approve / Close without merging / Request changes）に相当する3択に拡張した。
差し戻し先の特定には新しい紐付け構造を作らず、分割エクスポート時点で既に実名が入っている
`assignee` フィールドをそのまま使っている。再提出ファイルを「以前差し戻した行への回答」として
自動連携する仕組みは意図的に作っていない（次にその担当者のファイルが来ても普通の新規マージとして
扱えば運用は回る、というスコープ判断）。

### 表示形式は「比較形式」、列順はGitの「ours/theirs」に寄せる

レビュー画面の表示は一度「Excel形式」（取り込み値列群・現在値列群を左右に並べる side-by-side、
列順は現在値=右・取り込み値=左）で作ったが、「比較形式（`UnifiedReviewView` の diff モードと同じ、
1フィールド1列で変更前後をスタック表示）にしてほしい」という指摘で作り直した。列数が半分になり、
仮想化とも相性がよい。なお列順（取り込み値が左・現在値が右）は、他画面のPrev/After比較の慣習
（旧→左・新→右）とは逆にしている。ここはPrev/Afterではなく Git の「ours/theirs」に近い概念だから、
という位置づけ。

### 取り込み対象フィールドの拡張とSTEP2との共存

当初はポジション・組織などの `FIELD_METADATA`（before/afterペアを持つ業務フィールド）しか
差分検出・反映していなかったが、「ID・氏名・異動事由・メモも取り込み対象にしてほしい」という
指摘で `META_FIELDS`（before/afterペアを持たない単一値フィールド）を追加し、
`MERGEABLE_FIELDS = META_FIELDS + FIELD_METADATA.after` として拡張した。

ここで重要なのは、差分計算の中核関数 `computeRowDiffs`（`packages/domain/src/diffMerge.ts`）が
**STEP2の委任ワークフロー**（`apps/server/src/routes/submissions.ts` の `mergeSubmission`）とも
共有されている点。STEP2側のデフォルト挙動（`FIELD_METADATA` のみを差分対象にする）を変えないよう、
`computeRowDiffs` に第4引数 `diffFields`（省略可）を追加してオプトインにした。STEP1のマージだけが
明示的に `MERGEABLE_FIELDS` を渡す。vitestの既存テスト（`non-DIFF_FIELDS（rowId・userId）は
changes に含まれない`）がSTEP2のデフォルト経路を今も保証している。

### 仮想化・列順の実務的な調整

「この表は３万行の時も大丈夫なように仮想化されてますか？」という指摘で、`UnifiedTable.tsx` と
同じ手動仮想化（累積高さ配列 + 二分探索 + 前後パディング行）を追加した。リベースは全社規模の
差し替えを扱いうるため、マージ（担当者1人分の提出物）ほど行数が小さいとは限らない、という理由。

またメタフィールド（ID・氏名・異動事由・メモ）は業務フィールド（30列超）の後ろに置くと
画面の遠く右側に埋もれて見えなくなるため、**メタフィールドを列の先頭**に配置し、ヘッダーの色も
分けた（紫＝メタ情報、藍＝業務フィールド）。

### インポートプレビュー・オプション選択画面の廃止

初期実装では、ファイル取り込み後に差分プレビュー（`RowDiffTable`）とインポートオプション選択
（全件置換/新規追記・担当者情報の上書き/保持）の画面を挟んでいたが、どちらも「マージレビュー画面で
十分」「オプションはデフォルト固定でいい」という指摘で廃止した。インポートオプションは
`FIXED_IMPORT_MODE='replace-all'` / `FIXED_ASSIGNEE_MODE='overwrite'` に固定している。

### セッション終了時の履歴記録

「結果が消えてしまうと担当者間のフォローが難しい」という指摘から、セッションが終了する
（リリース or 破棄）たびに `MergeHistoryEntry` を記録するようにした。STEP1にはサーバーも
正式な監査基盤もないため、行キー・種別・最終結果（反映/確認/却下/差し戻し/未解決のまま終了）・
差し戻し先の担当者名だけを持つ軽量なサマリーにとどめている。

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

本機能（STEP1のマージ/リベースレビュー）とSTEP2の依頼モデルは、**同じ `diffMerge.ts` の
`computeRowDiffs` を共有**しているが、以下の点で明確に異なる。

| 観点 | STEP1（本機能） | STEP2（依頼モデル） |
|---|---|---|
| 想定する状況 | 単一ブラウザセッションに外部ファイルを取り込む | 複数人が並行して同じRoundを編集する |
| マッチングキー | `no`（Excel No.列） | `rowId`（サーバー管理の連番） |
| 差分対象フィールド | `MERGEABLE_FIELDS`（meta含む・オプトイン） | `FIELD_METADATA` のみ（デフォルト） |
| 競合解決 | 人間が1行ずつ承認/却下/差し戻しを判断 | `mergeRow` による自動3-way merge（conflict検出） |
| 途中状態の保存 | `PersistedPayload.pendingMerge`（ブラウザのみ） | `submissions` テーブル（サーバー） |
| 履歴 | `mergeHistory`（軽量ローカルログ） | `submissions.status`・`conflict_fields`（DB） |

`pendingMerge` を専用ストアではなく既存の `PersistedPayload` に同居させた設計判断は、
**将来STEP2の「Round・Submission」的なセッション概念へ自然に拡張できるようにする**という
意図に基づく。実際にSTEP2へ移行する際は、`pendingMerge`/`mergeHistory` のデータ構造をほぼそのまま
`submissions` テーブルの列（`snapshot_data` 相当）にマッピングできる見込み。

STEP1では「人間が1行ずつ判断する」設計にしたのは、STEP1が単一ユーザー・単一セッションのため
Gitのような真の並行編集競合が起きないから。STEP2で真の3-way mergeが必要になるのは、複数の
coordinatorが同時に同じRoundを編集しうるため。

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
