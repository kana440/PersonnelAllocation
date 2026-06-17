---
name: cascading-transfer
description: 複数人の連鎖異動（玉突き人事）を処理するとき。上司交代・部署再編など、順序が重要な複数人の異動に使う。
risk: medium
requires-confirmation: true
allowed-tools: findPersons findOrgs propose_transfer getReviewSummary undo
metadata:
  display-name: 玉突き人事ウィザード
  status: active
---

# 玉突き人事ウィザード

複数人の異動を連鎖的に処理する。上流から順に確認を取りながら1人ずつ実行する。

## 手順

1. `findPersons` で対象者全員の現在の組織・ポジションを確認する（情報把握のみ）
2. 依存関係（誰が誰のポジションを引き継ぐか）を整理してユーザーに提示する
3. 上流から順に `propose_transfer` で1人ずつ異動提案する（承認を得てから次へ）
   - `propose_transfer` は `rowId` または `name` で対象を指定できる（findPersons の事前呼び出し不要）
   - 確認UIに異動事由フォームが表示される。改組なら "分掌異動（改組）"、人事異動なら "分掌異動" を提案値として渡す
4. 全員完了後に `getReviewSummary` でサマリーを確認する

## 使用ツール

**使用するツール**: `findPersons`（情報確認）, `findOrgs`（組織コード取得）, `propose_transfer`, `getReviewSummary`

**禁止**: `propose_bulk_transfer`（玉突きでは処理順序の制御が必要なため個別処理すること）

## 注意

- propose_transfer は name や subtreeOrgCode フィルタを直接受け付けるため、対象を特定する目的での findPersons は省略できる
- 「承認を得てから次へ」を厳守する。全員まとめて提案しない
