# /size-check — 大きなコンポーネントを検出

200行を超えるコンポーネントファイルを一覧表示し、分割が推奨されるものを教える。

```bash
find src/components src/application -name "*.tsx" -o -name "*.ts" | \
  xargs wc -l | sort -rn | head -20
```

200行超のファイルについて、CLAUDE.md のフォルダ構成パターンに従ってどう分割できるか提案する。
ただし、実際にリファクタリングするかどうかはユーザーの判断を仰ぐ。
