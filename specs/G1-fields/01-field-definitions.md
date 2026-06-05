# G1-01 フィールド定義表

> **目的**: AllocationRow の全フィールドについて、表示名・binding・入力種別・codeList対応を一覧化する。
> RowEditorPanel の入力補助実装・バリデーション実装・AIツール設計のすべての基盤となる。
>
> **凡例**
> - 実装状況: ✓ 完了 / △ 部分実装 / ✗ 未実装
> - 入力種別: `text` / `select` / `combobox`（自由入力+候補） / `org-search` / `flag-select`（はい/いいえ） / `auto`（自動補完・編集不可） / `readonly`
> - codeListKey: `AllCodeLists` のプロパティ名

---

## 1. メタ情報（発令トランザクション固有）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | codeListKey | 備考 |
|---|---|---|---|---|---|
| `transferReason` | 申請区分(異動事由) | ✓ | `combobox` | `transferReasons` | 発令の主分類。ComboInput実装済み |
| `memo` | メモ | ✓ | `text` | — | 自由記述 |
| `promotionSign` | 昇降格サイン | △ | `select` | — | **TODO: 有効値を確認**（例: "1"=昇格, "-1"=降格？） |
| `demotionReason` | 降格理由 | △ | `combobox` | `demotionReasons` | combobox化未実装 |
| `payGradeChangeSign` | 給与等級変更サイン | △ | `select` | — | **TODO: 有効値を確認** |

---

## 2. 人物属性（binding: person）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | codeListKey | 備考 |
|---|---|---|---|---|---|
| `employmentType` | 雇用タイプ | ✓ | `select` | `employmentTypes` | 実装済み |
| `band` | バンド | ✓ | `select` | `jobLevels` | jobLevels.label を表示・格納 |
| `payGrade` | 給与等級 | ✓ | `auto` | `payGrades` | band + jobType.compensationCategory で自動導出。手動上書き可 |
| `unionFlag` | 労働組合員 | ✓ | `select` | `UNION_MEMBER_CODES` | '組合員'/'特別組合員'/'非組合員' の固定値 |
| `discretionaryWorkFlag` | 裁量労働対象 | ✓ | `select` | `discretionaryWorkOptions` | CodeEntry[]。codeList から select 表示 |
| `nonUnionAgreementFlag` | 非組合協定対象者 | ✓ | `checkbox` | — | '1'=対象 / ''=非対象（BooleanFieldRow） |
| `leaveOfAbsenceSign` | 休職者サイン | ✓ | `checkbox` | — | '1'=休職中 / ''=通常（BooleanFieldRow） |

---

## 3. ポジション属性（binding: position）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | codeListKey | 備考 |
|---|---|---|---|---|---|
| `positionCode` | ポジションコード | △ | `readonly`/`auto` | — | 通常は操作で自動生成。直接編集は原則しない。`_pos_` prefix = 内部採番 |
| `departmentCode` | 組織コード | ✗ | `org-search` | `afterOrganizations` | **OrgCombobox が既存コンポーネントとして存在。未ワイヤー** |
| `officialPositionCode` | 役職 | ✗ | `select` | `officialPositions` | codeList定義あり・未ワイヤー |
| `localJobTitle` | フリータイトル | ✗ | `text` | — | 自由記述。officialPositionCodeと連動確認 **TODO** |
| `managerPositionCode` | 上司ポジションコード | ✓ | `position-search` | `allocationList` | ManagerPositionRow コンポーネント実装済み。人名で検索しポジションコードをセット。選択時 managerName も自動入力 |
| `positionBand` | ポジション_バンド | ✓ | `select` | `jobLevels` | jobLevels.label を表示・格納（band と同じリスト） |
| `positionUnionFlag` | ポジション_労働組合員 | ✓ | `select` | `UNION_MEMBER_CODES` | '組合員'/'特別組合員'/'非組合員' の固定値 |
| `positionDiscretionaryWorkFlag` | ポジション_裁量労働対象 | ✓ | `select` | `discretionaryWorkOptions` | CodeEntry[]。codeList から select 表示 |
| `trainingPositionFlag` | 業務研修ポジション | ✓ | `select` | `trainingPositions` | CodeEntry[]。codeList から select 表示 |
| `jobFamily` | ジョブファミリー | ✓ | `select` | `jobFamilies` | 実装済み。変更時 jobType/payGrade をクリア |
| `jobType` | ジョブタイプ | ✓ | `select` | `subJobFamilies` | jobFamily 連動フィルタ実装済み。変更時 payGrade 自動導出 |
| `location` | 勤務場所 | ✗ | `select` | `workLocations` | codeList定義あり・未ワイヤー |
| `costCenter` | コストセンター | ✗ | `text` | — | **TODO: codeListで管理すべきか確認** |

---

## 4. 組織階層フィールド（binding: position）

> `departmentCode`（組織コード）から自動補完される。`orgMasterEntries` の `phase='after'` エントリを優先して使用する。
> 自動補完されるタイミング: (1) エディタで departmentCode を変更したとき、(2) ドメインオペレーション（移動・異動・空席作成等）実行時、(3) ヘッダーの「↻組織」ボタンで一括再導出。

| afterKey | 表示名 | 実装状況 | 目標入力種別 | 備考 |
|---|---|---|---|---|
| `businessUnit` | ビジネスユニット | ✓ | `auto` (手動上書き可) | `departmentCode` 変更時に `orgMasterEntries` から自動補完（操作時・エディタ両方） |
| `division` | 部門 | ✓ | `auto` (手動上書き可) | 同上 |
| `subDivision` | 統括部 | ✓ | `auto` (手動上書き可) | 同上（OrgMasterEntry.department → subDivision にマッピング） |
| `group` | グループ | ✓ | `auto` (手動上書き可) | 同上 |
| `team` | チーム | ✓ | `auto` (手動上書き可) | 同上 |

---

## 5. 配属属性（binding: allocation）

| afterKey | 表示名 | 実装状況 | 目標入力種別 | codeListKey | 備考 |
|---|---|---|---|---|---|
| `concurrentType` | 本務兼務区分 | ✓ | `select` | `concurrentTypes` | 実装済み |
| `concurrentReason` | 兼務理由 | ✗ | `combobox` | `concurrentReasons` | codeList定義あり・未ワイヤー。concurrentType='兼務'の時のみ表示 |
| `secondmentFromCompany` | 出向元会社 | ✗ | `select` | `companyFilters` | **TODO: companyFiltersから選択か自由入力か確認** |
| `secondmentFromEmployeeNumber` | 出向元会社社員番号 | ✗ | `text` | — | 自由テキスト |
| `secondmentToCompany` | 出向先会社 | ✗ | `select` | `companyFilters` | 同上 |
| `managerName` | 上司氏名 | ✓ | `auto` (手動上書き可) | — | `managerPositionCode`選択時・操作時に自動入力（"姓, 名" 形式）。一括再導出は「↻上司姓名」ボタン / AI `propose_re_derive_manager_names` |

---

## 6. 読み取り専用（個人識別子）

これらは編集画面でも常に読み取り専用。

| key | 表示名 | 備考 |
|---|---|---|
| `userId` | ユーザー/社員ID | SF Person ID |
| `employeeNumber` | 社員番号 | |
| `lastName` | 姓 | |
| `firstName` | 名 | |
| `groupEmployeeId` | グループ社員ID | |
| `groupEmployeeNumber` | グループ社員番号（推定） | |

---

## 7. 実装優先順位（提案）

| 優先度 | フィールド群 | 理由 |
|---|---|---|
| 🔴 高 | `departmentCode`（org-search） | 最頻用フィールド。OrgComboboxが既にある |
| 🔴 高 | `officialPositionCode`, `payGrade`, `location` | codeList既存・ワイヤーのみ |
| 🔴 高 | 各種flagフィールド（flag-select化） | 現状テキスト入力で誤入力リスク大 |
| 🟡 中 | `managerPositionCode` + `managerName`自動補完 | 専用UIが必要 |
| 🟡 中 | `businessUnit`〜`team`の自動補完 | 業務ルール確認後 |
| 🟡 中 | `concurrentReason`, `demotionReason` | combobox化 |
| 🟢 低 | `band`, `positionBand` | 有効値一覧が不明 |
| 🟢 低 | `secondmentFromCompany`, `secondmentToCompany` | 使用頻度低 |

---

## 未確認事項（業務ルール確認が必要）

- [ ] `band` の有効値一覧（codeListにない。Excelシートにあるか？）
- [ ] `positionBand` と `band` の乖離は許容されるか
- [ ] `promotionSign`, `payGradeChangeSign` の有効値（現状 "1"/"" として実装）
- [ ] `localJobTitle` と `officialPositionCode` の使い分けルール
- [x] `businessUnit`〜`team` は `departmentCode` から `orgMasterEntries` を使って自動補完（操作時・エディタ両方）。一括再導出ボタンあり
- [x] `leaveOfAbsenceSign` の値形式 → '1'=休職中 / ''=通常（checkbox UI）
- [x] `managerName` は managerPositionCode 選択時・操作時に自動入力。一括再導出あり
