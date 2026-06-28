# docs/10-vacant-position.md — 空きポジション操作

## 基本思想：人基軸（Person-centric）

空きポジション操作の基本思想は「**人行を基軸とする**」ことにある。

ポジションにアサインする（空席ポジションに人を乗せる）際：
- **生き残るのは人行**（`personRow.rowId`）。ポジション情報を人行に転記する。
- **削除されるのは空席行**（`vacantRow.rowId`）。

これは一見逆に見えるが、業務の実態に合っている。人は継続的に存在し、ポジションは人に紐づく。
空いているポジションとはあくまで「現在誰もいない席」にすぎない。

---

## 空きポジション操作の基本関数（positionVacant.ts）

`packages/domain/src/commands/defs/positionVacant.ts` にすべての基本関数を集約する。
各コンポーネント・コマンドはこれを呼び出して操作する。

### 判定関数

```typescript
isVacantPosition(row)    // positionCode あり + userId なし
isOccupiedPosition(row)  // positionCode あり + userId あり
isUnassignedPerson(row)  // userId あり + positionCode なし
```

### 空席化

```typescript
vacatePosition(row)              // 在席行 → 空席行（rowId 維持）
makeVacantRowFrom(row, list)     // 人行から新規 rowId の空席行を生成
```

`vacatePosition` がクリアするフィールド：

| フィールド種別 | 具体例 | 処理 |
|---|---|---|
| 人の身元 | userId / lastName / firstName / groupEmployeeId / employeeNumber | クリア |
| jobInfo binding | band / payGrade / employmentType / **concurrentType** / **concurrentReason** / secondment 系 | クリア |
| 操作メタ | transferReason / memo / promotionSign / payGradeChangeSign 等 | クリア |
| position binding | positionCode / officialPositionCode / managerPositionCode / positionBand 等 | **保持** |
| both binding | departmentCode / businessUnit / location 等 | **保持** |

> **重要**: `concurrentType` / `concurrentReason` は人の属性であり、ポジション情報ではない。
> 空席ポジションに本務・兼務区分はない。必ず `vacatePosition` でクリアする。

### バンド変更チェック

```typescript
wouldBandChange(personRow, vacantRow)
// → { from: string; to: string } | null
```

ポジションの `positionBand` と人の現在 `band` が異なる場合に差分を返す。
ダイアログ表示の判断に使い、ユーザーが上書き/維持を選択する。

### アサイン（人基軸マージ）

```typescript
assignPersonToVacant(personRow, vacantRow, ctx, options)
// → { updatedList, label }
```

#### ケース A：未アサイン人 → 空席ポジション

```
Before:
  [P] rowId=1, userId=U001, positionCode=undefined  ← 未アサイン人
  [V] rowId=2, positionCode=P001                    ← 空席

After:
  [P'] rowId=1, userId=U001, positionCode=P001      ← 人行に空席のポジション情報転記
  （V は削除）
```

#### ケース B：在籍人 → 空席ポジション

**leaveSourceVacant=true**（元ポジションを空席として残す）:

```
Before:
  [P] rowId=1, userId=U001, positionCode=P001  ← 在籍人（元ポジション）
  [V] rowId=2, positionCode=P002               ← 空席（移動先）

After:
  [P'] rowId=1, userId=U001, positionCode=P002  ← 人行を更新（新ポジション情報, 同 rowId）
  [S]  rowId=3, positionCode=P001               ← 元ポジションの空席行（新規 rowId）
  （V は削除）
```

**leaveSourceVacant=false**（元ポジションを残さない）:

```
After:
  [P'] rowId=1, userId=U001, positionCode=P002  ← 人行を更新（新ポジション情報）
  （V, P001 の行ともに消える）
```

`leaveSourceVacant` の判断は呼び出し側に委ねる（部下の有無など）。
デフォルトは `HRApplicationService.assignPersonToVacantPosition` が部下の有無で自動判定する。

#### バンド上書き

`overrideBand=true` を渡すと `positionBand → band → payGrade` の連鎖導出を実行する。
ドラッグによるアサイン時はバンド差分があれば確認ダイアログを表示し、ユーザーが選択する。

---

## コンポーネントから呼び出す方法

### ドラッグによるアサイン（空席スロットへのドロップ）

1. `useOrgDrag.handleDropOnVacantSlot` が `appService.checkAssignBandChange` でバンド差分を確認
2. 差分があれば `onBandChangeRequest` コールバックでダイアログを開く
3. ユーザーが「上書き」「維持」を選択し `assignPersonToVacantPosition(vacantRowId, sfId, opts)` を呼ぶ

### フォーム操作（MoveToVacantPosition）

`MoveToVacantPosition` オペレーションのフォームに「元のポジションを空席として残す」チェックボックスがある。
部下がいる場合はデフォルトでチェック済みになる。

### プログラムによるアサイン

```typescript
// leaveSourceVacant は部下の有無で自動判定、overrideBand は指定可
appService.assignPersonToVacantPosition(vacantRowId, personSfId)
// または明示指定
appService.assignPersonToVacantPosition(vacantRowId, personSfId, { leaveSourceVacant: true, overrideBand: true })
```

---

## フィールド転記ルール（ポジション → 人行）

| binding | フィールド | アサイン時の扱い |
|---|---|---|
| `position` | positionCode / officialPositionCode / localJobTitle / managerPositionCode / managerName / positionBand / positionUnionFlag / positionDiscretionaryWorkFlag / trainingPositionFlag | 空席行から転記（上書き） |
| `both` | departmentCode / businessUnit / division / subDivision / group / team / location / costCenter / jobFamily / jobType | 空席行から転記（上書き） |
| `jobInfo` | band / payGrade / employmentType / concurrentType 等 | **人行の値を保持**（overrideBand=true のとき band のみ positionBand で上書き） |
| 身元 | userId / lastName / firstName / groupEmployeeId / employeeNumber | **人行の値を保持** |
| メタ | transferReason / memo / promotionSign 等 | クリア |

---

## 実装ファイル一覧

| ファイル | 役割 |
|---|---|
| `packages/domain/src/commands/defs/positionVacant.ts` | 基本関数（vacatePosition / assignPersonToVacant / wouldBandChange 等） |
| `packages/domain/src/commands/handlers/positionOps.ts` | AssignPersonToPositionOperation・UnassignPersonFromPositionOperation |
| `packages/domain/src/commands/handlers/transferPerson.ts` | TransferPersonOperation（元ポジション空席化） |
| `packages/domain/src/commands/defs/positionMoveDefs.ts` | MoveToVacantPosition / SubordinateHandoff オペレーション |
| `apps/web/src/application/HRApplicationService.ts` | checkAssignBandChange / assignPersonToVacantPosition |
| `apps/web/src/components/canvas/hooks/useOrgDrag.ts` | ドラッグ時バンド変更チェック |
| `apps/web/src/components/canvas/OrgOperationView/index.tsx` | バンド変更確認ダイアログ |
