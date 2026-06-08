---
slug: promotion-workflow
name: 昇格ウィザード
description: 従業員の昇格を処理するとき。バンド・等級・役職の変更を含む昇格発令に使う。
status: active
---

# 昇格ウィザード

昇格対象者のバンド・等級・役職を変更し、昇格フラグを立てる。

## 手順

1. `findPersons` で対象者の現在のバンド・等級・役職を確認する
2. `getFieldOptions` で昇格後の有効な選択肢（`band`, `payGrade`, `officialPositionCode`）を確認する
3. 上位バンドの候補を1〜2段階提示してユーザーに選んでもらう
4. `propose_promotion` で昇格フラグ（`promotionSign`）を立てる
5. `propose_field_edit` でバンド・等級・役職を変更する（必要な場合）
6. `getValidationDiagnosis` で変更後のバリデーションを確認する

## 使用ツール

**使用するツール**: `findPersons`, `getFieldOptions`, `propose_promotion`, `propose_field_edit`

**任意**: `getValidationDiagnosis`（昇格後のバリデーション確認）

## 注意

- `propose_field_edit` を使う前に必ず `getFieldOptions` で有効な値を確認する（F1/F2 制約）
- バンドと等級の整合性を確認すること
- `promotionSign` を立てると同時に `band` / `payGrade` も変更することが多い
