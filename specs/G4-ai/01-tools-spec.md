# G4-01 AI Tools 設計仕様

> **目的**: AI（Claude）がこのアプリから呼べる Tools の設計・説明プロンプトを定義する。
> 実装基盤: `apps/web/src/application/aiTools/`
> ツール登録: `apps/web/src/infrastructure/ai/toolRegistry/`
>
> **原則**:
> - Toolの説明文は「AIが使い方を誤らない」精度で書く
> - 読み取り専用ツールと書き込みツールを明確に分ける
> - 業務ルール（G2-domain）を Tool の説明に反映する

---

## 1. 実装済み Tools

### 1.1 読み取り専用（read / render）

| Tool名 | 説明 | 登録ファイル |
|---|---|---|
| `getReviewSummary` | 変更種別ごとの件数 + バリデーション問題件数 | `readTools.ts` |
| `getValidationDiagnosis` | 問題をフィールド別・修正方法別に集計。rowIds 付き。**操作後に優先使用** | `readTools.ts` |
| `getChangedRows` | 変更ありの行リスト。kind・名前・組織コードでフィルタ可能 | `readTools.ts` |
| `getValidationIssues` | バリデーション問題の詳細一覧（getValidationDiagnosis の下位版） | `readTools.ts` |
| `findPersons` | 氏名・userId・社員番号などのあいまい検索。`availableOps` を返す | `readTools.ts` |
| `findOrgs` | 組織名・コードのあいまい検索。`descendantOrgCodes` も返す | `readTools.ts` |
| `findVacantPositions` | 組織を絞り込んで空席ポジション一覧を返す | `readTools.ts` |
| `getPersonsDetail` | rowId 指定で AllocationRow 全フィールドを返す | `readTools.ts` |
| `getFieldOptions` | 指定行・フィールドの有効選択肢を返す。FIELD_CONSTRAINTS の条件付きルール（F1/F2/F3）を自動適用 | `readTools.ts` |
| `getUnassignedPositions` | 内部採番コード（_pos_…）のままのポジション一覧 | `readTools.ts` |
| `show_org_members` | 組織メンバーをウィジェットで表示（render） | `renderTools.ts` |
| `getOrgTree` | 組織ツリーをウィジェットで表示（render） | `renderTools.ts` |

### 1.2 UI ナビゲーション（navigate — データ変更なし）

> Fast Path でも安全に実行できる。ドメインデータを変更しない。

| Tool名 | 説明 | 登録ファイル |
|---|---|---|
| `ui_show_person` | 人物を検索してキャンバス上にフォーカス（検索+表示を1ステップ） | `navigateTools.ts` |
| `ui_focus_row` | rowId を指定してカードにフォーカス | `navigateTools.ts` |
| `ui_open_operation` | 操作フォームを開き値を事前入力。ユーザーが送信。**operationId 一覧は `G4-08` 参照** | `navigateTools.ts` |
| `ui_get_form_state` | 現在開いているフォームの状態（操作種別・入力値）を返す（read） | `navigateTools.ts` |
| `ui_suggest_form_field` | 開いているフォームのフィールドに値をセット。onFieldChange 連動も走る | `navigateTools.ts` |

### 1.3 書き込み — 即時実行（execute）

> `appService.executeOperation()` 経由で即実行し、Undo スタックに積まれる。

| Tool名 | 操作 | 登録ファイル |
|---|---|---|
| `undo` | 直前の操作を取り消す | `operationTools.ts` |
| `propose_field_edit` | 1行・1フィールドを変更 | `operationTools.ts` |
| `propose_create_position` | 空席ポジションを作成 | `operationTools.ts` |
| `propose_assign_person` | 空席ポジションに人を配属 | `operationTools.ts` |
| `propose_change_position` | 役職名を変更（新ポジション作成＋旧ポジション削除） | `operationTools.ts` |
| `propose_set_manager_position` | 上司ポジションコードを設定（managerName 自動入力） | `operationTools.ts` |
| `propose_assign_position_codes` | 内部採番コード（_pos_…）に外部コード（P + 8桁）を割当。managerPositionCode も連動更新 | `operationTools.ts` |
| `propose_leave_of_absence` | 指定行を休職させる（leaveOfAbsenceSign = "1"） | `operationTools.ts` |
| `propose_return_from_leave` | 指定行を復職させる（leaveOfAbsenceSign クリア） | `operationTools.ts` |
| `propose_concurrent_add` | 本務行に社内兼務を追加（コピー新規作成） | `operationTools.ts` |
| `propose_concurrent_release` | 兼務行を解除・削除 | `operationTools.ts` |
| `propose_org_restructure` | 組織コード変更（組改）を一括適用 | `operationTools.ts` |
| `propose_job_type_change` | ジョブファミリー・ジョブタイプを変更（payGrade 自動導出） | `operationTools.ts` |

### 1.4 書き込み — 確認フロー（confirm — DryRun → ユーザー確認 → 実行）

> `buildProposal`（DryRun）→ diff-preview ウィジェット表示 → `executeOnApprove`。

| Tool名 | 操作 | 登録ファイル |
|---|---|---|
| `propose_bulk_transfer` | 組織全員を別組織に一括異動 | `operationTools.ts` |
| `propose_transfer` | 指定した人物を別組織に異動。transferReason を確認UIで入力 | `operationTools.ts` |
| `propose_bulk_set_field` | **複数行・同一フィールドを一括設定**（`getValidationDiagnosis` の rowIds と組み合わせる） | `operationTools.ts` |
| `propose_promotion` | 昇格。positionBand を指定するだけで band / payGrade が自動導出 | `operationTools.ts` |
| `propose_demotion` | 降格。降格理由を確認UIで入力 | `operationTools.ts` |
| `propose_re_derive_manager_names` | 全行の managerName を在籍者の現姓名に一括再導出 | `operationTools.ts` |
| `propose_re_derive_org_sub_fields` | 全行の組織サブフィールドを orgMaster から一括再導出 | `operationTools.ts` |
| `propose_secondment_transfer` | 本務出向中の従業員を出向先に転籍（出向解除 → 移籍 の2ステップ） | `operationTools.ts` |

### 1.5 UI直結ボタン（AIを通らない直接操作）

| ボタン | 操作 | 備考 |
|---|---|---|
| 🔢 コード割当 | `PositionCodeAssignmentDialog` を開く | 3ステップ: 一覧コピー → 貼り付け → 確定 |
| ↻上司姓名 | `reDeriveManagerNames()` 一括 | シンプルな一括操作はボタンで完結 |
| ↻組織 | `reDeriveOrgSubFields()` 一括 | 同上 |

---

## 2. ツール追加の手順

新しい業務操作 `X` を AI に公開するときの手順:

1. `packages/domain/src/commands/defs/` に `EditOperation`（または `MultiRowOperationDef`）を追加
2. `apps/web/src/application/aiTools/write.ts` に `executeX()` 関数を追加（`appService.executeOperation()` 経由）
3. `apps/web/src/infrastructure/ai/toolRegistry/operationTools.ts` に `ExecuteEntry` または `ConfirmEntry` を追加
4. `specs/G4-ai/08-tool-reference.md` に仕様を追記

> **注意**: ロジックを重複して書かない。`aiTools/write.ts` は `appService` メソッドへの委譲のみ。

---

## 3. Tool 説明文の指針

```typescript
// operationTools.ts への追加例（execute 種別）
{
  kind: 'execute',
  definition: {
    type: 'function',
    function: {
      name: 'propose_xxx',
      description:
        '何をする操作か（即時実行）。' +
        '実行前に findPersons で rowId を、getFieldOptions で有効な値を確認すること。' +
        '業務ルール: ...',
      parameters: {
        type: 'object',
        required: ['rowId'],
        properties: {
          rowId: { type: 'number', description: '対象行の rowId（findPersons の positions[].rowId）' },
        },
      },
    },
  },
  execute: args => aiTools.executeXxx(args.rowId as number),
},
```

---

## 4. 未確認事項

- [ ] AI が実行できる操作の権限範囲（どこまで AI に任せるか）
- [ ] AI の操作も Undo スタックに積まれるか（現状: 積まれる）
- [ ] positionOps（空席ポジション系の操作）を AI から呼べるようにする（CLAUDE.md 既知未着手事項）
