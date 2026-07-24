# G4-09 AI テストシナリオ

対象ツール: 照会系（read/render）全10ツール + `propose_transfer` + `propose_promotion`

自動化された AI テストスイートは存在しないため、これは手動 QA の実施台帳として使う。

---

## 記法

- **入力**: ユーザーがチャットに入力するテキスト
- **期待ツール呼び出し**: LLMが呼ぶべきツールと引数（順序含む）
- **期待回答**: ユーザーへの返答内容（要素のみ。文言は問わない）
- **確認ポイント**: テストで特に確認したい挙動

## 共通確認ポイント（全シナリオ共通）

以下は個々のシナリオ表に重複記載せず、テスト実施時に横断で確認する:

- `name` / `subtreeOrgCode` / `rowIds` などのフィルタ引数だけで対象を一意に絞れる場合、
  `findPersons` / `findOrgs` の事前呼び出しを挟まず1ターンで確認UI（confirm）まで到達しているか
- ユーザーがキャンセルした場合に「ユーザーが操作を取り消しました」に類する応答が返るか
- `propose_*` 系の操作承認後、システムプロンプトの指示どおり `getValidationDiagnosis` が自動で呼ばれるか

---

## S-01: 変更サマリー照会

**入力**: `今どんな変更がある？`

**期待ツール呼び出し**:
```
getReviewSummary()
```

**期待回答**:
- 変更件数（changedRows）を述べる
- `byKind` の内容を種別ごとに列挙する（例: 「異動 10件、昇格 3件」）
- エラー・警告があれば件数を伝える
- 詳細を見たいか聞く（または getChangedRows へ誘導する）

**確認ポイント**:
- `byKind` が `Array<{code, label, count}>` で正しく表示されるか
- 件数0のとき「変更はありません」と言えるか

---

## S-02: 変更行の絞り込み照会

**入力**: `異動した人の一覧を見せて`

**期待ツール呼び出し**:
```
getReviewSummary()
→ getChangedRows({ kinds: ["transfer"] })
```

**期待回答**:
- 「〇〇さん（A部門 → B部門）」のような before/after 形式でリストアップ
- 件数が多い場合は `totalCount` と `truncated` を使って「全N件のうちM件を表示」と案内する

**確認ポイント**:
- `kinds` に渡すコードが `getReviewSummary.byKind[].code` と一致しているか（日本語コード）
- `truncated: true` のとき続きの案内が出るか

---

## S-03: 特定人物の変更確認

**入力**: `山田さんの変更内容を教えて`

**期待ツール呼び出し**:
```
getChangedRows({ name: "山田" })
```

**期待回答**:
- 山田さんの変更種別・変更内容（grade/position before/after）を伝える
- 山田という人が複数いる場合は「〇名いますが、どの山田さんですか」と確認する

**確認ポイント**:
- `getChangedRows` の `name` フィルタだけで返答できているか（共通確認ポイント参照）

---

## S-04: バリデーション診断

**入力**: `エラーがある行を確認して`

**期待ツール呼び出し**:
```
getValidationDiagnosis()
```

**期待回答**:
- フィールド別にエラー件数と修正方法 (`suggestedAction`) を伝える
- `suggestedTool` が設定されているフィールドは具体的な操作を提案する
- 問題がない場合は「エラーはありません」と伝える

**確認ポイント**:
- `getValidationIssues` を先に呼んでいないか（診断はまず `getValidationDiagnosis` が正しい）
- `byField[].rowIds` が含まれているか（後続操作に必要）

---

## S-05: 特定人物のバリデーション確認

**入力**: `田中太郎さんにエラーがある？`

**期待ツール呼び出し**:
```
getValidationIssues({ name: "田中太郎", level: "error" })
```

**期待回答**:
- 田中太郎さんのエラー一覧（field・message）を伝える
- エラーがない場合は「エラーはありません」

**確認ポイント**:
- name フィルタが部分一致で動作しているか（`findPersons` 経由を挟まないことは共通確認ポイント参照）

---

## S-06: 組織メンバー表示

**入力**: `営業部のメンバーを見せて`

**期待ツール呼び出し**:
```
findOrgs({ name: "営業部" })
→ show_org_members({ orgCode: "..." })
```

**期待回答**:
- ウィジェット（メンバー一覧）が表示される
- テキストで人数を述べる

**確認ポイント**:
- 組織名が一意でない場合、複数候補を提示して確認するか
- `subtreeOrgCode` を使うと配下含めた表示ができるか（`show_org_members({ subtreeOrgCode: "..." })`）

---

## T-01: 名前フィルタで異動提案（+ rowIds 直接指定バリエーション）

**前提**: 山田花子さんが営業一課に所属している

**入力**: `山田花子さんを営業二課に異動させて`

**期待ツール呼び出し**:
```
findOrgs({ name: "営業二課" })   ← targetOrgCode の取得
→ propose_transfer({
    name: "山田花子",
    targetOrgCode: "ORG-002",
    transferReason: "分掌異動"    ← 文脈から推測
  })
```

**期待する確認UI**:
- 「山田花子（営業一課 → 営業二課）」の diff-preview
- 異動事由フォームに「分掌異動」が初期値として入っている
- ユーザーが異動事由を変更できる

**承認後の期待回答**:
- 「山田花子さんを営業二課に異動しました。異動事由: 分掌異動」

**確認ポイント**:
- 確認UI に transferReason のフォームが表示されているか
- userInputs から実際の transferReason が反映されているか

**バリエーション（rowIds 直接指定）**: ユーザーがすでに `findPersons` で rowId=123 を把握している場合
（例: `rowId 123 の行を営業二課に移して`）は `propose_transfer({ rowIds: [123], targetOrgCode: "ORG-002" })`
となる。ピン留め情報や会話コンテキストから rowId を直接使えるか、targetOrgCode が不明な場合に
`findOrgs` を挟むかを確認する。

---

## T-02: 組織配下フィルタで一括異動（改組）

**前提**: 旧営業部（ORG-OLD）が廃止され、全員が新営業部（ORG-NEW）に移動する

**入力**: `旧営業部の全員を新営業部に移してください。改組です`

**期待ツール呼び出し**:
```
findOrgs({ name: "旧営業部" })   ← sourceOrgCode 確認
findOrgs({ name: "新営業部" })   ← targetOrgCode 確認
→ propose_transfer({
    subtreeOrgCode: "ORG-OLD",
    targetOrgCode: "ORG-NEW",
    transferReason: "分掌異動（改組）"   ← "改組" というキーワードから推測
  })
```

**期待する確認UI**:
- 旧営業部の全メンバーが diff-preview に表示される（複数行）
- 異動事由フォームに「分掌異動（改組）」が初期値

**確認ポイント**:
- `subtreeOrgCode` を使って配下含む全員が対象になっているか
- 「改組」という文脈を理解して `transferReason` を正しく推測しているか

---

## P-01: 基本的な昇格提案

**前提**: 山田太郎さん、現在 positionBand=M3, band=M3, payGrade=G5

**入力**: `山田太郎さんを M4 に昇格させて`

**期待ツール呼び出し**:
```
findPersons({ name: "山田太郎" })   ← rowId 取得
→ propose_promotion({
    rowId: 123,
    newPositionBand: "M4"
  })
```

**期待する確認UI（DryRun 結果）**:
```
山田太郎（〇〇部）
  positionBand: M3 → M4
  band:         M3 → M4  （社員のため連動）
  payGrade:     G5 → G7  （自動導出）
```

**承認後の期待回答**:
- 「山田太郎さんを昇格しました」
- diff（positionBand・band・payGrade の変化）を伝える

**確認ポイント**:
- DryRun で payGrade が正しく計算されているか（`promotionDemotionBand` 経由）
- band が positionBand に連動しているか（社員の場合）
- 確認UIに positionBand / band / payGrade の before/after が表示されているか

---

## P-02: 役職変更を含む昇格

**前提**: 鈴木一郎さん、現在 positionBand=M4, officialPositionCode=課長

**入力**: `鈴木一郎さんを M5 に昇格させて。役職は部長にして`

**期待ツール呼び出し**:
```
findPersons({ name: "鈴木一郎" })
→ getFieldOptions({ rowId: 123, field: "officialPositionCode" })   ← 任意
→ propose_promotion({
    rowId: 123,
    newPositionBand: "M5",
    newOfficialPositionCode: "部長",
    newLocalJobTitle: "部長"
  })
```

**期待する確認UI**:
```
鈴木一郎（〇〇部）
  positionBand:        M4 → M5
  band:                M4 → M5
  payGrade:            G7 → G9
  officialPositionCode: 課長 → 部長
```

**確認ポイント**:
- `newOfficialPositionCode` が before/after に表示されるか
- `getFieldOptions` で有効な役職コードを確認してから渡しているか（推奨）

---

## P-03: 社員以外（出向受入）の昇格

**前提**: 出向受入社員、現在 positionBand=M3, band=M3

**入力**: `（出向受入社員の rowId=456）を M4 に昇格させて`

**期待ツール呼び出し**:
```
propose_promotion({
    rowId: 456,
    newPositionBand: "M4"
  })
```

**期待する確認UI**:
```
（出向受入）
  positionBand: M3 → M4
  band:         M3  （変化なし — 社員でないため連動しない）
  payGrade:     —   （band が変わらないため変化なし）
```

**確認ポイント**:
- `isRegularEmployee` が false のとき band が連動しないか
- band 変化なし → payGrade も変化なし → DryRun に正しく反映されるか

---

## E-01: 見つからない系エラー（対象者 / 組織）

**バリエーションA — 対象者が見つからない**

**入力**: `田中一郎さんを営業二課に異動させて`（田中一郎が存在しない）

**期待ツール呼び出し**: `propose_transfer({ name: "田中一郎", targetOrgCode: "..." })` → エラー: "対象者が見つかりません"

**期待回答**: 「田中一郎さんが見つかりませんでした。氏名を確認してください」（findPersons で候補を探す提案をしてもよい）

**バリエーションB — 移動先組織が見つからない**

**入力**: `山田さんを第5営業部に移して`（第5営業部が存在しない）

**期待ツール呼び出し**: `findOrgs({ name: "第5営業部" })` → 結果なし

**期待回答**: 「第5営業部という組織が見つかりませんでした」（類似名称の組織があれば候補を提示する）

---

## E-02: 昇格後のバリデーション確認

**前提**: 昇格後にバリデーションエラーが発生する場合

**入力**: `山田さんを M4 に昇格させて`（承認後）

**期待ツール呼び出し**:
```
propose_promotion({ rowId: 123, newPositionBand: "M4" })
→ 承認
→ getValidationDiagnosis()   ← 操作後に自動で呼ぶ（システムプロンプトの指示）
```

**期待回答**:
- 昇格完了の報告
- バリデーション問題があれば件数と内容を伝える

---

## チェックリスト（テスト実施時に確認）

### propose_transfer
- [ ] T-01: name フィルタ → findPersons なしで confirm まで1ターン
- [ ] T-01: 確認UIに transferReason フォームが表示される
- [ ] T-01: 承認後に userInputs の transferReason が適用される
- [ ] T-01: rowIds 直接指定バリエーションでも1ターンで confirm に到達する
- [ ] T-02: subtreeOrgCode で配下全員が対象になる
- [ ] T-02: 「改組」の文脈で "分掌異動（改組）" が推測される

### propose_promotion
- [ ] P-01: newPositionBand → band / payGrade の DryRun 導出が確認UIに表示される
- [ ] P-01: `promotionDemotionBand` 経由で payGrade が正しく計算される
- [ ] P-02: officialPositionCode + localJobTitle も DryRun に表示される
- [ ] P-03: 社員以外は band が連動しない

### 共通
- [ ] propose_* で findPersons の事前呼び出しが不要になっているか
- [ ] キャンセル時に「ユーザーが操作を取り消しました」が返るか
- [ ] 操作後に getValidationDiagnosis が自動で呼ばれるか
