# G3-01 RowEditorPanel 入力補助仕様

> **目的**: `RowEditorPanel` の各フィールドに対する入力コンポーネントの実装方式（ピッカー・ドロップダウンの動作）を定義する。
> フィールドごとの binding・入力種別・マスタ対応は `specs/G1-fields/01-field-definitions.md` を参照（本ファイルでは重複記載しない）。
>
> **実装基盤**: `apps/web/src/components/editor/RowEditorPanel/`（`FieldList.tsx`, `helpers.ts`, `OrgEditorRow.tsx`, `BooleanFieldRow.tsx`, `MetaSection.tsx`）, `RowEditorField.tsx`, `ManagerPositionRow.tsx`
>
> **前提spec**: `specs/G2-domain/01-business-rules.md`, `specs/G2-domain/02-validation-rules.md`

---

## 1. 入力コンポーネントの実装方式（現状）

### 1.1 select / combobox（マスタ選択）
`RowEditorField` → `ComboInput`。選択肢はドメイン層 `getGroupedFieldOptions` / `buildBaseOptions`（`FIELD_CONSTRAINTS` が単一ソース）から取得する。無効値（`invalidOptions`）が存在する場合は `strictness: 'guide'`（既存値を保持しつつ警告表示）、なければ `'free'`。
対象: `EDITOR_FIELD_ORDER`（`helpers.ts`）の大半のフィールド。

### 1.2 checkbox（'1'/'' フラグ）
`BOOLEAN_1_FIELDS`（`nonUnionAgreementFlag`, `leaveOfAbsenceSign`）は `BooleanFieldRow` でチェックボックスUI表示・編集する。値は `'1'`=あり / `''`=なし。
`promotionSign` / `payGradeChangeSign` も同じ値形式だが、`MetaSection` 内で自動導出値の**読み取り専用バッジ**として表示するのみ（編集不可）。

### 1.3 org-search（組織検索）
`departmentCode` のみ対象。`OrgEditorRow` が `OrgSearchDialog` を開き、選択時に `orgMasterEntries` から `businessUnit`〜`team` を一括セット（`buildBatch`）。既存の関連値がある場合は `ConfirmOverwriteDialog` で「コードのみ更新」か「関連値も上書き」かを確認する。

### 1.4 position-search（上司ポジション検索）
`managerPositionCode` は `ManagerPositionRow` で `PositionPickerModal` を開き人名検索 → ポジションコードをセット。選択時に `managerName` も自動入力される。既存値の上書きも `ConfirmOverwriteDialog` で確認する。

### 1.5 auto（自動補完・編集不可 or 手動上書き可）
- `managerName`: `managerPositionCode` の在席者から自動解決（空席時は空文字）
- `businessUnit`〜`team`: `departmentCode` 変更時に自動補完（手動上書き可）
- `payGrade`: `band` + `jobType.compensationCategory` から自動導出（手動上書き可）
- `promotionSign` / `payGradeChangeSign`: band/payGrade 変更から自動導出（編集不可・表示のみ、§1.2参照）

---

## 2. フィールドの表示/非表示ルール

| 条件 | 現状 |
|---|---|
| `concurrentType != '兼務'` の時 `concurrentReason` を隠す | ✗ 未実装（常時表示） |
| `demotion` 未検出の時 `demotionReason` を隠す | ✗ 未実装（常時表示） |
| `secondmentToCompany` なしの時 `secondmentFromCompany`/`secondmentFromEmployeeNumber` を隠す | ✗ 未実装（常時表示） |

条件表示が未実装のため、上記フィールドは該当しない行でも常に表示される。実装時は `FieldList.tsx` の render ループに条件分岐を追加する。

---

## 3. バリデーション表示（実装済み）

`RowEditorField` / `OrgEditorRow` / `BooleanFieldRow` は共通で `issues?: ValidationIssue[]` prop を受け取り、フィールド下に1行ずつ表示する。

- error: `text-red-600` + `✕` prefix、行背景 `bg-red-50`
- warning: `text-orange-600` + `⚠` prefix、行背景 `bg-orange-50`
- 差分あり（無エラー時）: 行背景 `bg-blue-50`

---

## 4. 残タスク（業務確認待ち）

- [ ] `positionCode` の直接編集を許容するか（通常は操作経由での自動採番）
- [ ] `band` フィールドの有効値一覧（マスタに定義なし → `specs/G1-fields/01-field-definitions.md` 未確認事項）
- [ ] §2 の条件付き表示ルール（`concurrentReason` / `demotionReason` / 出向元フィールド群）の実装
