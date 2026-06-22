# G4-08 AI Tools リファレンス（確定版）

> このドキュメントは現在の実装と一致する確定済みツール仕様。
> 設計変更があったら必ずここを更新する。

---

## ツール分類

| kind | 動作 | 副作用 | Fast Path |
|---|---|---|---|
| `read` | 即時実行、結果を LLM に返す | なし | ✅ |
| `render` | ウィジェットを UI に表示、サマリーを LLM に返す | UI 表示のみ | ✅ |
| `navigate` | UI の表示状態を変更、結果を LLM に返す | UI 状態のみ（ドメインデータ変更なし） | ✅ |
| `execute` | 即時実行（ドメイン変更） | ドメイン状態変更 | ❌ |
| `confirm` | DryRun → 確認UI → 承認後に実行 | ドメイン状態変更 | ❌ |

**Fast Path** は `read` / `render` / `navigate` の3種のみ公開する。
`execute` / `confirm` は Structured Path（スキル起動後）でのみ使用可能。

---

## UIナビゲーションツール（navigate — `ui_` プレフィックス）

> データは一切変更しない。画面表示・フォーム状態のみ操作する。
> Fast Path でも使用可能。

### `ui_show_person`（navigate）

```
引数（いずれか1つ以上）:
  name?:            string   氏名（部分一致）
  userId?:          string   SF Person ID（部分一致）
  groupEmployeeId?: string   グループ社員ID（部分一致）
  employeeNumber?:  string   社員番号（部分一致）

戻り値:
  ok:      boolean
  message: string   "〇〇 にフォーカスしました（他N件ヒット）" など
  rowId?:  number
```

**用途**: 「〇〇さんを見せて」→ 検索してキャンバス上でフォーカス（1ステップで完結）。
人物データを取得したいだけなら `findPersons` を使うこと。

---

### `ui_focus_row`（navigate）

```
引数:
  rowId: number   フォーカス対象の rowId（findPersons の positions[].rowId）

戻り値:
  ok:      boolean
  message: string
```

**用途**: rowId が既に分かっているときのフォーカス。
名前で検索してフォーカスするなら `ui_show_person` を使う。

---

### `ui_open_operation`（navigate）

```
引数:
  rowId:       number             必須（対象行の rowId）
  operationId: string             必須（操作 ID）
  prefill?:    Record<string, string>  事前入力する AllocationRow フィールド

operationId の一覧（主なもの）:
  Promotion / Demotion / TitleChange
  OrgTransfer / OrgRestructure
  LeaveOfAbsence / LeaveOfAbsenceCancel / ReturnFromLeave
  EmploymentTypeChange / JobTypeChange
  ManagerChange
  SecondmentOutSF / SecondmentOutNonSF / SecondmentInSF / SecondmentInNonSF
  EmploymentTransfer / NoChange

戻り値:
  ok:          boolean
  message:     string
  operationId: string
  rowId:       number
  prefillKeys: string[]   prefill したフィールド名の一覧
```

**用途**:
- 「昇格フォームを開いて」→ UI で操作フォームを開く
- AI が既知の値を `prefill` で事前入力し、ユーザーが残りを入力して送信する
- AI はフォームを送信しない（ユーザーが最終確認して送信する）

**典型的な呼び出し順**:
1. `findPersons` で `rowId` を確認
2. `getFieldOptions(rowId, field)` で有効な選択肢を確認
3. `ui_open_operation` でフォームを開き `prefill` を渡す
4. ユーザーが残りを入力して送信

---

### `ui_get_form_state`（read）

```
引数: なし

戻り値（フォームが開いていない場合）:
  open: false

戻り値（フォームが開いている場合）:
  open:        true
  rowId:       number
  operationId: string
  values:      Partial<AllocationRow>   現在の入力値（未コミット）

追加フィールド（Promotion / Demotion フォームの場合のみ）:
  bandRecommendations: {
    current:         string    現在の positionBand
    oneStep:         string[]  1段階変更の候補（UIのデフォルトフィルタ）
    twoStep:         string[]  2段階変更の候補
    uiDefaultFilter: 'oneStep'
    note:            string
  }
```

**用途**: 現在開いているフォームの操作種別・入力中の値を読む。
フォームが開いていないときは `ui_open_operation` を先に呼ぶ。

> **Promotion/Demotion 時の注意**: UI は `BandStepFilter` により positionBand を1段階上（または下）に絞り込んで表示する。
> `bandRecommendations.oneStep` が UIのデフォルト推奨候補なので、通常はここから選ぶ。
> 「どのバンドに変更すべきか」を聞かれたら `oneStep` を回答する。

---

### `ui_suggest_form_field`（navigate）

```
引数:
  field: string   設定するフィールド名（AllocationRow のキー）
  value: string   設定する値（空文字でクリア）

戻り値:
  ok:      boolean
  field:   string
  value:   string
  message: string
```

**用途**: 開いているフォームのフィールドに値をセットする。
- `onFieldChange` の連動導出（positionBand → band → payGrade など）も正しく走る
- フォームの送信はユーザーが行う（AI は送信しない）
- 事前に `ui_get_form_state` でフォームが開いていることを確認すること
- 設定する値は `getFieldOptions(rowId, field)` で有効な選択肢を確認してから渡すこと

---

## 照会系ツール（read / render）

### `findPersons`

```
引数:
  name?:            string   氏名（部分一致）
  userId?:          string   SF Person ID
  groupEmployeeId?: string   グループ社員番号
  employeeNumber?:  string   社員番号
  subtreeOrgCode?:  string   指定組織配下を丸ごと対象
  role?:            'manager' | 'staff'
  concurrentType?:  string   '兼務' など

戻り値:
  persons: Array<{
    userId, name, employeeNumber, groupEmployeeId
    positions: Array<{
      rowId, departmentCode, orgName, localJobTitle
      positionBand, band, payGrade, officialPositionCode
      concurrentType?, leaveOfAbsenceSign?, positionCode
      availableOps: string[]   この行で現在実行可能な操作ラベルの一覧
    }>
  }>
```

**用途**: 人物を探して rowId を取得する。`positions[].rowId` を propose_* や ui_* に渡す。
`availableOps` は `EditOperation.availableFor` をリアルタイム評価した結果。
「この人に何ができますか？」→ findPersons を呼んで `availableOps` を返す。

---

### `findOrgs`

```
引数:
  name?:    string   組織名（部分一致）
  code?:    string   externalCode（完全一致）
  level?:   number   階層レベル（1=最上位）
  company?: string   会社コードで絞り込み

戻り値:
  Array<{
    orgCode, orgName, level, parentOrgCode?, path
    descendantOrgCodes: string[]   配下の全 orgCode
  }>
```

**用途**: 組織コードを取得する。`descendantOrgCodes` で配下一覧も取得可能。

---

### `findVacantPositions`

```
引数:
  orgCode?:        string   組織コード（省略可）
  subtreeOrgCode?: string   配下含む絞り込み

戻り値:
  Array<{ rowId, orgCode, orgName, localJobTitle, positionCode }>
```

---

### `getPersonsDetail`

```
引数:
  rowIds: number[]   findPersons の positions[].rowId

戻り値: 指定行の AllocationRow 全フィールド一覧
```

**用途**: findPersons では見えない全フィールドを確認するとき。

---

### `getReviewSummary`

```
引数: なし

戻り値:
  totalRows:    number   全行数
  changedRows:  number   変更のある行数
  byKind:       Array<{ code: string; label: string; count: number }>  多い順
  errorCount:   number
  warningCount: number
```

**用途**: まず呼ぶ。件数確認に安全（集計値のみ）。

---

### `getChangedRows`

```
引数（全任意）:
  kinds?:           string[]   変更種別コード（getReviewSummary.byKind[].code）
  name?:            string     氏名フィルタ
  userId?:          string
  groupEmployeeId?: string
  employeeNumber?:  string
  subtreeOrgCode?:  string     配下組織まで含む
  rowFilter?:       Record<string, string>   フィールド完全一致
  limit?:           number
  offset?:          number

戻り値:
  items: Array<{
    rowId, userId?, name, departmentCode?, orgName?
    prevDepartmentCode?, prevOrgName?
    kinds: Array<{ code, label }>
    grade:    { before, after } | null   payGrade 変化があれば
    position: { before, after } | null   officialPositionCode 変化があれば
  }>
  totalCount: number
  truncated:  boolean   limit を超えて存在するなら true
```

**用途**: 変更行の絞り込み・一覧・ページング。

---

### `getValidationIssues`

```
引数（全任意）:
  level?:           'error' | 'warning'
  name?:            string
  userId?:          string
  groupEmployeeId?: string
  employeeNumber?:  string
  subtreeOrgCode?:  string
  rowFilter?:       Record<string, string>

戻り値:
  Array<{
    rowId, userId?, name, field, level, message, currentValue?
  }>
```

---

### `getValidationDiagnosis`

```
引数: なし

戻り値:
  summary: { errors: number; warnings: number }
  byField: Array<{
    field, level, count, rowIds: number[]
    suggestedTool?, suggestedAction?
  }>  エラー優先・件数順
```

**用途**: 操作後に呼ぶ。修正方法の提案に使う。

---

### `getFieldOptions`

```
引数:
  rowId: number
  field: string   フィールドキー

戻り値（通常）:
  options: string[]   有効な選択肢
  required: boolean

戻り値（Promotion/Demotion フォーム中に positionBand を問い合わせた場合）:
  options:            string[]   全選択肢
  recommendedOptions: string[]   UIのフィルタ（1段階変更）に合わせた推奨候補
  currentBand:        string     現在の positionBand
  note:               string     昇格/降格フォームのデフォルト挙動の説明
```

> **注意**: `ui_get_form_state` が開いている場合、未コミットのドラフト値（フォームで選択中の値）を加味した選択肢を返す。
> Promotion/Demotion フォームで positionBand を問い合わせると `recommendedOptions`（1段階変更候補）が付加される。
> どのバンドにするか悩んだときは `recommendedOptions` から選ぶ。

---

### `show_org_members`（render）

```
引数:
  orgCode:         string
  subtreeOrgCode?: string   配下含む

戻り値: ウィジェット表示（副作用）+ サマリーを LLM に返す
```

---

### `getOrgTree`（render）

```
引数:
  rootOrgCode?: string   省略時は全体

戻り値: 組織ツリーウィジェット表示
```

---

## 変更系ツール（confirm — DryRun → 確認 → 実行）

### confirm ツールの共通仕様

**DryRun + formInputs フロー**:
1. LLM が `propose_*` を呼ぶ
2. `buildProposal` が DryRun を実行し確認ウィジェット（diff-preview）を生成
3. `formInputs` がある場合、確認UIに入力フォームを追加表示
4. ユーザーが確認・承認（formInputs を入力/修正）
5. `executeOnApprove(args, userInputs)` が実行される
6. 結果が LLM に返る（`{ ok, result }` or `{ ok, cancelled }`）

**フィルタパラメータ**: 全 propose_* は `name?` / `subtreeOrgCode?` / `rowId(s)?` を持つため、**findPersons の事前呼び出し不要**。

---

### `propose_transfer`

```
引数:
  targetOrgCode:   string   必須（移動先）
  rowIds?:         number[]   明示指定
  name?:           string     氏名フィルタ（rowIds 未指定時）
  subtreeOrgCode?: string     組織配下フィルタ（rowIds 未指定時）
  transferReason?: string     AI 提案値（確認UIで変更可）

formInputs（確認UIに表示）:
  - transferReason: '分掌異動（改組）' | '分掌異動'  ← ユーザーが確認・変更

DryRun 表示: 対象者一覧の orgName before/after
```

**transferReason のルール**:
- 組織改廃による移動 → `"分掌異動（改組）"`
- 職務内容が変わる人事異動 → `"分掌異動"`

---

### `propose_promotion`

```
引数:
  rowId:                    number   必須
  newPositionBand:          string   必須（主操作）
  newOfficialPositionCode?: string   役職コード（変わる場合）
  newLocalJobTitle?:        string   役職名フリーテキスト（変わる場合）

DryRun 表示: positionBand / band / payGrade の before/after
```

**自動導出チェーン**:
```
newPositionBand
  ↓ 雇用タイプが社員なら
band = newPositionBand
  ↓
jobLevels[band].promotionDemotionBand（昇降格判定読み替えバンド）
  × jobType.compensationCategory（報酬区分）
  ↓
payGrade（自動）→ promotionSign / payGradeChangeSign（自動）
```

---

## ツール選択フローチャート

```
「変更を教えて」「何人変更した」
  → getReviewSummary

「〇〇さんの変更を見たい」「A部門の変更一覧」
  → getChangedRows（name / subtreeOrgCode で絞り込み）

「エラーがある？」「バリデーション確認」
  → getValidationDiagnosis（まず）→ getValidationIssues（個別確認）

「〇〇さんを探して」（情報確認目的）
  → findPersons

「〇〇さんを見せて」「〇〇さんの場所を教えて」
  → ui_show_person（検索+画面フォーカスを1ステップ）

「〇〇さんの昇格フォームを開いて」
  → findPersons → ui_open_operation（operationId: 'Promotion'）
  ※ prefill に positionBand 等を渡すと事前入力される

「今フォームに何を入力すれば？」「次は何を選べばいい？」
  → ui_get_form_state → getFieldOptions（推奨選択肢付きで返る）

「〇〇さんをB部門に異動させて」
  → propose_transfer（findPersons 不要。name フィルタで直接指定）

「〇〇さんを昇格させて」
  → propose_promotion（rowId + newPositionBand のみ。band/payGrade 自動）
```

---

## 照会系スキル（SKILL.md）

| スキル | ファイル | 用途 |
|---|---|---|
| `query-changes` | `skills/query-changes/SKILL.md` | 変更内容の照会 |
| `query-validation` | `skills/query-validation/SKILL.md` | バリデーション確認・診断 |

## 変更系スキル（SKILL.md）

| スキル | ファイル | 用途 |
|---|---|---|
| `cascading-transfer` | `skills/cascading-transfer/SKILL.md` | 玉突き人事（連鎖異動） |
| `promotion-workflow` | `skills/promotion-workflow/SKILL.md` | 昇格処理 |
