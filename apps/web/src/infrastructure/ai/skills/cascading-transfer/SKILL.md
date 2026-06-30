---
name: cascading-transfer
description: 空きポジション経由で複数人の異動を順序制御しながら処理するとき。上司交代・部署再編など、誰かが空けたポジションに別の人が入る連鎖人事に使う。
risk: medium
requires-confirmation: true
allowed-tools: findPersons findOrgs propose_transfer getReviewSummary undo
metadata:
  display-name: 空きポジション経由の引き継ぎ
  status: active
---

# 空きポジション経由の引き継ぎ

上位ポジションが空いた後、そこに誰かが入り、さらに後任が…という連鎖を順序通りに処理する。
2人の場合でも、「Aが抜けた穴にBが入る」のように順序が重要なときに使う。

## 手順

1. `findPersons` で対象者の現在の組織・ポジションを確認する
2. 引き継ぎの依存関係（誰が誰のポジションを空け、誰がそこに入るか）を整理してユーザーに提示する
3. **上流から順に** `propose_transfer` で1人ずつ異動提案する（承認を得てから次へ）
   - 空けたポジションに後任を入れるときは `propose_assign_person` を使う
   - 確認UIに異動事由フォームが表示される。改組なら "分掌異動（改組）"、人事異動なら "分掌異動" を提案値として渡す
4. 全員完了後に `getReviewSummary` でサマリーを確認する

## 使用ツール

**使用するツール**: `findPersons`（情報確認）, `findOrgs`（組織コード取得）, `propose_transfer`, `getReviewSummary`

**禁止**: `propose_bulk_transfer`（処理順序の制御が必要なため個別処理すること）

## 注意

- `propose_transfer` は `name` や `subtreeOrgCode` フィルタを直接受け付けるため、対象を特定する目的での `findPersons` は省略できる
- 「承認を得てから次へ」を厳守する。全員まとめて提案しない
- 上位者を先に動かさないと下位者のポジションが埋まらない
