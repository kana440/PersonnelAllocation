# G3-01 RowEditorPanel 入力補助仕様

> **目的**: `RowEditorPanel` の各フィールドに対する入力種別・補完ロジック・表示ルールを定義する。
> 実装基盤: `src/components/editor/RowEditorPanel.tsx`, `RowEditorField.tsx`
>
> **前提spec**:
> - フィールド定義: `specs/G1-fields/01-field-definitions.md`
> - 業務ルール: `specs/G2-domain/01-business-rules.md`
> - バリデーション: `specs/G2-domain/02-validation-rules.md`

---

## 1. 入力種別の実装方針

### 1.1 select（コードリスト選択）
```tsx
// codeListsから選択肢を生成。RowEditorPanelのgetOptions()を拡張する
const CODE_LIST_KEYS: Partial<Record<string, string>> = {
  // 既存
  employmentType: 'employmentTypes',
  concurrentType: 'concurrentTypes',
  transferReason: 'transferReasons',
  jobFamily:      'jobFamilies',
  jobType:        'jobTypes',
  // TODO: 追加
  officialPositionCode: 'officialPositions',   // .value プロパティ
  payGrade:             'payGrades',
  location:             'workLocations',
  concurrentReason:     'concurrentReasons',
  demotionReason:       'demotionReasons',
  trainingPositionFlag: 'trainingPositions',   // 文字列配列
  discretionaryWorkFlag: 'discretionaryWorkOptions', // 文字列配列
}
```

### 1.2 flag-select（はい/いいえ）
```tsx
// 専用の FlagSelectInput コンポーネント（新規作成）
// 有効値は "Y"/"N" or "1"/"0" → TODO: 業務確認
const FLAG_FIELDS = new Set([
  'positionUnionFlag', 'positionDiscretionaryWorkFlag',
  'unionFlag', 'nonUnionAgreementFlag', 'leaveFlag',
])
```

### 1.3 org-search（組織検索）
```tsx
// OrgCombobox を RowEditorPanel に組み込む（既存コンポーネント再利用）
// departmentCode にのみ適用
// onChange で businessUnit〜team を自動補完（業務ルール確定後）
const ORG_SEARCH_FIELDS = new Set(['departmentCode'])
```

### 1.4 auto（自動補完・読み取り専用）
```tsx
// managerName: managerPositionCodeから在席者を引く
// 表示のみ、編集不可
const AUTO_FIELDS = new Set(['managerName'])

function resolveManagerName(managerPositionCode: string, allocationList: AllocationRow[]): string {
  const mgr = allocationList.find(r => r.positionCode === managerPositionCode && r.userId)
  return mgr ? `${mgr.lastName ?? ''}${mgr.firstName ?? ''}` : ''
}
```

---

## 2. フィールドの表示/非表示ルール

| 条件 | 表示するフィールド | 非表示にするフィールド |
|---|---|---|
| `concurrentType != '兼務'` | — | `concurrentReason` |
| `concurrentType = '兼務'` | `concurrentReason`（必須） | — |
| `secondmentToCompany` なし | — | `secondmentFromCompany`, `secondmentFromEmployeeNumber` |
| `demotion` 未検出 | — | `demotionReason` |
| 常時 | — | `businessUnit`〜`team`（自動補完時は折りたたみ） |

> TODO: この表を確定したら `fieldsToShow()` または `RowEditorPanel` の render ロジックに反映する

---

## 3. バリデーション表示仕様

### 3.1 フィールド下インライン表示（実装予定）

```
[フィールドラベル] [入力欄                    ]
                  ⚠ バンドが変更されていますが... ← warning: オレンジ
                  ✕ ポジションコードが変更されていません ← error: 赤
```

### 3.2 現状の実装
- `RowEditorField` は `issues?: ValidationIssue[]` を受け取るが表示実装は最小限
- `hasIssue` で border-red のスタイルのみ適用済み

### 3.3 目標実装
- `RowEditorField` の `issues` prop でフィールド下に1行ずつ表示
- error: `text-red-600` + `✕` prefix
- warning: `text-orange-500` + `⚠` prefix

---

## 4. 実装タスク（優先順位順）

### 🔴 P1: codeListのワイヤー追加
- [x] `CODE_LIST_KEYS` に `officialPositionCode`, `payGrade`, `location`, `concurrentReason`, `demotionReason` を追加
- [x] `trainingPositionFlag`, `discretionaryWorkFlag` の文字列配列対応（`getOptions` で `typeof v === 'string'` 分岐）
- 実装ファイル: `RowEditorPanel.tsx` の `CODE_LIST_KEYS` と `getOptions()`

### 🔴 P1: flag-select 化
- [x] `FLAG_FIELDS` 定数（Y/N）を定義し `getOptions()` で返す
- [x] `RowEditorField` の `options` に Y/N が渡され ComboInput でドロップダウン表示
- [ ] 有効値を業務確認後に修正（現状 "Y"/"N" — TODO コメントあり）

### 🔴 P1: org-search（departmentCode）
- [x] `OrgEditorRow` コンポーネントを追加（`OrgCombobox` + externalCode ↔ id 変換）
- [x] render ループで `ORG_FIELDS.has(key)` の場合に `OrgEditorRow` を使用
- 参照: `src/components/common/OrgCombobox.tsx`

### 🔴 P1: バリデーション表示改善
- [x] `RowEditorField` にインラインエラー/警告表示あり（実装済み確認）
- [x] error: `text-red-600` + `✕` / warning: `text-orange-600` + `⚠`

### 🟡 P2: managerName 自動補完
- [ ] `managerPositionCode` 変更時に `managerName` を自動設定
- [ ] `managerName` を読み取り専用フィールドとして表示

### 🟡 P2: 条件付き表示
- [ ] `concurrentReason` の conditional show（concurrentType='兼務'時のみ）
- [ ] `demotionReason` の conditional show（demotion検出時のみ）

### 🟢 P3: 階層フィールド自動補完
- [ ] `departmentCode` 変更時に `businessUnit`〜`team` を組織マスタから自動補完
- 業務ルール確認後に実装

---

## 5. 未確認事項

- [ ] flag フィールドの有効値（"Y"/"N"? "1"/"0"? "true"/"false"?）
- [ ] `positionCode` の直接編集を許容するか（通常は操作経由）
- [ ] `band` フィールドの有効値（codeListに定義なし）
- [ ] `departmentCode` 変更時に `businessUnit`〜`team` を自動補完するか
