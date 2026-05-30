# G2-02 バリデーション規則定義

> **目的**: `validateRow()` で実装すべきバリデーション規則を一覧化する。
> 実装後の変更はこのファイルを更新してから対応ファイルに反映する。
>
> **原則（確定）**:
> - ERROR / WARNING があっても Excel 保存・出力はブロックしない
> - バリデーションは `changes?: RowChanges` を受け取り、変更種別と連動できる
> - フィールド単位で `ValidationIssue[]` を返す純粋関数として実装
> - **すべてのルールは `level: 'error'`**

---

## VALUE_RULES（src/domain/valueRules.ts）

フィールドの許容値制約の**単一定義**。以下の2箇所がここから導出される:

| 導出先 | 対象 |
|---|---|
| `validateExistence.ts`（D2-2〜D2-11） | `kind: 'constraint'`、`when` なし |
| `validateRelated.ts`（C4 役職・勤務場所） | `kind: 'constraint'`、`when` あり |
| `optionFilter/index.ts` | `kind` 問わず全ルール |

**ルール追加・変更時は必ずここを確認すること。**

### kind の意味

| kind | 選択肢表示 | バリデーション |
|---|---|---|
| `'suggestion'` | ✓ | ✗（推奨値のみ） |
| `'constraint'` | ✓ | ✓（リスト外はエラー） |

### カスタムチェック（VALUE_RULES に含まない）

| ルール | 理由 |
|---|---|
| D2-1（departmentCode） | `Organization[]`（orgs）参照が必要 |
| D2-7（jobType） | 親子フィルタ・メッセージが複雑 |
| C4（departmentCode の組織レベル） | orgMasterEntries 参照が必要 |

---

## ルーティング

`validateRow()` は `transferReason` のマスタ（`TransferReasonEntry`）を参照してチェック範囲を切り替える。

| 条件 | 実行系統 |
|---|---|
| `transferReason` の `noCheckRequired === true` | E系のみ |
| それ以外（未設定 / `noCheckRequired === false`） | A / B / D / E / F 全系 |

---

## ファイル構成

```
src/domain/validation/
  validateRow.ts         ← オーケストレーター（ルーティング・ヘルパー export）
  types.ts               ← ValidationIssue / ValidationLevel 型定義
  validateRequired.ts    ← A系（必須チェック）
  validateFormat.ts      ← B系（形式チェック）
  validateRelated.ts     ← C系（関連チェック）
  validateExistence.ts   ← D系（存在チェック）
  validateKeys.ts        ← E系（キー重複チェック）
  validateConsistency.ts ← G系（データ整合性チェック）
```

---

## A系 — 必須チェック

実装ファイル: `validateRequired.ts`

| # | フィールド | 条件 | メッセージ | 実装状況 |
|---|---|---|---|---|
| A1-0 | `transferReason` | 常に | 申請区分（異動事由）は必須です | ✓ |
| A1-1 | `departmentCode`, `officialPositionCode`, `location`, `costCenter`, `managerPositionCode`, `jobFamily`, `jobType`, `positionBand`, `trainingPositionFlag`, `positionUnionFlag`, `positionDiscretionaryWorkFlag` | `positionCode` 設定あり かつ 空 | {フィールド名}は必須です | ✓ |
| A1-2 | `groupEmployeeId`, `lastName`, `firstName`, `employmentType`, `concurrentType`, `band`, `payGrade`, `unionFlag`, `discretionaryWorkFlag` | `userId` 設定あり かつ 空 | ユーザーIDが入力されている場合、{フィールド名}は必須です | ✓ |
| A2 | `secondmentToCompany` | `departmentCode` の `orgMasterEntries.organizationLevel` が `'出向者用組織'` かつ 空 | 出向者用組織の場合、出向先会社は必須です | ✓ |
| A3 | `secondmentFromCompany`, `secondmentFromEmployeeNumber` | `employmentType` の `isOutsourceAcceptance` が true かつ 空 | 出向受入の場合、出向元会社／出向元会社社員番号は必須です | ✓ |
| A4 | `concurrentReason` | `transferReason` の `concurrentCheckSign` が true かつ 空 | 兼務チェックサインが設定されている場合、兼務理由は必須です | ✓ |
| A5 | `localJobTitle` | `officialPositionCode` の `isFreeTitle` が true かつ 空 | フリータイトル対象の役職の場合、フリータイトルは必須です | ✓ |

---

---

## C系 — 関連チェック

実装ファイル: `validateRelated.ts`

マスタを参照して関連フィールドの整合性を検証する。マスタ未ロード時（配列長 0）はスキップ。

| # | フィールド | 条件 | メッセージ | 実装状況 |
|---|---|---|---|---|
| C1 | `businessUnit`, `division`, `subDivision`, `group`, `team` | `departmentCode` 設定あり かつ `orgMasterEntries` にマスタ値あり かつ 不一致 | {フィールド名}が組織マスタと一致しません（マスタ値: "…"） | ✓ |
| C2 | `location`, `costCenter` | `departmentCode` 設定あり かつ マスタ側が非空 かつ 不一致 | {フィールド名}が組織マスタと一致しません（マスタ値: "…"） | ✓ |
| C3 | `positionUnionFlag`, `unionFlag` | `nonUnionAgreementFlag === '1'` かつ 値が `'非組合員'` でない | 非組合協定対象者の場合、{フィールド名}は「非組合員」を選択してください | ✓ |
| C4 | `departmentCode`, `officialPositionCode`, `location` | `secondmentToCompany` 設定あり かつ 出向者関連でない | 組織コード: `organizationLevel === '出向者用組織'`、役職・勤務場所: 値が `'出向者'` であること | ✓ |

---

## B系 — 形式チェック

実装ファイル: `validateFormat.ts`

| # | フィールド | 条件 | メッセージ | 実装状況 |
|---|---|---|---|---|
| B1 | `employeeNumber` | 設定あり かつ `/^\d{7}$/` に不一致 | 社員番号は7桁の半角数字で入力してください | ✓ |
| B2 | `positionCode` | 設定あり かつ `_pos_` 始まりでない かつ `/^P\d{8}$/` に不一致 | ポジションコードは「P」+ 8桁半角数字の形式で入力してください（例: P12345678） | ✓ |
| B3 | `costCenter` | 設定あり かつ `/^\d{5}-[A-Z0-9]{7}$/` に不一致 | コストセンターは「数字5桁-英数字7桁」の半角大文字で入力してください（例: 12345-AB00001） | ✓ |
| B4 | `userId` | 設定あり かつ `/^\d+$/` に不一致 | ユーザーIDは半角数字で入力してください | ✓ |

---

## D系 — 存在チェック

実装ファイル: `validateExistence.ts`

マスタ・リスト値と照合し、存在しない値を検出する。マスタ未ロード時（配列長 0）はスキップ。

| # | フィールド | 照合先 | メッセージ | 実装状況 |
|---|---|---|---|---|
| D2-1 | `departmentCode` | `afterOrganizations`（externalCode / id） | 組織コード "${code}" はマスタに存在しません | ✓ |
| D2-2 | `officialPositionCode` | `codeLists.officialPositions`（label） | 役職 "${val}" はマスタに存在しません | ✓ |
| D2-3 | `payGrade` | `codeLists.payGrades`（label） | 給与等級 "${val}" はマスタに存在しません | ✓ |
| D2-4 | `location` | `codeLists.workLocations`（label） | 勤務場所 "${val}" はマスタに存在しません | ✓ |
| D2-5 | `employmentType` | `codeLists.employmentTypes`（label） | 雇用タイプ "${val}" はマスタに存在しません | ✓ |
| D2-6 | `jobFamily` | `codeLists.jobFamilies`（label） | ジョブファミリー "${val}" はマスタに存在しません | ✓ |
| D2-7 | `jobType` | `codeLists.subJobFamilies`（jobFamily 配下） | ジョブタイプ "${val}" は選択したジョブファミリーの子に含まれません | ✓ |
| D2-8 | `band`, `positionBand` | `codeLists.jobLevels`（label） | バンド "${val}" はマスタに存在しません | ✓ |
| D2-9 | `unionFlag`, `positionUnionFlag` | `UNION_MEMBER_CODES` | 労働組合員 "${val}" はリスト値と一致しません | ✓ |
| D2-10 | `trainingPositionFlag`, `positionDiscretionaryWorkFlag`, `discretionaryWorkFlag` | `codeLists.trainingPositions`（code）/ `codeLists.discretionaryWorkOptions`（code） | 業務研修ポジション・裁量労働区分 "${val}" はリスト値と一致しません | ✓ |
| D2-11 | `concurrentType` | `CONCURRENT_TYPES` | 本務兼務区分 "${val}" はリスト値と一致しません | ✓ |

---

## E系 — キー重複チェック

実装ファイル: `validateKeys.ts`

`noCheckRequired === true` の場合もこの系統は**実行される**。

| # | フィールド | 条件 | メッセージ | 実装状況 |
|---|---|---|---|---|
| E1 | `managerPositionCode` | 設定あり かつ allRows に存在しない positionCode | 上司ポジションコード "${code}" が見つかりません | ✓ |
| E1 | `managerPositionCode` | `managerPositionCode === positionCode`（自己参照） | 自分自身を上司ポジションに設定できません | ✓ |
| E1 | `managerPositionCode` | 設定した上司が自ポジションの配下（循環参照） | 配下のポジションを上司に設定できません（循環参照） | ✓ |

---

## F系 — 雇用タイプ・申請区分による値制約

実装ファイル: `validateRelated.ts`（VALUE_RULES 条件付き制約として `checkConditionalValueRules` で評価）

雇用タイプや申請区分の CodeList フラグに応じて、バンド・給与等級の許容値を絞り込む。
オプション絞り込み（`optionFilter`）にも同一ルールが自動適用される。

| # | フィールド | 条件 | メッセージ | 実装状況 |
|---|---|---|---|---|
| F1 | `band`, `payGrade` | `employmentType` の `isOutsourceAcceptance` が true | バンド／給与等級は雇用タイプに対応する選択肢から選択してください | ✓ |
| F2 | `band`, `payGrade` | `employmentType` の `isEmployee` が true かつ `userId === groupEmployeeId` | バンド／給与等級は雇用タイプに対応する選択肢から選択してください | ✓ |
| F3 | `band`, `payGrade` | `employmentType` の `isEmploymentExtension` が true | バンド／給与等級は雇用タイプに対応する選択肢から選択してください（band は `isEmploymentExtensionJobClassification` で絞る） | ✓ |
| F4 | `payGrade` | `transferReason` の `concurrentCheckSign` が true | 給与等級は兼務に対応する選択肢から選択してください | ✓ |
| F4 | `leaveFlag` | `transferReason` の `concurrentCheckSign` が true | 兼務の場合、休職フラグは設定できません | ✓ |

---

## G系 — データ整合性チェック

実装ファイル: `validateConsistency.ts`

| # | フィールド | 条件 | メッセージ | 実装状況 |
|---|---|---|---|---|
| G1 | `positionCode` | 昇級・降級かつ transfer なし かつ positionCode 未変更 | 昇級・降級が検出されましたが、ポジションコードが変更されていません（新ポジションへの登録が必要です） | ✓ |

---

## W系 — ワーニングチェック

実装ファイル: `validateConsistency.ts`（`runConsistency` 内、`level: 'warning'` で返す）

| # | フィールド | 条件 | メッセージ | 実装状況 |
|---|---|---|---|---|
| W2 | `band` | F2条件（社員・`userId === groupEmployeeId`）かつ `band` と `prevBand` の `promotionDemotionWarningLevel` 差が2以上（どちらかが0なら対象外） | ２段階の昇降格が検出されました。問題ないか確認してください | ✓ |

---

## バリデーション追加時の変更チェックリスト

### 必須変更（毎回）

| ファイル | 変更内容 |
|---|---|
| 対応する `validate*.ts`（A〜F） | チェック関数を追加し、`run*()` の return 配列に追加 |
| `specs/G2-domain/02-validation-rules.md`（このファイル） | 対応セクションのテーブルに行を追加し、実装状況を ✓ にする |

### 不要（自動で伝播する）

| 対象 | 理由 |
|---|---|
| `src/components/editor/RowEditorPanel/` | `fieldsToShow()` が issue フィールドを自動でデフォルト表示に含める |
| `src/components/review/` | `useReviewData` が `validateRow` を呼び出しているため自動反映 |
| `src/application/aiTools.ts` | `getValidationIssues` / `getValidationDiagnosis` は全 issue を動的に走査するため追加不要 |

### 条件付き変更

| 条件 | ファイル | 変更内容 |
|---|---|---|
| 対象フィールドが `EDITOR_FIELD_ORDER` に未登録 | `src/components/editor/RowEditorPanel/helpers.ts` | `EDITOR_FIELD_ORDER` に追加 |
| E系以外の新ルールを `noCheckRequired` 時にも実行したい | `validateRow.ts` | ルーティング条件を調整 |
