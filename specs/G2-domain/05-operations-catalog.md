# G2-05 業務操作カタログ

SummaryView の UI セクション順に全操作を列挙する。
新規行追加操作のフィールド要件マトリクスは §9 を参照。

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

> **本務出向の起動**: 本務行メニューの「本務出向」は **SecondmentOutChooser**（出向先会社名入力・SF判定画面）を経由する。
> SF統合先と判定された場合にのみ以下の SF フォームへ進む。詳細は `specs/G2-domain/06-secondment-rules.md#6` 参照。

| ID | ラベル | 種別 | 起動元 | 状態 |
|---|---|---|---|---|
| `SecondmentOutSF` | 本務出向（SF統合先） | 行変更 | 本務行メニュー「本務出向」→ SecondmentOutChooser → SF判定 | ✓ |
| `SecondmentOutReleaseSF` | 本務出向解除（SF導入先） | 行変更 | 出向中行のメニュー | ✓ |
| `SecondmentInSF` | 本務出向受入（SF統合先）※既存行上書き | 行変更 | 既存行のメニュー | ✓ |
| `SecondmentInNewSF` | 本務出向受入 新規（SF） | 行追加 | 組織パネルの追加ボタン | ✓ |
| `SecondmentInReleaseSF` | 本務出向受入解除（SF導入先） | 行変更 | 受入中行のメニュー | ✓ |
| `SecondmentInCancel` | 本務出向受入取消（SF/SF外共通） | 行削除 | 受入中行のメニュー | ✓ |
| `ConcurrentSecondmentOutNonSF` | 兼務出向（SF外のみ対象） | 行追加 | 本務行のメニュー | ✓ |
| `ConcurrentSecondmentOutReleaseSF` | 兼務出向解除（SF導入先） | 行削除 | 兼務出向行のメニュー | ✓ |
| `ConcurrentSecondmentInReleaseSF` | 兼務出向受入解除（SF導入先） | 行削除 | 兼務受入行のメニュー | ✓ |
| `ConcurrentSecondmentInCancel` | 兼務受入取消（共通） | 行削除 | 兼務受入行のメニュー | ✓ |

---

## 6. 出向・出向解除（SF未導入会社）

> **本務出向の起動**: 本務行メニューの「本務出向」は **SecondmentOutChooser** 経由。
> SF外（未統合）と判定された場合に以下の 2行フォーム（`nonSFSecondmentOutDef`）へ進む。

| ID | ラベル | 種別 | 起動元 | 状態 |
|---|---|---|---|---|
| `NonSFSecondmentOut`（multiRow） | 本務出向（SF外・2行） | 行変更＋行追加 | 本務行メニュー「本務出向」→ SecondmentOutChooser → SF外判定 | ✓ |
| `SecondmentOutReleaseNonSF` | 本務出向解除（SF未導入先） | 行変更 | 出向中行のメニュー | ✓ |
| `SecondmentInNonSF` | 本務出向受入（SF非統合先）※既存行上書き | 行変更 | 既存行のメニュー | ✓ |
| `SecondmentInNewNonSF` | 本務出向受入 新規（非SF） | 行追加 | 組織パネルの追加ボタン | ✓ |
| `SecondmentInReleaseNonSF` | 本務出向受入解除（SF未導入先） | 行変更 | 受入中行のメニュー | ✓ |
| `ConcurrentSecondmentOutReleaseNonSF` | 兼務出向解除（SF未導入先） | 行削除 | 兼務出向行のメニュー | ✓ |
| `ConcurrentSecondmentInReleaseNonSF` | 兼務出向受入解除（SF未導入先） | 行削除 | 兼務受入行のメニュー | ✓ |

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

SummaryView には表示されない。組織パネルのボタンから起動する（`ConcurrentAddNew` のみ本務行メニューからのコピー追加にも対応）。
フィールド要件マトリクスは §9 参照。

| ID | ラベル | 起動元 | 状態 |
|---|---|---|---|
| `ConcurrentAddNew` | 社内兼務追加（新規/コピー） | 組織パネルの追加ボタン / 本務行のメニュー | ✓ |
| `SecondmentInNewSF` | 本務出向受入 新規（SF） | 組織パネルの追加ボタン | ✓ |
| `SecondmentInNewNonSF` | 本務出向受入 新規（非SF） | 組織パネルの追加ボタン | ✓ |
| `ConcurrentSecondmentInNewSF` | 兼務出向受入 新規（SF） | 組織パネルの追加ボタン | ✓ |
| `ConcurrentSecondmentInNewNonSF` | 兼務出向受入 新規（非SF） | 組織パネルの追加ボタン | ✓ |

---

## 9. 新規行追加操作 フィールド要件マトリクス

上記5操作（`ConcurrentAddNew` / `SecondmentInNewSF` / `SecondmentInNewNonSF` / `ConcurrentSecondmentInNewSF` / `ConcurrentSecondmentInNewNonSF`）に共通するフィールド仕様。

### 共通フィールド仕様

| フィールド | 新規追加デフォルト | コピー追加デフォルト | 必須 | 編集可 |
|---|---|---|---|---|
| `lastName` / `firstName` | 空 | src コピー | **必須** | 可 |
| `groupEmployeeId` / `employeeNumber` | 空 | src コピー | 任意 | 不可（表示） |
| `userId` | 空 | **空**（SF では兼務でも別 ID が発行される） | 任意 | 可 |
| `positionCode` | 新規採番 `_pos_XXX` | 新規採番 | 自動 | 可 |
| `departmentCode` | 組織ボタンから引き継ぎ | 空（picker 必須） | 任意 | 可（picker） |
| `businessUnit`〜`team` | departmentCode から自動導出 | 同左 | 自動 | 不可 |
| `positionBand` | 空 | **空**（src 引き継がない） | 任意 | 可（絞り込みなし） |
| `jobFamily` / `jobType` | 空 | src コピー | 任意 | 可 |
| `officialPositionCode` | 空 | 空 | 任意 | 可 |
| `trainingPositionFlag` | `'0'`（いいえ） | `'0'` | 自動 | 可 |
| `positionUnionFlag` / `unionFlag` | 空 | 空 | 任意 | 可 |
| `employmentType` | 空（操作別デフォルトあり） | src コピー（操作別制約あり） | 任意 | 操作による |

> **最低保存条件**: `lastName` + `firstName` + `concurrentType`（自動）があれば保存可。AI 検索が氏名を使用するため氏名は必須。他フィールドは後から担当者が記入するケースあり。
> `concurrentType` は操作により固定値（`ConcurrentAddNew`系=兼務／その他=空）。`concurrentReason` は各操作とも任意入力。

### 操作別の差分

| 操作 | concurrentType | employmentType 候補フィルタ | secondmentFromCompany | secondmentFromEmployeeNumber | band/payGrade フィルタ |
|---|---|---|---|---|---|
| `ConcurrentAddNew`（社内兼務追加） | `'兼務'`（固定） | — | — | — | `isConcurrent=true` |
| `SecondmentInNewSF`（本務出向受入・SF） | 空（本務） | `isSecondmentAcceptance=true` | **必須** | **必須**（SFは社員番号で名寄せ） | `isSecondmentAcceptance=true` |
| `SecondmentInNewNonSF`（本務出向受入・非SF） | 空（本務） | `isSecondmentAcceptance=true` | **必須** | 任意（非SFは社員番号不明のケースあり） | `isSecondmentAcceptance=true` |
| `ConcurrentSecondmentInNewSF`（兼務出向受入・SF） | `'兼務'`（固定） | `isSecondmentAcceptance=true` | **必須** | **必須** | `isConcurrent=true`（出向受入でも兼務バンド適用） |
| `ConcurrentSecondmentInNewNonSF`（兼務出向受入・非SF） | `'兼務'`（固定） | `isSecondmentAcceptance=true` | **必須** | 任意 | `isConcurrent=true` |

いずれも `positionBand` の絞り込みはなし。

### 組織パネル 追加ボタン UI 仕様

- 場所: キャンバス上の各組織ボックス内。ドロップダウン/分割ボタンで5種を選択
- 起動時の初期値: `departmentCode` = その組織の externalCode、`businessUnit`〜`team` を自動セット
- フォームは既存の `OperationFormView`（新規追加モード）を再利用
