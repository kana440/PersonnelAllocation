# CLAUDE.md — packages/domain

このパッケージはドメイン層。**外部依存ゼロ（Zod のみ可）**。
React・appService・useStore を import してはいけない。

## 型チェック

```bash
cd packages/domain && npx tsc --noEmit
# または root から:
npm run typecheck --workspace=packages/domain
```

---

## 業務操作の追加（packages/domain 内の手順）

新しい業務操作を追加するときは **必ずこの順序**で：

1. `src/patterns/editPatterns.ts` — `EditPattern` に新ラベルを追加
2. `src/commands/handlers/` — `EditCommand` を実装
3. `src/validation/` — **バリデーションに検出条件を追加**（リストア保証の維持・必須）
4. `src/commands/defs/` — `OperationDef` を追加して `ALL_OPERATION_DEFS` に登録
5. 複数行にまたがる場合は `src/commands/scenarios.ts` に `EditScenario` を追加

手順 3 を省略すると Excel 後方互換のリストア保証が崩れる。

### EditCommand の実装テンプレート

```typescript
// src/commands/handlers/myOp.ts
export class MyOperation implements EditCommand {
  readonly kind = 'myOperation'
  constructor(private readonly rowId: number) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail('対象行が見つかりません')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const updated = ctx.allocationList.map(r =>
      r.rowId === this.rowId ? { ...r, /* 変更 */ } : r
    )
    return { updatedList: updated, label: '説明' }
  }
}
```

既存の実装例: `src/commands/handlers/positionOps.ts`（4種）、`directEdit.ts`、`moveRowsToOrg.ts`

---

## 値制約・選択肢の追加（FIELD_CONSTRAINTS）

`src/fieldConstraints.ts` が許容値制約の**単一定義ソース**。
バリデーション（D2系・C4系・F系）とUI選択肢絞り込みの両方が自動導出される。

```typescript
// 推奨値（選択肢に表示するがバリデーションなし）
{ kind: 'suggestion', field: 'transferReason',
  source: cl => cl.transferReasons.map(e => e.label) }

// 制約（選択肢 + リスト外はエラー）
{ kind: 'constraint', field: 'officialPositionCode',
  source: cl => cl.officialPositions.map(e => e.label),
  message: _ => '役職は有効な選択肢から選択してください' }

// 条件付き制約
{ kind: 'constraint', field: 'band',
  when: (row, cl) => !!cl.employmentTypes.find(e => e.label === row.employmentType)?.isOutsourceAcceptance,
  source: cl => cl.jobLevels.filter(e => e.isOutsourceAcceptance).map(e => e.label),
  message: _ => 'バンドは雇用タイプに対応する選択肢から選択してください' }
```

**W系（ワーニング）は FIELD_CONSTRAINTS に乗らない**。`src/validation/validateGlobalConsistency.ts` にカスタム関数として実装し `level: 'warning'` で返す。

---

## やってはいけないこと（domain 内）

- `appService` / `useStore` / React を import する
- `allocationList` を直接 `push` / `splice` する
- `prevXxx` フィールドを操作中に書き換える
- バリデーションとオプション絞り込みを別々に実装する（`FIELD_CONSTRAINTS` を使う）
