---
name: query-changes
description: 変更内容を照会するとき。「どんな変更がある？」「異動した人を教えて」「変更の概要を見せて」など、変更一覧・種別・件数の確認に使う。
risk: low
requires-confirmation: false
allowed-tools: getReviewSummary getChangedRows findPersons getPersonsDetail
metadata:
  display-name: 変更照会
  status: active
---

# 変更照会

変更内容を段階的に照会する。まずサマリーで全体把握し、必要に応じて詳細へ掘り下げる。

## 手順

1. **まず `getReviewSummary` を呼ぶ**（引数なし・常に安全）
   - 変更件数・種別・エラー件数のサマリーを取得
   - 「変更の概要は？」「何件変更がある？」はこれで答えられる
   - `byKind` は `[{ code, label, count }]`（多い順）。変更種別ごとの件数が入る

2. **種別・人物・組織で絞り込むなら `getChangedRows`**
   - `kinds` で変更種別を絞り込む（`getReviewSummary` の `byKind[].code` をそのまま使う）
   - `name`・`userId`・`subtreeOrgCode` で人物・組織を絞り込める
   - `limit` / `offset` でページング。`truncated` が true なら続きがある
   - 戻り値に `grade`・`position` の before/after が含まれる

3. **個人の詳細（全フィールド）が必要なら `getPersonsDetail`**
   - `getChangedRows` の `items[].rowId` を配列で渡す

## 使用ツール

**使用するツール**: `getReviewSummary`, `getChangedRows`, `findPersons`, `getPersonsDetail`

**禁止**: `propose_*` 系（照会モードでは変更操作を行わない）

## 注意

- `getChangedRows` は limit/offset でページング可能。`truncated: true` のときは「全 N 件のうち M 件を表示」と案内する
- `getChangedRows` の `subtreeOrgCode` に組織コードを指定すると配下全組織の変更行を一括取得できる
- 変更種別ラベルはそのままユーザーに表示してよい
