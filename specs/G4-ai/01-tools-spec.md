# G4-01 AI Tools 設計仕様

> **目的**: AI（Claude）がこのアプリから呼べる Tools の設計・説明プロンプトを定義する。
> 実装基盤: `src/application/aiTools.ts`
>
> **原則**:
> - Toolの説明文は「AIが使い方を誤らない」精度で書く
> - 読み取り専用ツールと書き込みツールを明確に分ける
> - 業務ルール（G2-domain）を Tool の説明に反映する

---

## 1. 実装済み Tools（read-only）

| Tool名 | 説明 | 実装状況 |
|---|---|---|
| `getReviewSummary` | 変更種別ごとの件数 + バリデーション問題件数 | ✓ |
| `getChangedPersons` | 変更ありの人物リスト。kindsでフィルタ可能 | ✓ |
| `getValidationIssues` | バリデーション問題の一覧。error/warningでフィルタ | ✓ |

---

## 2. 追加予定 Tools

### 2.1 フィールド検索・照会

| Tool名 | 入力 | 出力 | 優先度 |
|---|---|---|---|
| `getPersonDetail` | userId or rowId | 一人分の全フィールド（before/after） | 🔴 高 |
| `getOrgMembers` | departmentCode | その組織の全メンバー一覧 | 🟡 中 |
| `getCodeListValues` | codeListKey | 有効値一覧 | 🟡 中 |

### 2.2 書き込み Tools（IDomainOperation 経由）

> 書き込みToolは必ず `appService.executeOperation(new XxxOperation(...))` 経由で実装する。
> 直接 allocationList を変更するToolは書かない。

| Tool名 | 操作 | OperationClass | 優先度 |
|---|---|---|---|
| `setTransferReason` | 異動事由を設定 | `DirectEditOperation` | 🔴 高 |
| `setDepartmentCode` | 組織コードを変更（異動） | `MoveRowsToOrgOperation` | 🔴 高 |
| `setBandAndPosition` | バンド変更 + 新ポジション作成 | 新規作成必要 | 🟡 中 |
| `setManagerPosition` | 上司ポジションコードを設定 | `DirectEditOperation` | 🟡 中 |
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
    - 有効値はgetCodeListValues('transferReasons')で取得できます
    - Excel保存時にそのまま出力されます
    
    使用タイミング:
    - getValidationIssuesで transferReason の warning が出ている行
    - getChangedPersonsで kinds=['transfer'] の行にまとめて設定する場合
  `,
  input_schema: {
    type: 'object',
    properties: {
      rowId: { type: 'number', description: '対象行のrowId' },
      value: { type: 'string', description: '異動事由の値（codeListの有効値）' },
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
