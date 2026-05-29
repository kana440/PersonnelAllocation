# 次のステップ

方針: **小さく作って動かして判断する**。

---

## 現在の実装状況サマリー

| 領域 | 状態 |
|---|---|
| Excel 基盤（import / export / Undo / Redo） | ✅ 完了 |
| ポジション・人ドメインモデル（FIELD_METADATA） | ✅ 完了 |
| ポジション操作（create / assign / unassign / remove） | ✅ 完了 |
| AI チャット UI（シナリオ 8種 + agentRunner） | ✅ 完了 |
| positionCode `_pos_` → Excel 出力 blank | ✅ 完了 |
| **担当者フィールド（assignee）** | 🚧 未着手 |
| **担当者ワークフロー（管理者/担当者モード）** | 🚧 未着手 |

---

## Step 0: 担当者ワークフロー実装（大・2〜3日）

**背景**: 担当者（assignee）フィールドを軸にした分割配布・マージフローの実装。
詳細仕様は `specs/G6-workflow/01-assignee-workflow.md` を参照。

**やること（優先順）**:

```
0-A: AllocationRow に assignee フィールドを追加
     - Excel A列（ヘッダーなし）から読み取り
     - エクスポート時も A列に出力
     - FIELD_METADATA に追加（binding: 'meta'）

0-B: SetupView にモード選択を追加
     - 「管理者として開く」/「担当者として開く」の選択
     - 担当者モードでは AssigneeSelectStep（担当者選択画面）を挿入

0-C: AssigneeSelectStep の実装
     - 担当者リスト（Excel A列の値）をリスト化
     - 組織名でも絞り込み可能
     - 担当者ごとに「どの組織が何行か」を表示
     - 未割当グループ（assignee が空の行）も表示

0-D: 担当者モードのフィルタリング・ワーニング
     - useScopedStore を担当者ベースに刷新（scopeOrgId → assignee）
     - 他担当者行・未割当行のワーニング表示
     - 新規行追加時に assignee を自動設定

0-E: 担当者割り当てウィザード（管理者モード）
     - 分割軸選択（統括部単位 / グループ単位 / 自由設定）
     - 旧組織ツリーに担当者を割り当てるUI
     - 未割当行の一覧と手動割り当て

0-F: 担当者ごとの分割エクスポート（管理者モード）

0-G: 上司名補完サポート機能（管理者モード）
     - managerName（フリーテキスト）を人員データで検索
     - 候補選択 → managerPositionCode を確定
```

---

## Step 1: aiTools にポジション操作を追加（中・半日）

**背景**: 現在 AI はポジション操作（空席作成・アサイン・解除）を呼べない。
`createVacantPosition` 等は `HRApplicationService` の直接メソッドとして実装されており、
`aiTools` に公開されていない。

**やること**:

```typescript
// src/application/aiTools.ts に追加
function findVacantPositions(query: { orgCode?: string }): VacantPositionResult[] { ... }
function createVacantPosition(departmentCode: string, localJobTitle: string): void { ... }
function assignToPosition(vacantRowId: number, personSfId: string): void { ... }
function unassignFromPosition(rowId: number): void { ... }
function removePosition(rowId: number): void { ... }
```

`agentRunner` のツール定義（JSON Schema）にも追加する。

**影響**: AI が「〇〇部門に空席を作って」「△△さんをその席に配属して」を実行できるようになる。

---

## Step 2: ポジション操作を Undo 対象にする（中・半日）

**背景**: `createVacantPosition` / `removePosition` / `assignPersonToVacantPosition` / `unassignPersonFromPosition`
は `HRApplicationService` の直接メソッドで実装されており、`checkpoint()` を呼んでいないため Undo できない。

**選択肢 A（推奨）**: 各操作を `IDomainOperation` として実装し、`executeOperation()` 経由に統一する。
- `CreateVacantPositionOperation`, `AssignPersonOperation`, `UnassignPersonOperation`, `RemovePositionOperation` を追加
- `HRApplicationService` の直接メソッドはこれらを呼ぶ薄いラッパーに変更

**選択肢 B**: 直接メソッドに `checkpoint()` を追加するだけ。
- 実装コストが低いが、IDomainOperation への統一という設計方針から外れる

**判断ポイント**: AI から呼ぶ必要があるなら A（Tool Use で操作を指定しやすい）。
UI のみなら B で十分。

---

## Step 3: Claude API 本番接続（中・1日）

**背景**: `agentRunner.ts` は Claude API Tool Use ループとして実装済みだが、
API キー・エンドポイント設定が未整備で `mockChatService` で代替されている。

**やること**:
- API キー設定 UI（または環境変数）を追加
- `chatServiceFactory.ts` で本番/モックを切り替えるロジックを整備
- agentRunner のツール定義に Step 1 で追加したポジション操作を登録

---

## Step 4: 削除済みパネル UI（大・1〜2日）

**背景**: ドメインモデル上、削除済みのポジション・人はソフトデリート（削除フラグ）として保持される。
UI からは消えるが、「削除済みパネル」から復活させたい。

**やること**:
- 削除済み行を収集する projection 関数を追加
- 削除済みポジションを有効な空席に再配属できる UI
- 削除済み人物（prevUserId あり）を有効なポジションに再配属できる UI

---

## Step 5: テスト環境セットアップ（小・2〜3時間）

**背景**: 純粋関数が多くテスト容易な設計だが、テストが1本も書かれていない。

**やること**:
- Vitest + @testing-library/react のセットアップ
- `rowDiff`, `copyBeforeToAfter`, `FIELD_METADATA` の単体テスト
- `DirectEditOperation.validate()` / `apply()` のテスト
- `derivePersons` のテスト

---

## Pattern Detection の判断

`IOperationPattern` / `operationPatterns/` はインターフェースのみ定義されており実装ゼロ。

→ AI（agentRunner）が Tool Use でパターンを判断できるなら**削除を検討**。
AI なしで Excel 読み込み時に操作種別を自動推定したい場合は必要。
Step 3（API 接続）完了後に判断する。

---

## 優先順位まとめ

```
今すぐ着手可能:
  Step 0: 担当者ワークフロー実装             → 配布・マージフローの実現（最重要）
  Step 5: テスト環境セットアップ             → 品質基盤

次のスプリント:
  Step 1: aiTools にポジション操作を追加    → AI-UI 対称性の確保
  Step 2: ポジション操作を Undo 対象に       → ユーザー体験の完成
  Step 3: Claude API 本番接続               → AI 機能の本番化

その後:
  Step 4: 削除済みパネル UI
  SuccessFactors 連携（Phase 4 / 5）
```
