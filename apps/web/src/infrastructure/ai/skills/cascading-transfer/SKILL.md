---
name: cascading-transfer
description: 複数人の連鎖異動（玉突き人事）を処理するとき。上司交代・部署再編など、順序が重要な複数人の異動に使う。
allowed-tools: findPersons findOrgs propose_transfer getReviewSummary undo
metadata:
  display-name: 玉突き人事ウィザード
  status: active
---

# 玉突き人事ウィザード

複数人の異動を連鎖的に処理する。上流から順に確認を取りながら1人ずつ実行する。

## 手順

1. `findPersons` で対象者全員の現在の組織・ポジションを確認する
2. 依存関係（誰が誰のポジションを引き継ぐか）を整理してユーザーに提示する
3. 上流から順に `propose_transfer` で1人ずつ異動提案する（承認を得てから次へ）
4. 全員完了後に `getReviewSummary` でサマリーを確認する

## 使用ツール

**使用するツール**: `findPersons`, `findOrgs`, `propose_transfer`, `getReviewSummary`

**禁止**: `propose_bulk_transfer`（玉突きでは処理順序の制御が必要なため個別処理すること）

## 注意

- 必ず上流から（空きポジションができる人から）処理する
- 途中でエラーが出たら `undo` で取り消してから再試行する
- 各人の確認を必ず得てから次の人に進む
