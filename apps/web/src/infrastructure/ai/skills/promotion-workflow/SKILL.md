---
name: promotion-workflow
description: 従業員の昇格を処理するとき。ポジションバンド変更・役職変更を含む昇格発令に使う。
risk: medium
requires-confirmation: true
allowed-tools: findPersons getPromotionBandInfo computePromotionStepDiff propose_promotion getValidationDiagnosis undo
metadata:
  display-name: 昇格ウィザード
  status: active
---

# 昇格ウィザード

昇格対象者のポジションバンドを変更する。band / payGrade は自動導出される。

## 昇格フローの仕組み

```
newPositionBand（主操作）
  ↓ 雇用タイプが社員なら
band = positionBand（自動連動）
  ↓
jobLevels[band].promotionDemotionBand × jobType.compensationCategory
  ↓
payGrade（自動導出）
  ↓
promotionSign / payGradeChangeSign（自動導出）
```

ただし band・payGrade はユーザーが手動上書きすることもある（自動導出はあくまで初期値）。

DryRun の結果が確認UIに表示されるので、ユーザーが承認前に全変更内容を確認できる。

## 手順

### バンドが指定されていない場合（「昇格させて」のみ）

1. `findPersons` で対象者の rowId を取得する
2. `getPromotionBandInfo({ rowId })` を呼ぶ
   - `oneLevelUp` が通常の昇格候補（1段階上のバンド）
   - 複数ある場合はユーザーに選択を求める
3. 1段階上のバンドを `newPositionBand` として `propose_promotion` を呼ぶ

### バンドが指定されている場合

1. `findPersons` で rowId を取得する
2. `computePromotionStepDiff({ rowId, newPositionBand })` でステップ差を確認する
   - **stepDiff === 1**: そのまま `propose_promotion` を呼ぶ
   - **stepDiff >= 2**: ユーザーに「N段階の大きな昇格ですが問題ありませんか？」と確認してから進む
   - **stepDiff <= 0**: 昇格にならない（バンドが下がる or 変わらない）のでユーザーに確認する
3. 確認が取れたら `propose_promotion` を呼ぶ

## propose_promotion の引数

```
rowId:                    number   必須（findPersons の positions[].rowId）
newPositionBand:          string   必須（getPromotionBandInfo.oneLevelUp から選ぶのが基本）
newOfficialPositionCode?: string   役職コードが変わる場合のみ
newLocalJobTitle?:        string   役職名（フリーテキスト）が変わる場合のみ
```

band / payGrade は指定不要（自動導出される）。

## 確認UIについて

- DryRun 結果として positionBand・band・payGrade の before/after を表示する
- 2段階以上の昇格の場合、確認UIのラベルに「N段階変更」の注意が自動表示される
- ユーザーが band や payGrade を手動上書きしている場合、その値が使われる

## 注意

- `propose_promotion` は findPersons の事前呼び出し不要。フィルタ（name / subtreeOrgCode）でも指定できる
- band・payGrade を propose_field_edit で個別に変更してはいけない（自動導出を妨げる）
- 役職コード（officialPositionCode）と役職名（localJobTitle）はセットで変更すること
- バンドを指定せず「昇格させて」と言われたら必ず `getPromotionBandInfo` を呼んで 1段上を確認する
