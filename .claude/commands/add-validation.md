specs/G2-domain/02-validation-rules.md を読んで、指定されたバリデーションルールを実装してください。

## 引数
$ARGUMENTS
（例: "V04 V05 V50" → 実装するルール番号）

## 手順

### 1. コンテキスト読み込み
1. CLAUDE.md を読む
2. specs/00-cross-cutting.md の「B. バリデーションルールを追加・変更するとき」を読む
3. specs/G2-domain/02-validation-rules.md を読む
4. packages/domain/src/validation/validateRow.ts を読む

### 2. 影響範囲の確認（B 列の「必須」項目）
5. 実装するルールが AI プロンプトに記載が必要か確認（specs/G4-ai/02-system-prompt-rules.md）

### 3. 実装
6. 引数で指定されたルール番号のバリデーションを実装する
7. 既存の `validateXxx` 関数パターンに合わせて純粋関数で実装する
8. `validateRow()` の return 配列に追加する
9. `cd apps/web && npx tsc --noEmit` を実行し、型エラーがあれば修正する

### 4. ドキュメント更新
10. specs/G2-domain/02-validation-rules.md の該当ルールの実装状況を ✗ → ✓ に更新する
11. 重要なルールは specs/G4-ai/02-system-prompt-rules.md にも追記する

## 実装パターン（既存に合わせること）
```typescript
function validateXxx(row: AllocationRow, changes?: RowChanges): ValidationIssue[] {
  if (条件) return []
  return [{ field: 'fieldName', level: 'warning', message: 'メッセージ' }]
}
// → validateRow() の return [..., ...validateXxx(row, changes)] に追加
```
