# /check — コード品質チェック

型チェックとアーキテクチャ境界チェックを実行し、問題があれば報告する。

```bash
npx tsc --noEmit && echo "✓ 型チェック OK" || echo "✗ 型エラーあり"
npx depcruise src --config .dependency-cruiser.js && echo "✓ アーキテクチャ境界 OK" || echo "✗ 境界違反あり"
```

問題があれば原因を調べて修正案を提示する。
