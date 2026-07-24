# ポジション・人ドメインモデルと Excel 後方互換性

> 作成: 2026-05-23
> 対象: ドメイン設計・Excel インポート/エクスポート実装者

---

## 1. 基本概念

このアプリはポジション（席）と人（メンバー）を**独立したエンティティ**として扱う。

| エンティティ | ドメインキー | 説明 |
|------------|------------|------|
| **ポジション** | `positionCode` | 組織の中の「席」。人がいなくても存在できる |
| **人（メンバー）** | `groupEmployeeId`（= `userId`） | 従業員。ポジションがなくても組織にいられる |
| **配属** | — | ポジションと人の 1:1 紐付け関係 |

`AllocationRow` の主要フィールド（`rowId` / `positionCode` / `userId` / `departmentCode` / `prevXxx` 等）はルート `CLAUDE.md`「中心データ型: AllocationRow」節を参照。

---

## 2. AllocationRow の 4 状態

Excel の 1 行は「ポジション情報＋人情報」の合体行。ドメイン上は以下の 4 状態がある。

| positionCode | userId（groupEmployeeId） | ドメイン状態 | 説明 |
|-------------|--------------------------|------------|------|
| あり | あり | **在席** | ポジションに人が座っている |
| あり | なし | **空席ポジション** | 席はあるが人がいない |
| なし | あり | **未アサインメンバー** | 人はいるが席がない |
| どちらも削除フラグ | — | **削除済み** | Excel 出力で移動区分=削除 |

### 内部 positionCode の管理

- **Excel 由来**（`prevPositionCode` あり）: その値をそのまま `positionCode` に使用
- **内部作成**（`prevPositionCode` なし）: 内部採番 ID を `positionCode` に保持。プレフィックス `_pos_` で識別（例: `_pos_1234`）
- **出力時のルール**:
  - `prevPositionCode` が空 かつ 内部採番プレフィックス（`_pos_` 始まり）→ **blank 出力**
  - それ以外 → `positionCode` の値をそのまま出力
- **UI 表示**: 編集フォームでは内部採番 ID を表示しない（ユーザーが入力するまで空欄として扱う）

---

## 3. フィールドの色分け（FieldBinding）

各フィールドはポジション・人・配属・メタのいずれかに属する。操作時（移動・削除・紐付け解除）の挙動がこの分類で決まる。

```typescript
type FieldBinding =
  | 'position'    // ポジション連動: 席ごと移動、ポジション削除でblank
  | 'person'      // 人連動: 人と一緒に移動、人削除でblank
  | 'both'        // 両方連動: どちらが動いても追従
  | 'allocation'  // 紐付け属性: ポジション↔人の解除でリセット
  | 'meta'        // トランザクションメタ: 行固有、コピー対象外
```

### 各 binding の挙動まとめ

| FieldBinding | ポジション移動時 | 人移動時 | 紐付け解除時 | ポジション削除時 | 人削除時 |
|-------------|--------------|--------|------------|--------------|--------|
| `position` | 追従 | 追従しない | 残る | blank | 残る |
| `person` | 追従しない | 追従 | 残る | 残る | blank |
| `both` | 追従 | 追従 | 残る | blank | blank |
| `allocation` | — | — | **リセット** | リセット | リセット |
| `meta` | コピーしない | コピーしない | 残る | 残る | 残る |

### フィールド分類の代表例（正確な一覧は `allocationRow.ts` の `FIELD_METADATA` 参照）

| binding | 代表フィールド |
|---|---|
| `position` | positionCode, localJobTitle, officialPositionCode, departmentCode, managerPositionCode, positionBand, jobFamily, jobType, businessUnit〜team, location, costCenter |
| `person` | employmentType, band, payGrade, unionFlag, discretionaryWorkFlag, nonUnionAgreementFlag, leaveOfAbsenceSign |
| `allocation` | concurrentType, concurrentReason, secondmentFromCompany, secondmentFromEmployeeNumber, secondmentToCompany, managerName |
| `meta`（before 対応なし・行固有） | transferReason, memo, promotionSign, demotionReason, payGradeChangeSign, no, exclusionReason |

> **TODO**: 各フィールドの binding 分類は暫定。実際の HR 運用ルールに合わせて後から修正する（`fieldsByBinding(b)` ヘルパーで宣言的に取得できる設計にしてある）。

---

## 4. 各操作と AllocationRow への影響

空きポジションへの配属・空席化の詳細な行遷移（人基軸マージ・`leaveSourceVacant`・バンド上書き）は `docs/10-vacant-position.md` を正とする。要点のみ:

### 操作1: 人を外す（ポジション↔人の紐付け解除）

**Before**: 在席行 `{ positionCode: 'A', userId: 'P', ... }`

**After**: 1行 → 2行に分かれる

| 行 | 変化 |
|----|------|
| 空席行（元の行を更新） | `userId = undefined`、`allocation` フィールドをリセット |
| 未アサイン行（新規追加） | `positionCode = undefined`、`position` フィールドをblank、`person` フィールドは保持 |

**例外**: その人が同組織に兼務等の別行を既に持つ場合は未アサイン行の追加不要。実装: `UnassignPersonFromPositionOperation`（`commands/handlers/positionOps.ts`）。

### 操作2: 空席ポジションへの配属（人基軸マージ）

`assignPersonToVacant(personRow, vacantRow, ctx, options)` が実行する。**生き残るのは人行、削除されるのは空席行**（人は継続的に存在し、ポジションは人に紐づくという業務実態に合わせた設計）。ケース分岐（未アサイン人 / 在籍人・`leaveSourceVacant` の有無）は `docs/10-vacant-position.md` を参照。

### 操作3: ポジション新規作成

1. **作成ボタン** → 内部採番 `positionCode`（`_pos_xxxx`）+ `userId = undefined` の空席行を追加（`departmentCode` から `orgMasterEntries` を参照して `businessUnit`〜`team` を自動補完）
2. **人の配属** → 操作2（空席への配属）と同じフロー

### 操作4: 席ごと別組織移動（左枠ドラッグ）

- 行の `departmentCode` を変更し、`businessUnit`〜`team` を `orgMasterEntries` から自動補完
- `managerPositionCode` は意図的に維持する（担当者が手動で更新することを想定）。行数は変わらず、人も一緒に移動する
- 空席ポジション（`isVacant && !!positionCode`）もドラッグ可能。別組織パネルにドロップ → 上記と同じ。別のポジションカードにドロップ → `SetPositionManagerOperation` でレポートライン調整（`dragType: 'position'` + `fromRowId` で識別）

### 操作5a: ポジション削除

| 状態 | 処理 |
|------|------|
| **空席のポジション** | 行に削除フラグ。Excel 出力: 移動区分=削除 |
| **在席中のポジション** | ポジション行に削除フラグ ＋ **人の未アサイン行を新規追加**（人は有効のまま） |

削除済みポジションは「削除済みパネル」から復活可能（別の組織の空席に再配属、または削除フラグ解除で復元）。

### 操作5b: 人削除

| 条件 | 処理 |
|------|------|
| `prevUserId` が空（今セッションで追加した人） | 行を**物理削除**。Undo で復元可能 |
| `prevUserId` あり（既存社員） | 行に削除フラグ（ソフトデリート）。ポジションは空席化。Excel 出力: 移動区分=削除 |

物理削除はセッション中は Undo で復元できるが、確定出力・再インポート後は復元不可（再追加が必要）。`prevUserId` がない = before状態にいない人なので before側への影響はない。削除済みの人は「削除済みパネル」から有効な空席ポジションに再配属可能（`prevUserId` ありの場合のみ）。

---

## 5. Excel 後方互換性のルール

| フィールド | ルール |
|-----------|--------|
| `positionCode` | 内部採番（`_pos_` プレフィックス）→ blank 出力。Excel 由来またはユーザー入力あり → そのまま出力 |
| `groupEmployeeId` | 人のドメインキー。Excel 上の「グループ社員ID」列と対応 |
| `position` フィールド群 | ポジションが削除されたら blank |
| `person` フィールド群 | 人が削除されたら blank |
| `allocation` フィールド群 | 紐付けが解除されたらリセット（blank） |
| `meta` フィールド群 | 行固有。コピー対象外 |
| 移動区分（transferReason） | 削除された行 → `"削除"` を出力（`meta` フィールド） |

### 既存 Excel データとの互換

- `positionCode` が blank の既存行 → ドメイン上は「positionCode なし」として扱う（未アサイン or 旧来の在席行）
- `positionCode` がある既存行 → ポジションとして認識し、ポジションツリー構築に使用
- どちらの行も `userId` があれば「人」として認識し、操作可能

---

## 6. 実装状況

| # | 内容 | 状態 |
|---|---|---|
| 1 | `FIELD_METADATA` を `allocationRow.ts` に追加し、`BEFORE_AFTER_FIELD_PAIRS` を置き換え | ✅ 完了 |
| 2 | `unassignPersonFromPosition` を「1行→2行分割」モデルに修正 | ✅ 完了 |
| 3 | `assignPersonToVacantPosition` を人基軸マージモデルに修正 | ✅ 完了 |
| 4 | `createAndAssignPosition` を廃止し、「ポジション作成ボタン→空席にドロップ」の2ステップUIに変更 | ✅ 完了 |
| 5 | ポジション削除と人削除を独立した操作として実装（削除フラグ + 行分割） | ✅ 完了 |
| 6 | Excel 出力時の `positionCode` blank 判定（`_pos_` プレフィックスチェック） | ✅ 完了 |
| 7 | ポジション操作（作成・削除・配属・空席化）を `EditCommand` 化して Undo 対象に | ✅ 完了（`commands/handlers/positionOps.ts`） |
| 8 | `aiTools` にポジション操作を追加（AI から呼べるように） | ✅ 完了（`application/aiTools/write.ts`: `createVacantPosition` / `assignPersonToVacantPosition` / `removePosition` 等、`read.ts`: `findVacantPositions`） |
| 9 | 各フィールドの `binding` 分類を HR 運用ルールに合わせてレビュー・確定 | 🚧 暫定のまま |
| 10 | 削除済みパネル UI（削除済みポジション・人の復活操作） | 🚧 未着手 |
