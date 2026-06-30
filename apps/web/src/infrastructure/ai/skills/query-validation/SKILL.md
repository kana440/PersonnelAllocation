---
name: query-validation
description: バリデーション問題を確認・診断するとき。「エラーを教えて」「問題がある行を確認して」「バリデーションを確認して」など。
risk: low
requires-confirmation: false
allowed-tools: getValidationDiagnosis getValidationIssues getFieldOptions findPersons getPersonsDetail
metadata:
  display-name: バリデーション照会
  status: active
---

# バリデーション照会

バリデーション問題を段階的に確認し、修正方法を提案する。修正操作は行わない。

## 手順

1. **まず `getValidationDiagnosis` を呼ぶ**（引数なし・常に安全）
   - フィールド別に集計された問題と `suggestedTool`/`suggestedAction` を返す
   - 「バリデーションを確認して」「エラーがある？」はこれで答えられる
   - `suggestedTool` が入っていれば修正方法をユーザーに提案する
   - `byField[].rowIds` で問題のある行の rowId を特定できる

2. **個別の問題を確認したいなら `getValidationIssues`**
   - `level: 'error'` でエラーのみ、`level: 'warning'` で警告のみ絞り込める
   - `rowId`・`field`・`message` が1件ずつ取れる
   - `getValidationDiagnosis` の集計では不足するときに使う

3. **フィールドの有効な値を確認するなら `getFieldOptions`**
   - 「何を設定すればいいか」のオプション確認に使う
   - バリデーションエラーの `rowId` と `field` を渡す
   - 設定可能な選択肢を返すので、修正方法の提案に使える

## 使用ツール

**使用するツール**: `getValidationDiagnosis`, `getValidationIssues`, `getFieldOptions`, `findPersons`, `getPersonsDetail`

**禁止**: `propose_*` 系（照会モードでは変更操作を行わない）

## 注意

- 修正提案はするが実際の修正操作は行わない（変更操作は Structured Path のスキルに委ねる）
- エラーと警告の両方を確認し、エラーを優先して報告する
- `getValidationDiagnosis` の `suggestedAction` がある場合は、その内容をそのままユーザーに伝えてよい

### 自動修正してはいけない警告

以下の警告は正常な運用状態を示す場合があるため、自動修正（propose_set_manager_position 等の実行）を行わない。

| 警告 | 理由 | 対処 |
|---|---|---|
| 「上司ポジションコードがこのファイルに存在しません」 | Excel が組織単位で分割配布されており、上司が別ファイルにいる可能性がある | ユーザーに説明するだけ。マージ後に解決される |

この警告がある行のカードには `↑ 別組織` (青) または `↑ 上司不明⚠` (黄) が表示されている。  
`↑ 上司不明⚠` (全ファイルにも上司行が存在しない) の場合のみ、上司の変更を提案してよい。
