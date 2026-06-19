# G2-05 業務操作カタログ

SummaryView の UI セクション順に全操作を列挙する。
詳細な新規行追加操作の要件は `04-new-row-operations.md` を参照。

---

## 凡例

- **行変更**: 既存行のフィールドを上書きする操作
- **行追加**: 新しい AllocationRow を生成する操作
- **行削除**: 既存行を allocationList から除去する操作
- `✓` 実装済み / `✗` 未実装 / `△` 要改修

---

## 1. 昇降格・役職変更

| ID | ラベル | 種別 | 主な変更フィールド | 状態 |
|---|---|---|---|---|
| `Promotion` | 昇格 | 行変更 | positionBand, officialPositionCode, localJobTitle, band, payGrade | ✓ |
| `Demotion` | 降格 | 行変更 | positionBand, officialPositionCode, localJobTitle, band, payGrade, demotionReason | ✓ |
| `TitleChange` | 役職変更（昇降格なし） | 行変更 | officialPositionCode, localJobTitle | ✓ |

### 備考
- 昇格・降格は `deriveFieldUpdates` により band → payGrade を自動連動
- 発令前（prevXxx）は右列 readonly で表示。変更時のみ差分行を表示

---

## 2. 職務内容・雇用形態

| ID | ラベル | 種別 | 主な変更フィールド | 状態 |
|---|---|---|---|---|
| `JobTypeChange` | ジョブタイプ変更 | 行変更 | jobFamily, jobType, payGrade | ✓ |
| `EmploymentExtension` | 雇用延長 | 行変更 | employmentType, band, payGrade, positionBand | ✓ |
| `EmploymentTypeChange` | 雇用タイプ変更 | 行変更 | employmentType | ✓ |

### 備考
- `JobTypeChange` に payGrade を追加済み（jobType 変更で給与等級が変わるケースに対応）

---

## 3. 組織への異動

| ID | ラベル | 種別 | 主な変更フィールド | 状態 |
|---|---|---|---|---|
| `OrgTransfer` | 社内異動 | 行変更 | departmentCode + 組織サブフィールド群, transferReason | ✓ |
| `OrgRestructure` | 組織改変 | 行変更 | departmentCode + 組織サブフィールド群（組織統廃合時） | ✓ |
| `ManagerChange` | 上司変更 | 行変更 | managerPositionCode, managerName | ✓ |

---

## 4. 兼務

| ID | ラベル | 種別 | 起動元 | 状態 |
|---|---|---|---|---|
| `ConcurrentAdd` | 社内兼務追加（コピー） | 行追加 | 本務行のメニュー | ✓ 改修済み |
| `ConcurrentAddNew` | 社内兼務追加（新規） | 行追加 | 組織パネルの追加ボタン | ✓ |
| `ConcurrentRelease` | 社内兼務解除 | 行削除 | 兼務行のメニュー | ✓ |

### 備考
- コピー追加: 本務行から姓・名・groupEmployeeId・employeeNumber・employmentType・jobFamily・jobType をコピー。userId・positionCode は引き継がない
- 新規追加: 組織ボタン起動。departmentCode のみ初期セット
- 最低保存条件: lastName + firstName（AI 検索が氏名を使用するため）
- band/payGrade は `isConcurrent=true` の選択肢で絞り込み

---

## 5. 出向・出向解除（SF導入会社）

| ID | ラベル | 種別 | 起動元 | 状態 |
|---|---|---|---|---|
| `SecondmentOutSF` | 本務出向（SF統合先） | 行変更 | 本務行のメニュー | ✓ |
| `SecondmentOutReleaseSF` | 本務出向解除（SF導入先） | 行変更 | 出向中行のメニュー | ✓ |
| `SecondmentInSF` | 本務出向受入（SF統合先）※既存行上書き | 行変更 | 既存行のメニュー | ✓ |
| `SecondmentInNewSF` | 本務出向受入 新規（SF） | 行追加 | 組織パネルの追加ボタン | ✓ |
| `SecondmentInReleaseSF` | 本務出向受入解除（SF導入先） | 行変更 | 受入中行のメニュー | ✓ |
| `SecondmentInCancelSF` | 本務出向受入取消（SF導入先） | 行削除 | 受入中行のメニュー | ✓ |
| `ConcurrentSecondmentOutSF` | 兼務出向（SF統合先） | 行追加 | 本務行のメニュー | ✓ |
| `ConcurrentSecondmentOutReleaseSF` | 兼務出向解除（SF導入先） | 行削除 | 兼務出向行のメニュー | ✓ |
| `ConcurrentSecondmentInSF` | 兼務出向受入（SF統合先）※既存行コピー | 行追加 | 本務行のメニュー | ✓ |
| `ConcurrentSecondmentInNewSF` | 兼務出向受入 新規（SF） | 行追加 | 組織パネルの追加ボタン | ✓ |
| `ConcurrentSecondmentInReleaseSF` | 兼務出向受入解除（SF導入先） | 行削除 | 兼務受入行のメニュー | ✓ |
| `ConcurrentSecondmentInCancelSF` | 兼務出向受入取消（SF導入先） | 行削除 | 兼務受入行のメニュー | ✓ |

---

## 6. 出向・出向解除（SF未導入会社）

| ID | ラベル | 種別 | 起動元 | 状態 |
|---|---|---|---|---|
| `SecondmentOutNonSF` | 本務出向（SF非統合先） | 行変更 | 本務行のメニュー | ✓ |
| `SecondmentOutReleaseNonSF` | 本務出向解除（SF未導入先） | 行変更 | 出向中行のメニュー | ✓ |
| `SecondmentInNonSF` | 本務出向受入（SF非統合先）※既存行上書き | 行変更 | 既存行のメニュー | ✓ |
| `SecondmentInNewNonSF` | 本務出向受入 新規（非SF） | 行追加 | 組織パネルの追加ボタン | ✓ |
| `SecondmentInReleaseNonSF` | 本務出向受入解除（SF未導入先） | 行変更 | 受入中行のメニュー | ✓ |
| `SecondmentInCancelNonSF` | 本務出向受入取消（SF未導入先） | 行削除 | 受入中行のメニュー | ✓ |
| `ConcurrentSecondmentOutNonSF` | 兼務出向（SF非統合先） | 行追加 | 本務行のメニュー | ✓ |
| `ConcurrentSecondmentOutReleaseNonSF` | 兼務出向解除（SF未導入先） | 行削除 | 兼務出向行のメニュー | ✓ |
| `ConcurrentSecondmentInNonSF` | 兼務出向受入（SF非統合先）※既存行コピー | 行追加 | 本務行のメニュー | ✓ |
| `ConcurrentSecondmentInNewNonSF` | 兼務出向受入 新規（非SF） | 行追加 | 組織パネルの追加ボタン | ✓ |
| `ConcurrentSecondmentInReleaseNonSF` | 兼務出向受入解除（SF未導入先） | 行削除 | 兼務受入行のメニュー | ✓ |
| `ConcurrentSecondmentInCancelNonSF` | 兼務出向受入取消（SF未導入先） | 行削除 | 兼務受入行のメニュー | ✓ |

---

## 7. 在籍・退職

| ID | ラベル | 種別 | 主な変更フィールド | 状態 |
|---|---|---|---|---|
| `LeaveOfAbsence` | 休職 | 行変更 | leaveOfAbsenceSign, transferReason | ✓ |
| `LeaveOfAbsenceCancel` | 休職取消 | 行変更 | leaveOfAbsenceSign, transferReason をクリア | ✓ |
| `ReturnFromLeave` | 復職 | 行変更 | leaveOfAbsenceSign クリア, transferReason | ✓ |
| `EmploymentTransferOut` | 移籍（出る） | 行変更 | transferReason, 移籍先組織コード | ✓ |
| `EmploymentTransferIn` | 移籍（入る） | 行追加 | lastName, firstName, transferReason, departmentCode 等 | ✓ |
| `NoChange` | 変更なし | 行変更 | transferReason = '変更なし' を明示的にセット | ✓ |

---

## 8. 組織パネルからの新規行追加（追加ボタン）

SummaryView には表示されない。組織パネルのボタンから起動する。
詳細フィールド仕様は `04-new-row-operations.md` を参照。

| ID | ラベル | 状態 |
|---|---|---|
| `ConcurrentAddNew` | 社内兼務追加（新規） | ✓ |
| `SecondmentInNewSF` | 本務出向受入 新規（SF） | ✓ |
| `SecondmentInNewNonSF` | 本務出向受入 新規（非SF） | ✓ |
| `ConcurrentSecondmentInNewSF` | 兼務出向受入 新規（SF） | ✓ |
| `ConcurrentSecondmentInNewNonSF` | 兼務出向受入 新規（非SF） | ✓ |
