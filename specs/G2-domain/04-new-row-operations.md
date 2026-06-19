# G2-04 新規行追加操作 仕様

組織パネルの追加ボタン、または人物操作パネルのメニューから起動する「新しい行を作る」系操作の要件定義。

既存行を上書きする操作（通常の異動・昇格等）は対象外。

---

## 起動パターン

| 起動元 | 操作種別 | src 行 | 組織初期値 |
|---|---|---|---|
| 組織パネルの追加ボタン | 新規追加 | なし | ボタンを押した組織を引き継ぎ |
| 人物操作パネルのメニュー（本務行を選択中） | コピー追加 | あり（選択中の本務行） | 空（picker で選ぶ） |

---

## 共通フィールド仕様（全5操作）

以下は全操作共通。

| フィールド | 新規追加デフォルト | コピー追加デフォルト | 必須 | 編集可 |
|---|---|---|---|---|
| `lastName` 姓 | 空 | src コピー | **必須** | 可 |
| `firstName` 名 | 空 | src コピー | **必須** | 可 |
| `groupEmployeeId` グループ社員ID | 空 | src コピー | 任意 | 不可（表示） |
| `employeeNumber` 社員番号 | 空 | src コピー | 任意 | 不可（表示） |
| `userId` ユーザーID | 空 | **空**（SF では兼務でも別 ID） | 任意 | 可 |
| `positionCode` | 新規採番 `_pos_XXX` | 新規採番 | 自動 | 可 |
| `departmentCode` | 組織ボタンから引き継ぎ | 空（picker 必須） | 任意 | 可（picker） |
| `businessUnit`〜`team` | departmentCode から自動導出 | 同左 | 自動 | 不可 |
| `positionBand` | 空 | **空**（src 引き継がない） | 任意 | 可（絞り込みなし） |
| `jobFamily` | 空 | src コピー | 任意 | 可 |
| `jobType` | 空 | src コピー | 任意 | 可 |
| `officialPositionCode` | 空 | 空 | 任意 | 可 |
| `trainingPositionFlag` | `'0'`（いいえ） | `'0'` | 自動 | 可 |
| `positionUnionFlag` | 空 | 空 | 任意 | 可 |
| `unionFlag` | 空 | 空 | 任意 | 可 |
| `employmentType` | 空（操作別デフォルトあり） | src コピー（操作別制約あり） | 任意 | 操作による |

> **最低保存条件**: `lastName` + `firstName` + `concurrentType`（自動）があれば保存可。
> 理由: AI 検索が氏名を使用するため氏名は必須。他フィールドは後から担当者が記入するケースあり。

---

## 操作別仕様

### ① 社内兼務追加（ConcurrentAdd）

**既存の操作をコピー追加対応に拡張 + 組織ボタンから新規追加を追加。**

| フィールド | 値 | 備考 |
|---|---|---|
| `concurrentType` | `'兼務'`（固定） | 変更不可 |
| `employmentType` | src コピー or 空 | 変更不可（変更は雇用変更操作を使う） |
| `concurrentReason` | 空 | 任意 |
| `band` | `isConcurrent=true` 候補・空始まり | 任意 |
| `payGrade` | `isConcurrent=true` 候補・空始まり | 任意 |
| `secondmentFromCompany` | なし | — |

**validate 変更点**: src なし（新規追加）の場合、`userId` の存在チェックをスキップする。

---

### ② 本務出向受入 新規追加（SecondmentInNewSF）

SF 統合先からの出向受入。**既存の `SecondmentInSF`（既存行上書き）は残す。**

| フィールド | 値 | 備考 |
|---|---|---|
| `concurrentType` | 空（本務） | 固定 |
| `employmentType` | `isSecondmentAcceptance=true` 候補 | 任意 |
| `secondmentFromCompany` | 空 | **必須** |
| `secondmentFromEmployeeNumber` | 空 | **必須**（SF は社員番号で名寄せ） |
| `band` | `isSecondmentAcceptance=true` 候補・空始まり | 任意 |
| `payGrade` | `isSecondmentAcceptance=true` 候補・空始まり | 任意 |

---

### ③ 本務出向受入 新規追加（SecondmentInNewNonSF）

SF 非統合先からの出向受入。

| フィールド | 値 | 備考 |
|---|---|---|
| `concurrentType` | 空（本務） | 固定 |
| `employmentType` | `isSecondmentAcceptance=true` 候補 | 任意 |
| `secondmentFromCompany` | 空 | **必須** |
| `secondmentFromEmployeeNumber` | 空 | 任意（非SF は社員番号不明のケースあり） |
| `band` | `isSecondmentAcceptance=true` 候補・空始まり | 任意 |
| `payGrade` | `isSecondmentAcceptance=true` 候補・空始まり | 任意 |

---

### ④ 兼務出向受入 新規追加（ConcurrentSecondmentInNewSF）

SF 統合先からの兼務出向受入。

| フィールド | 値 | 備考 |
|---|---|---|
| `concurrentType` | `'兼務'`（固定） | 変更不可 |
| `employmentType` | `isSecondmentAcceptance=true` 候補 | 任意 |
| `secondmentFromCompany` | 空 | **必須** |
| `secondmentFromEmployeeNumber` | 空 | **必須** |
| `concurrentReason` | 空 | 任意 |
| `band` | `isConcurrent=true` 候補・空始まり | 任意（出向受入でも兼務バンド適用） |
| `payGrade` | `isConcurrent=true` 候補・空始まり | 任意 |

---

### ⑤ 兼務出向受入 新規追加（ConcurrentSecondmentInNewNonSF）

SF 非統合先からの兼務出向受入。

| フィールド | 値 | 備考 |
|---|---|---|
| `concurrentType` | `'兼務'`（固定） | 変更不可 |
| `employmentType` | `isSecondmentAcceptance=true` 候補 | 任意 |
| `secondmentFromCompany` | 空 | **必須** |
| `secondmentFromEmployeeNumber` | 空 | 任意 |
| `concurrentReason` | 空 | 任意 |
| `band` | `isConcurrent=true` 候補・空始まり | 任意 |
| `payGrade` | `isConcurrent=true` 候補・空始まり | 任意 |

---

## band / payGrade フィルタ対応表

| 操作 | band/payGrade フィルタ | positionBand フィルタ |
|---|---|---|
| 社内兼務追加 | `isConcurrent=true` | 絞りなし |
| 本務出向受入（SF/非SF） | `isSecondmentAcceptance=true` | 絞りなし |
| 兼務出向受入（SF/非SF） | `isConcurrent=true` | 絞りなし |

---

## 組織パネル 追加ボタン UI 仕様

- **場所**: キャンバス上の各組織ボックス内（既存の人物追加エリア付近）
- **ボタン種別**: ドロップダウン or 分割ボタンで5種を選択
  - 社内兼務追加
  - 本務出向受入（SF統合先）
  - 本務出向受入（SF非統合先）
  - 兼務出向受入（SF統合先）
  - 兼務出向受入（SF非統合先）
- **起動時の初期値**: `departmentCode` = その組織の externalCode、`businessUnit`〜`team` を自動セット
- **フォーム**: 既存の `OperationFormView` を再利用（新規追加モード）

---

## 実装状況

| 操作 | ドメイン層 | UI（組織ボタン） |
|---|---|---|
| ① 社内兼務追加 | ✓ ConcurrentAdd（コピー改修）+ ConcurrentAddNew（新規追加） | ✓ OrgPanel の＋ボタン → NewRowOperationModal |
| ② 本務出向受入新規（SF） | ✓ SecondmentInNewSF | ✓ 同上 |
| ③ 本務出向受入新規（非SF） | ✓ SecondmentInNewNonSF | ✓ 同上 |
| ④ 兼務出向受入新規（SF） | ✓ ConcurrentSecondmentInNewSF | ✓ 同上 |
| ⑤ 兼務出向受入新規（非SF） | ✓ ConcurrentSecondmentInNewNonSF | ✓ 同上 |
