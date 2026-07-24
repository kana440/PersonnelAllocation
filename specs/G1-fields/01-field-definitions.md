# G1-01 フィールド定義表

> **目的**: AllocationRow の全フィールドについて、表示名・binding・入力種別・マスタ対応を一覧化する。
> RowEditorPanel の入力補助実装・バリデーション実装・AIツール設計のすべての基盤となる。
>
> **凡例**
> - 実装状況: ✓ 完了 / △ 部分実装 / ✗ 未実装
> - 入力種別: `text` / `select` / `combobox`（自由入力+候補） / `org-search` / `flag-select`（はい/いいえ） / `auto`（自動補完・編集不可） / `readonly`
> - masterKey: `AllCodeLists` のプロパティ名（旧称: codeListKey）

---

## 1. メタ情報（発令トランザクション固有）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | masterKey | 備考 |
|---|---|---|---|---|---|
| `transferReason` | 申請区分(異動事由) | ✓ | `combobox` | `transferReasons` | 発令の主分類。ComboInput実装済み |
| `memo` | メモ | ✓ | `text` | — | 自由記述 |
| `promotionSign` | 昇降格サイン | ✓ | `readonly`（バッジ表示） | — | '1'=昇格あり / ''=なし。band/payGrade変更から自動導出（`rules/derive/promotionFields.ts`）。編集不可・導出値の表示のみ |
| `demotionReason` | 降格理由 | ✓ | `select` | `demotionReasons` | `MetaSection` に select 実装済み |
| `payGradeChangeSign` | 給与等級変更サイン | ✓ | `readonly`（バッジ表示） | — | '1'=変更あり / ''=なし。payGrade変更から自動導出。編集不可・導出値の表示のみ |

---

## 2. 人物属性（binding: person）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | masterKey | 備考 |
|---|---|---|---|---|---|
| `employmentType` | 雇用タイプ | ✓ | `select` | `employmentTypes` | 実装済み |
| `band` | バンド | ✓ | `select` | `jobLevels` | jobLevels.label を表示・格納 |
| `payGrade` | 給与等級 | ✓ | `auto` | `payGrades` | band + jobType.compensationCategory で自動導出。手動上書き可 |
| `unionFlag` | 労働組合員 | ✓ | `select` | `UNION_MEMBER_CODES` | '組合員'/'特別組合員'/'非組合員' の固定値 |
| `discretionaryWorkFlag` | 裁量労働対象 | ✓ | `select` | `discretionaryWorkOptions` | CodeEntry[]。マスタから select 表示 |
| `nonUnionAgreementFlag` | 非組合協定対象者 | ✓ | `checkbox` | — | '1'=対象 / ''=非対象（BooleanFieldRow） |
| `leaveOfAbsenceSign` | 休職者サイン | ✓ | `checkbox` | — | '1'=休職中 / ''=通常（BooleanFieldRow） |

---

## 3. ポジション属性（binding: position）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | masterKey | 備考 |
|---|---|---|---|---|---|
| `positionCode` | ポジションコード | △ | `readonly`/`auto` | — | 通常は操作で自動生成。直接編集は原則しない。`_pos_` prefix = 内部採番 |
| `departmentCode` | 組織コード | ✓ | `org-search` | `afterOrganizations` | `OrgEditorRow`（`OrgSearchDialog`）実装済み。選択時 businessUnit〜team を `orgMasterEntries` から自動補完 |
| `officialPositionCode` | 役職 | ✓ | `select` | `officialPositions` | 実装済み |
| `localJobTitle` | フリータイトル | ✗ | `text` | — | 自由記述。officialPositionCodeと連動確認 **TODO** |
| `managerPositionCode` | 上司ポジションコード | ✓ | `position-search` | `allocationList` | ManagerPositionRow コンポーネント実装済み。人名で検索しポジションコードをセット。選択時 managerName も自動入力 |
| `positionBand` | ポジション_バンド | ✓ | `select` | `jobLevels` | jobLevels.label を表示・格納（band と同じリスト） |
| `positionUnionFlag` | ポジション_労働組合員 | ✓ | `select` | `UNION_MEMBER_CODES` | '組合員'/'特別組合員'/'非組合員' の固定値 |
| `positionDiscretionaryWorkFlag` | ポジション_裁量労働対象 | ✓ | `select` | `discretionaryWorkOptions` | CodeEntry[]。マスタから select 表示 |
| `trainingPositionFlag` | 業務研修ポジション | ✓ | `select` | `trainingPositions` | CodeEntry[]。マスタから select 表示 |
| `jobFamily` | ジョブファミリー | ✓ | `select` | `jobFamilies` | 実装済み。変更時 jobType/payGrade をクリア |
| `jobType` | ジョブタイプ | ✓ | `select` | `subJobFamilies` | jobFamily 連動フィルタ実装済み。変更時 payGrade 自動導出 |
| `location` | 勤務場所 | ✓ | `select` | `workLocations` | 実装済み |
| `costCenter` | コストセンター | ✗ | `text` | — | **TODO: マスタで管理すべきか確認** |

---

## 4. 組織階層フィールド（binding: position）

> `departmentCode`（組織コード）から `orgMasterEntries`（`phase='after'` 優先）を使って自動補完される。
> タイミング: (1) エディタで departmentCode 変更時、(2) ドメインオペレーション実行時、(3) ヘッダー「↻組織」ボタンで一括再導出。

| afterKey | 表示名 | 実装状況 | 目標入力種別 | 備考 |
|---|---|---|---|---|
| `businessUnit`〜`team`（5フィールド） | ビジネスユニット/部門/統括部/グループ/チーム | ✓ | `auto` (手動上書き可) | `departmentCode` 変更時に `orgMasterEntries` から自動補完（操作時・エディタ両方） |

---

## 5. 配属属性（binding: allocation）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | masterKey | 備考 |
|---|---|---|---|---|---|
| `concurrentType` | 本務兼務区分 | ✓ | `select` | `concurrentTypes` | 実装済み |
| `concurrentReason` | 兼務理由 | ✓ | `combobox` | `concurrentReasons` | 実装済み。常時表示（concurrentType='兼務'時のみ表示する条件表示は未実装 → G2-01 §4参照） |
| `secondmentFromCompany` | 出向元会社 | ✓ | `select` | `companies` | `companies`マスタから選択（companyFiltersではない） |
| `secondmentFromEmployeeNumber` | 出向元会社社員番号 | ✗ | `text` | — | 自由テキスト |
| `secondmentToCompany` | 出向先会社 | ✓ | `select` | `companies` | 同上 |
| `managerName` | 上司氏名 | ✓ | `auto` (手動上書き可) | — | `managerPositionCode`選択時・操作時に自動入力（"姓, 名" 形式）。一括再導出は「↻上司姓名」ボタン / AI `propose_re_derive_manager_names` |

---

## 6. 読み取り専用（個人識別子）

編集画面でも常に読み取り専用: `userId`（SF Person ID）, `employeeNumber`, `lastName`, `firstName`, `groupEmployeeId`, `groupEmployeeNumber`（推定）。

---

## 未確認事項（業務ルール確認が必要）

大半のフィールドはワイヤー済み。残る未確認事項は以下の通り。

- [ ] `band` の有効値一覧（マスタに定義なし。Excelシートにあるか？）
- [ ] `positionBand` と `band` の乖離は許容されるか
- [ ] `localJobTitle` と `officialPositionCode` の使い分けルール
- [ ] `costCenter` はマスタで管理すべきか（現状 `text` 自由入力）
