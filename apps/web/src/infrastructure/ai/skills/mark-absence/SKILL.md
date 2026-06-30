---
name: mark-absence
description: 退職・移籍予定者を「4/1不在」として登録するとき。「〇〇さんを退職にして」「移籍として登録して」「4/1不在ボックスに入れて」など。
risk: low
requires-confirmation: false
allowed-tools: findPersons propose_mark_absent getValidationDiagnosis undo
metadata:
  display-name: 4/1不在登録
  status: active
---

# 4/1 不在登録

3月末退職・4/1付移籍の予定者を不在ボックスに登録する。組織ツリーから除外され、不在パネルで一覧管理できる。

## 手順

1. **対象者を特定する**
   - `findPersons` で名前を検索して rowId を取得する
   - ピン留め情報に rowId が含まれる場合は findPersons を省略してよい

2. **種別を判断してユーザーに確認する**
   - 「退職」: 3月末までに退職・解任済み
   - 「移籍」: 4/1付で他社へ移籍（在籍は継続だが移動）
   - 種別が不明な場合はユーザーに確認する。推測で決めない

3. **`propose_mark_absent` で登録する**（即時実行）
   - `rowId`, `absenceType`（'退職' または '移籍'）, `memo`（任意）を渡す
   - 実行後、その行は組織ツリーから消えて不在パネルに表示される

4. **部下がいる場合は後続対処を案内する**
   - `getValidationDiagnosis` を呼んで「退職予定者の部下が存在する」警告を確認
   - 警告があれば「〇〇さんの部下 N 名の上司が未設定です。移動先を指定してください」と案内
   - 部下の上司変更は `propose_set_manager_position` で対応（このスキルの範囲外）

## 使用ツール

**使用するツール**: `findPersons`（対象特定）, `propose_mark_absent`（登録）, `getValidationDiagnosis`（部下確認）

**禁止**:
- `propose_field_edit` で transferReason を直接設定すること（propose_mark_absent を使うこと）
- 休職（`propose_leave_of_absence`）と混同しないこと。退職・移籍は別操作

## 注意

- **休職とは異なる**: 休職者は組織に残ったまま。不在登録（退職・移籍）はツリーから除外される
- **Undo で元に戻せる**: 誤登録の場合は `undo` を呼ぶ
- **UI からも操作可能**: キャンバスの「4/1不在」ボタンを押してパネルを表示し、カードをドラッグして登録することもできる
- **上司不明警告は自動修正しない**: `getValidationDiagnosis` で「上司ポジションコードがこのファイルに存在しません」が出ても、ファイル分割運用では正常なケース。自動で managerPositionCode を変更しないこと
