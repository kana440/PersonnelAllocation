# G4-01 AI Tools 設計仕様

> **目的**: AI（Claude）がこのアプリから呼べる Tools の設計・説明プロンプトを定義する。
> 実装基盤: `src/application/aiTools.ts`
>
> **原則**:
> - Toolの説明文は「AIが使い方を誤らない」精度で書く
> - 読み取り専用ツールと書き込みツールを明確に分ける
> - 業務ルール（G2-domain）を Tool の説明に反映する

---

## 1. 実装済み Tools

### 1.1 読み取り専用（read / render）

| Tool名 | 説明 | 実装状況 |
|---|---|---|
| `getReviewSummary` | 変更種別ごとの件数 + バリデーション問題件数 | ✓ |
| `getValidationDiagnosis` | 問題をフィールド別・修正方法別に集計。rowIds 付き。**操作後に優先使用** | ✓ |
| `getChangedPersons` | 変更ありの人物リスト。kindsでフィルタ可能 | ✓ |
| `getValidationIssues` | バリデーション問題の詳細一覧（getValidationDiagnosis の下位版） | ✓ |
| `findPersons` / `findOrgs` | 氏名・組織名のあいまい検索 | ✓ |
| `getPersonRows` / `getRow` | rowId を指定して行データ取得 | ✓ |
| `getOrgMembers` / `show_org_members` | 組織メンバー一覧（text / widget） | ✓ |
| `getFieldOptions` | 指定行・フィールドの有効選択肢を返す。FIELD_CONSTRAINTS 条件付きルール（F1/F2/F3）を自動適用。自己修復時の値確認に使う | ✓ |

### 1.2 書き込み（confirm — ユーザー確認後に実行）

> 書き込みToolは必ず `appService.executeOperation()` または `appService.saveRow()` 経由。
> ユーザーへの確認フローは toolRegistry.ts の `buildProposal` → `executeOnApprove` で実装。
> Widget はすべて既存の `diff-preview` を再利用。

書き込みツールの戻り値は `AIOperationResult` 型（`src/application/aiTools.ts` で定義）。
操作成功時は `{ ok: true, postValidation: Array<{ rowId, issues }> }` を返す。
`postValidation` は変更された行のうちバリデーション問題がある行のみ含む（問題なければ空配列）。

| Tool名 | 操作 | 実装状況 |
|---|---|---|
| `propose_bulk_transfer` | 組織全員を別組織に一括異動 | ✓ |
| `propose_transfer_person` | 一人を別組織に異動 | ✓ |
| `propose_field_edit` | 1行・1フィールドを変更 | ✓ |
| `propose_bulk_set_field` | **複数行・同一フィールドを一括設定**（getValidationDiagnosis の rowIds と組み合わせる） | ✓ |
| `propose_create_position` | 空席ポジションを作成 | ✓ |
| `propose_assign_person` | 人をポジションに配属 | ✓ |
| `propose_set_manager_position` | 上司ポジションコードを設定（managerName 自動入力） | ✓ |
| `propose_re_derive_manager_names` | 全行の managerName を在籍者の現姓名に一括再導出 | ✓ |
| `propose_re_derive_org_sub_fields` | 全行の組織サブフィールドを orgMaster から一括再導出 | ✓ |
| `propose_assign_position_codes` | 内部採番コード（_pos_…）に外部コード（P\d{8}）を割当。managerPositionCode も連動更新 | ✓ |

### 1.3 読み取り（read）追加分

| Tool名 | 説明 | 実装状況 |
|---|---|---|
| `getUnassignedPositions` | 内部採番コード（_pos_…）のままのポジション一覧。propose_assign_position_codes と組み合わせる | ✓ |

### 1.4 UI直結ボタン（AIを通らない直接操作）

| ボタン | 操作 | 備考 |
|---|---|---|
| 🔢 コード割当 | `PositionCodeAssignmentDialog` を開く | 3ステップ: 一覧コピー → 貼り付け → 確定 |
| ↻上司姓名 | `reDeriveManagerNames()` 一括 | シンプルな一括操作はボタンで完結 |
| ↻組織 | `reDeriveOrgSubFields()` 一括 | 同上 |

---

## 2. 追加予定 Tools

### 2.1 フィールド検索・照会

| Tool名 | 入力 | 出力 | 優先度 |
|---|---|---|---|
| `getPersonDetail` | userId or rowId | 一人分の全フィールド（before/after） | 🔴 高 |
| `getOrgMembers` | departmentCode | その組織の全メンバー一覧 | 🟡 中 |
| `getMasterValues` | masterKey（`AllCodeLists` のプロパティ名） | 有効値一覧 | 🟡 中 |

### 2.2 書き込み Tools（EditCommand 経由）

| Tool名 | 操作 | OperationClass | 優先度 |
|---|---|---|---|
| `setTransferReason` | 異動事由を設定 | `DirectEditOperation` | 🔴 高 |
| `setDepartmentCode` | 組織コードを変更（異動） | `MoveRowsToOrgOperation` | 🔴 高 |
| `setBandAndPosition` | バンド変更 + 新ポジション作成 | 新規作成必要 | 🟡 中 |
| `bulkSetTransferReason` | 複数人の異動事由を一括設定 | `DirectEditOperation` x N | 🟢 低 |

---

## 3. Tool 説明文テンプレート

```typescript
// aiTools.ts への追加例
{
  name: 'setTransferReason',
  description: `
    指定した行（人）の異動事由（transferReason）を設定します。
    
    業務ルール:
    - 異動（transfer）が検出された行には必ず設定してください
    - 有効値はgetMasterValues('transferReasons')で取得できます
    - Excel保存時にそのまま出力されます
    
    使用タイミング:
    - getValidationIssuesで transferReason の warning が出ている行
    - getChangedPersonsで kinds=['transfer'] の行にまとめて設定する場合
  `,
  input_schema: {
    type: 'object',
    properties: {
      rowId: { type: 'number', description: '対象行のrowId' },
      value: { type: 'string', description: '異動事由の値（マスタの有効値）' },
    },
    required: ['rowId', 'value'],
  },
}
```

---

## 4. AI ウィジェット設計（TODO）

❓ **業務確認待ち**: AIチャット内で使えるウィジェットの仕様。

- 変更サマリーのカード表示
- 問題一覧のクリックナビゲーション
- 「この問題を修正する」ボタン → Toolを自動実行

---

## 未確認事項

- [ ] AIが実行できる操作の権限範囲（どこまでAIに任せるか）
- [ ] AIの操作もUndoスタックに積まれるか（現状: 積まれる）
- [ ] バルク操作のトランザクション設計
