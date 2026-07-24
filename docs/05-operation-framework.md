# 操作フレームワーク設計思想

## 背景と制約

本システムは **Excel を主要データ交換フォーマット** として使用する。
Excel にはデータは残るが「いつ・誰が・何の目的で行ったか」という操作メタデータは残らない。

この制約から以下の設計思想を採用する。

> **データが操作の証拠になる（操作を保存せず、検出する）**

一般的な Event Sourcing（操作→データを導出）とは逆の、
**データ差分 → 操作の逆引きアーキテクチャ** である。

---

## 3 つの概念

### 1. EditPattern（分類ラベル）

単一行のデータ差分から「何の操作があったはずか」を分類するタグ。

| 値 | 意味 |
|---|---|
| `orgTransfer` | 組織異動 |
| `promotionDemotion` | 昇降格 |
| `jobTypeChange` | ジョブタイプ変更 |
| `resignation` | 退職 |
| `vacantPositionMove` | ポジション異動 |
| `secondmentRelease` | 出向解除 |

- **操作の実体ではない。表示・集計・メニューの語彙である。**
- UI のバッジ・操作メニュー・レビュー件数集計に使用する。
- Excel インポート後でも確定的に検出できることが設計上の要件。
- 実装: `packages/domain/src/patterns/editPatterns.ts`

### 2. EditCommand（単行の原子操作）

1 人・1 行への変更を表すオブジェクト。GoF Command パターン。インターフェース定義・実装テンプレートはルート `CLAUDE.md`「単一操作の追加」節を参照（`kind` / `validate(ctx)` / `apply(ctx)`）。

- 実装: `packages/domain/src/commands/types.ts`（旧 `IDomainOperation`）
- **UndoStack への差分積み上げ単位。** ポートとして公開される。

### 3. EditScenario（複合操作・入力マクロ）

1 件以上の EditCommand を業務意図でまとめた複合操作。GoF Scenario パターン。

```typescript
interface EditScenario {
  readonly label: string              // 業務名称（「部長交代」「Aの昇格」）
  readonly commands: EditCommand[]    // 1件でも複数件でも同じ構造
}
```

- **ポートとして公開される統一実行インターフェース。**
- 実行時に各 Command を順次 validate → apply し、結果を1つの StatePatch に集約して UndoStack へ積む。
- 全 Command に同一 `txId` を付与する（履歴パネル・将来のグループ Undo 用）。
- EditScenario オブジェクト自体は永続化しない。

**例: 玉突き人事**
```
EditScenario「部長交代」
  ├─ ResignationOperation       { rowId: A }   // EditPattern: 'resignation'
  ├─ VacantPositionMoveOperation{ rowId: B }   // EditPattern: 'vacantPositionMove'
  └─ VacantPositionMoveOperation{ rowId: C }   // EditPattern: 'vacantPositionMove'

EditScenario「Aの昇格」
  └─ PromotionOperation         { rowId: A }   // 1件でも同じ構造
```

---

## ポート公開

```typescript
// HRApplicationService（統一実行エントリポイント）
appService.executeScenario(macro: EditScenario): ValidationResult
appService.executeOperation(op: EditCommand): ValidationResult  // 後方互換・内部で1件Macroに委譲
```

UI・AI ともにこの 2 メソッドを通じて操作を実行する。
呼び出し側はコマンド配列を直接組み立てず、ドメインが定義した具体的な
EditCommand 実装を使用する。

---

## リストア可能性の保証

> **バリデーションがリストア保証の証明になる**

- すべての変更行が EditPattern として検出可能であること = バリデーション通過条件
- 検出できない変更（EditPattern 不明）→ バリデーションエラー
- **バリデーションを通過した Excel は、操作として必ず再構成できる**

EditPattern 検出設計とバリデーション設計は **対になって機能する**。
片方だけ拡張すると保証が崩れるため、必ずセットで追加する。

---

## 操作フロー

**App ネイティブ操作（UI / AI）**:
`EditScenario`（label + EditCommand[]）→ validate（各 Command を順に検証。前 Command の適用結果を次の検証 Context に反映）→ txId 発行（同一 Scenario の全 Command に同じ txId）→ apply（順に適用。中間状態を次の Command の Context として渡す）→ `UndoStack.push`（全差分を1つの StatePatch に集約）→ emit（Zustand 再同期）。

**Excel インポート（後方互換）**:
Excel（データのみ・操作メタデータなし）→ データ差分検出 → EditPattern 検出（単行・確定的）+ positionCode 継承チェーン追跡（複数行の cascade 候補）→ バリデーション（EditPattern 未検出の変更行 → エラー。リストア保証の維持）→ レビュー画面でグループ表示（確認不要・自動・全件）。

cascade 検出はヒューリスティックだが、**バリデーションが「検出不能なパターンを保存させない」**制約として機能するため、保存済みのデータは 100% 検出可能となる。

---

## EditPattern 検出アーキテクチャ

各 EditPattern には `detect()` 関数が定義されており、行データと `DetectContext` を受け取って `boolean` を返す。

```typescript
// packages/domain/src/patterns/detection/helpers.ts
interface DetectContext extends DomainContext {
  readonly sameOrgPairs?: Set<string>   // 組織改変ペア（orgRestructure 判定用）
}

// ctx.codeLists.transferReasons の noCheckRequired フラグを確認
function isNoCheckReason(row: AllocationRow, ctx: DetectContext): boolean
```

- **`noCheckRequired`**: `transferReason` マスタで `true` のとき、フィールド差分ではなく `transferReason` の値そのものでパターンを判定する（業務上「異動事由だけ入れれば十分」な操作）
- **`sameOrgPairs`**: 組織コードが変わっても同一組織の改称/統合のペアを Set で渡す。`orgRestructure` はペア内の移動、`orgTransfer` はペア外の移動として区別する
- `detectPatterns(row, ctx?)` が全パターンを走査し `RowChanges` を返す。`ctx` 省略時は空コンテキストで動作（フィールド差分のみ判定）

各グループの `detect()` 実装は `packages/domain/src/patterns/defs/` に配置する。

---

## MultiRowOperationDef（2行以上の複合フォーム）

`EditOperation`（単一フォーム）では対応できない複数行を同時に操作するケースには `MultiRowOperationDef` を使う。

```typescript
interface MultiRowOperationDef {
  id:               string
  label:            string
  description?:     string
  affectedRowCount?: number        // フッターに「実行（N行）」と表示する行数
  sections:         MultiRowFormSection[]
  createCommand: (anchorRowId: number, sectionValues: Record<string, string>[], ctx: DomainContext) => EditCommand
  availableFor:     (row: AllocationRow, ctx: DomainContext) => boolean
}
```

**現在の使用例**: `nonSFSecondmentOutDef`（SF外 本務出向・2行セット操作）

### overrideSectionVals によるルーティング渡し

`SecondmentOutChooser` のように別ステップで入力した値を `MultiRowFormView` に渡す場合、`PanelView` 型（`PersonOperationPanel/types.ts`）の `{ multiRowDef; rowId; overrideSectionVals?: Partial<Record<string, string>>[] }` バリアントでセクション別初期値を注入できる（他のバリアント: `'summary'` / `'directEdit'` / `{ def: EditOperation; rowId }` / `{ chooser: 'secondmentOut'; rowId }` = SF判定ルーティングステップ）。

---

## 排他ロック（operationRole）

行レベルの操作排他制御。特定の操作が実行済みの行で、他の操作を抑止する仕組み。`kind: 'lock' | 'lockCancel' | 'normal'` の基本形と `isActive` / `isActiveThisSession` の使い分けはルート `CLAUDE.md`「排他ロック（operationRole）」節を参照。以下は `resolveAvailability` の詳細ロジックと `softLock`（CLAUDE.md 未収録）。

### `resolveAvailability` のロジック

`resolveAvailability(def, row, masters)` がメニュー表示・AI ツールの可否を判定する。

```
ロック中の行に対して:
  → lockCancel（of === activeLock.id）         → 許可
  → 同一操作（def.id === activeLock.id）        → 許可（ロック中でも再編集可）
  → それ以外の全操作                             → 「〇〇が設定中のため他の操作はできません」でブロック
```

**重要**: ロックがかかっていても**同じ操作を再実行して値を修正することはできる**。例：「4/1付休職」設定後にフォームを再度開いてメモを修正するのは許可される。

### 現在の lock 操作一覧

| 操作 ID | ロック条件（`isActiveThisSession`） | 取消操作 |
|---|---|---|
| `LeaveOfAbsence` | `leaveOfAbsenceSign && !prevLeaveOfAbsenceSign` | `LeaveOfAbsenceCancel` |
| `ReturnFromLeave` | `!leaveOfAbsenceSign && prevLeaveOfAbsenceSign` | `ReturnFromLeaveCancel` |
| `EmploymentTransfer` | `transferReason === 移籍 && !prevTransferReason` | `EmploymentTransferCancel` |
| `NoChange` | `transferReason === 変更なし && !prevTransferReason` | `NoChangeCancel` |
| `EmploymentExtension` | 雇用延長フラグ条件 | — |

### `softLock`（緩やかな排他ロック）

`lock`（strict）とは別に、**他のロック系操作のみをブロックし、通常操作は通す**第3の排他モードが存在する（`packages/domain/src/commands/defs/index.ts` の `resolveAvailability`）。

```typescript
operationRole: {
  kind:        'softLock',
  ownedFields: ['transferReason', 'leaveOfAbsenceSign'],  // この softLock が「所有」するフィールド
  isActive:            (row) => !!row.leaveOfAbsenceSign,
  isActiveThisSession: (row) => !!row.leaveOfAbsenceSign && !row.prevLeaveOfAbsenceSign,
}
```

`resolveAvailability` での扱い（strict lock との違い）:

| ロック種別 | 他の lock/softLock 操作 | 通常操作 |
|---|---|---|
| `lock`（strict） | ブロック | ブロック |
| `softLock` | ブロック | **許可**（`availableFor` を通過すれば実行できる） |

softLock は「他のロック操作とは競合させたいが、通常の編集までは止めたくない」場面で使う。ただし通常操作が softLock の `ownedFields` を上書きしてしまうと矛盾したデータになるため、`OperationFormView`（`apps/web/.../PersonOperationPanel/OperationFormView/index.tsx`）側で二重に防止している: **表示**（アクティブな softLock の `ownedFields` に該当する入力欄を readOnly 表示）と、**送信直前**（`onSubmit` 実行の直前に `ownedFields` の値を行の現在値で強制的に上書きし、フォーム側の入力が誤って書き換えてもデータには反映されないようにする）。

**現在 `softLock` を使っている操作**: `SecondmentOutSF`／`SecondmentOutNonSF`（`secondmentMainDefs.ts`）、`LeaveOfAbsence`／`ReturnFromLeave`（`personDefs.ts`）

---

## EditOperation の補足フラグ

`supportsLeaveVacant` / `description` / `inputs[].inputType: 'checkbox'` の一覧はルート `CLAUDE.md`「`EditOperation` の補足オプション」節を参照（正）。

---

## EditOperation フォームライフサイクル

`EditOperation` は UI フォームのライフサイクルに対応するメソッドを持つ。

| タイミング | メソッド | 説明 |
|---|---|---|
| フォームを開いたとき | `onOpen(row, ctx)` | 初期フィールド値を計算する（プレビュー用・UndoStack 非対象） |
| フィールド変更時 | `onFieldChange?.[field](value, ctx)` | 操作固有のサイドエフェクトを返す。`deriveFieldUpdates` の後に実行される |
| 実行ボタン押下 or ドライラン | `createCommand(rowId, values)` | `validate(ctx)` / `apply(ctx)` を持つ `EditCommand` を返す |

### `createCommand` の設計意図

以前の設計では `onValidate(ctx, rowId, values)` / `onSubmit(ctx, rowId, values)` が分離されていた。
現設計では **`createCommand(rowId, values): EditCommand`** が両方を束縛したオブジェクトを返す。

```typescript
// EditOperation から EditCommand を生成（副作用なし）
const cmd = def.createCommand(rowId, values)

// バリデーションのみ（ドライラン）
const result = cmd.validate(ctx)  // apply() を呼ばなくても検証できる

// 実行
if (result.ok) appService.executeOperation(cmd)
```

**これにより以下が可能になる**：

- **UI ドライラン**: `QuickEditDialog` でフォーム変更のたびに `createCommand().apply(ctx)` を呼び、
  副作用フィールド（昇格サイン等）の変化をプレビューしてユーザーに確認を求める。
- **AI ドライラン**: AI ツールが操作を提案する前に `validate(ctx)` を呼んで安全に事前検証できる。
  実行に失敗するような提案を AI が確信を持って出さなくなる。
- **バッチ修正**: `ValidationResolutionDef.createCommand` と同一インターフェースのため、
  問題フィールドの一括修正フローが `EditOperation` と共通のコードパスで動く。

### `FieldChangeEffect` 型

`onFieldChange` ハンドラが返す型。

```typescript
type FieldChangeEffect = {
  setValues?:            Partial<AllocationRow>       // 追加でセットするフィールド値（deriveFieldUpdates を上書き）
  openPickerFor?:        keyof AllocationRow          // 自動的に開くピッカー対象フィールド
  openPickerInitialOrg?: string                       // ピッカーを開く際の初期選択組織 ID
  suggestFieldValue?:    { field: keyof AllocationRow; value: string }  // 別フィールドへの値提案
  suppressDerive?:       boolean                      // true のとき deriveFieldUpdates をスキップ
}
```

---

## ValidationResolutionDef（バリデーション問題の一括修正定義）

`packages/domain/src/rules/resolve/` で管理する。
バリデーション問題（`ValidationIssue`）を「どのフィールドをどう変えれば解決できるか」と対応させる定義群。

```typescript
interface ValidationResolutionDef {
  id:         string
  shortLabel: string                   // ≤8文字。フィルタバッジ・セレクト用
  field:      keyof AllocationRow      // 修正対象フィールド
  level:      'error' | 'warning'
  match(issue: ValidationIssue): boolean
  suggestValue?(row: AllocationRow): string | undefined   // 自動提案値（省略可）
  createCommand(rowId: number, values: Partial<AllocationRow>): EditCommand
}
```

**`EditOperation` との対応関係**:

| 概念 | 役割 |
|---|---|
| `EditOperation` | UI フォーム全体のメタデータ（availableFor / inputs / onOpen / createCommand） |
| `ValidationResolutionDef` | 問題解決に特化した軽量バージョン（match / suggestValue / createCommand のみ） |

どちらも `createCommand(rowId, values): EditCommand` を返す点で統一されている。

**使用フロー**: ① `[...RESOLUTION_DEFS].reverse().find(d => d.match(issue))` で問題を ResolutionDef に照合 → ② `dryRunResolution(def, row, suggestedValue, ctx)` でドライラン（`{ ok, updatedRow, changedFields }` を副作用なしで返す。UI の確認表示に使う）→ ③ 確定したら `def.createCommand(rowId, { [def.field]: confirmedValue })` を `cmd.validate(ctx).ok` 確認の上 `appService.executeOperation(cmd)` で実行。

`RESOLUTION_DEFS` は後ろから検索することで、汎用定義より特化定義が先にマッチする（例: `officialPositionCode` の error 全般 → `officialPos-error`、出向関連の同フィールド → `officialPos-secondment`）。

---

## 拡張方法

新しい業務操作を追加する手順（1〜7 はルート `CLAUDE.md`「新しい操作を追加するときの手順」節と同一。守るべき順序はそちらを正とする）。本書からの追加事項:

8. TDD ガイドに従ってテストを追加（`docs/07-tdd-guide.md`）

手順 4（バリデーションへの検出条件追加）を省略するとリストア保証が崩れるため、EditPattern 追加とバリデーション追加は **必ずセットで行う**（詳細は本書冒頭「リストア可能性の保証」節）。
