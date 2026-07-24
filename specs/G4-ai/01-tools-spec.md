# G4-01 AI Tools 設計仕様（ツール追加の手順）

> **目的**: 新しい業務操作を AI ツールとして公開するときの手順を定義する。
> ツール一覧・引数・戻り値の確定仕様は `specs/G4-ai/08-tool-reference.md` を参照（重複掲載しない）。

---

## ツール追加の手順

新しい業務操作 `X` を AI に公開するときの手順:

1. `packages/domain/src/commands/defs/` に `EditOperation`（または `MultiRowOperationDef`）を追加
2. `apps/web/src/application/aiTools/write.ts` に `executeX()` 関数を追加（`appService.executeOperation()` 経由）
3. `apps/web/src/infrastructure/ai/toolRegistry/operationTools.ts` に `ExecuteEntry` または `ConfirmEntry` を追加
4. `specs/G4-ai/08-tool-reference.md` に仕様を追記

> **注意**: ロジックを重複して書かない。`aiTools/write.ts` は `appService` メソッドへの委譲のみ。

---

## Tool 説明文の指針

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

## 未確認事項

- [ ] AI が実行できる操作の権限範囲（どこまで AI に任せるか）
- [ ] positionOps（空席ポジション系の操作）を AI から呼べるようにする（CLAUDE.md 既知未着手事項）
