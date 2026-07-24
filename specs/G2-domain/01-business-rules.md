# G2-01 業務ルール定義

> **目的**: 変更検知・バリデーション・AI判断・UIロジックの根拠となる業務ルールを記述する。
> 実装済みのルールは「✓」、業務確認待ちは「❓」、実装予定は「TODO」で示す。
>
> **参照先**
> - 変更検知実装: `src/domain/review/changeDetection.ts`
> - バリデーション実装: `src/domain/validation/validateRow.ts`
> - 関連spec: `specs/G2-domain/02-validation-rules.md`

---

## 1. 変更種別（ChangeKind）の定義

変更検知は `detectChanges()` が `RowChanges.kinds: Set<ChangeKind>` を返す。複数同時成立する。

| ChangeKind | 表示名 | 成立条件（実装済み） | 備考 |
|---|---|---|---|
| `transfer` | 異動 | 組織コードが変わった かつ 新旧対応組織のペアではない | ✓ 実装済み。orgMappingで対応関係を判定 |
| `promotion` | 昇級 | bandまたはpositionBandが上がった | ✓ 実装済み。transferと同時成立あり |
| `demotion` | 降級 | bandまたはpositionBandが下がった | ✓ 実装済み。transferと同時成立あり |
| `titleChange` | 役職変更 | officialPositionCodeが変わった | ✓ 実装済み |
| `newHire` | 新規採用 | prevDepartmentCodeが空 かつ departmentCodeあり | ✓ 実装済み |
| `termination` | 退職 | departmentCodeが空 かつ prevDepartmentCodeあり | ✓ 実装済み |

### 1.1 transfer の判定詳細

`orgMapping`（旧組織ID → 新組織ID[]）から `"prevExternalCode|afterExternalCode"` の Set（`sameOrgPairs`）を構築し、`departmentCode != prevDepartmentCode` かつ `sameOrgPairs` に含まれない場合のみ transfer とする。旧組織・新組織が対応関係にある場合は transfer を付与しない（同一組織内の昇降格として扱う）。

### 1.2 promotion / demotion と transfer の同時成立

- **transfer + promotion/demotion**: 組織をまたいで昇降格した → 「異動+昇級/降級」
- **promotion/demotion のみ**: 同一（対応）組織内でバンドが変わった → 「昇級/降級」（新ポジション必須 ← validateRow参照）

---

## 2. ポジションライフサイクルルール

### 2.1 昇級・降級時のポジション扱い

**✓ 確定ルール**: 昇級・降級（promotion / demotion）が発生した場合、同一のポジションコードを継続使用しない。新ポジションに登録し直す。`validateBandChangeRequiresNewPosition` が「promotion/demotion かつ transferなし かつ positionCode未変更」を ERROR で検出する。

### 2.2 異動時のポジション扱い

❓ **業務確認待ち**: 異動時、ポジションコードは新組織で新規作成か、旧コードを引き継ぐか？

### 2.3 空席ポジション

- `positionCode` あり + `userId` なし → 空席
- 空席は Excel 出力時にも出力される
- `_pos_` prefix = ツール内部採番（Excel出力時は blank になる）

---

## 3. 上司関係ルール

### 3.1 managerName の導出

**✓ 確定ルール**: `managerName` は `managerPositionCode` に在席している人物（`allocationList.find(r => r.positionCode === code && r.userId)`）の `${lastName}${firstName}` から自動補完する。

❓ **業務確認待ち**: managerPositionCode が空席・未設定の場合の扱い / 兼務行は本務ポジションの上司を参照するか

### 3.2 レポートライン

❓ **業務確認待ち**: `managerPositionCode` の連鎖からレポートラインを構成するロジックの仕様。

---

## 4. 兼務ルール

| ルール | 状態 |
|---|---|
| `concurrentType = '兼務'` の行は兼務 | ✓ |
| `concurrentType` が '兼務' の時のみ `concurrentReason` を表示・必須化 | ✗ UIで未実装 |
| 兼務行に上司は本務ポジションから引く | ❓ 業務確認待ち |
| 一人の人物に複数の兼務行を持てるか | ❓ 業務確認待ち |

---

## 5. 出向ルール

**✓ 定義済み**: 出向操作（本務出向・兼務出向・SF統合先/SF外・受入/解除の全パターン）、人物識別フィールドの照合キー、レコード変化の詳細は `specs/G2-domain/06-secondment-rules.md` に定義済み。同ドキュメント §2 に `secondmentFromCompany` / `secondmentFromEmployeeNumber` / `secondmentToCompany` の設定タイミングも記載。

自社の SF 設定が Global Assignment 動作になっているかは ❓ 業務確認待ち（`06-secondment-rules.md` §2-2 参照）。

**✓ 実装済みルール**: `secondmentToCompany` あり + `departmentCode` なし → WARNING

---

## 6. 組織コードと組織階層フィールドの関係

**✓ 確定ルール**: `businessUnit`〜`team` は `departmentCode` から `orgMasterEntries`（組織マスタ）を使って自動補完される。手入力ではない（手動上書きは可）。

- 補完タイミング: (1) エディタで `departmentCode` を変更したとき、(2) 異動・空席作成等のドメインオペレーション実行時、(3) ヘッダーの「↻組織」ボタンによる一括再導出
- 実装: `OrgEditorRow`（`apps/web/src/components/editor/RowEditorPanel/OrgEditorRow.tsx`）が選択時に `orgMasterEntries` から一括セット
- 詳細は `specs/G1-fields/01-field-definitions.md` §4 参照

---

## 7. バンド・給与等級ルール

**✓ 確定ルール**: `payGrade` と `band` の対応関係は実装済み（F2条件、`packages/domain/src/rules/field.ts` 'f2_payGrade'）。`payGrade.band` が選択中 `band` の `promotionDemotionBand` と一致し、`payGrade.compensationCategory` が `jobType.compensationCategory` と一致するものに選択肢を絞り込む。

❓ **業務確認待ち**:

- `band`（人バンド）と `positionBand`（ポジションバンド）は基本的に一致するか？乖離が許容されるケースは？（例: 昇格待ち、降格猶予期間）
- `band` の有効値一覧（マスタに定義なし。Excelシートに記載あるか？）

---

## 8. 削除フラグ・退職処理

❓ **業務確認待ち**:

- 退職（`termination`）の場合、行をどう扱うか（削除フラグ? 残す?）
- Excel出力時の「移動区分=削除」の条件は何か
- 削除済み行の UI 上の表示ルール（現状: 未実装 → CLAUDE.md「既知未着手」参照）

---

## 9. Excel互換性ルール

**✓ 確定ルール**:
- バリデーション ERROR があっても Excel 保存・出力はブロックしない
- `positionCode` が `_pos_` prefix の場合、Excel出力時は blank
- `prevXxx` フィールドは操作中に書き換えない（before状態は不変）

---

## 未確認事項まとめ

優先度の高い順：

1. ❓ `band` の有効値一覧・`positionBand` との乖離許容
2. ❓ 異動時のポジションコード引き継ぎルール（新規作成 or 旧コード継承）
3. ❓ 昇降格時の `managerPositionCode` 扱い（ポジション新規作成に伴う上司設定）
4. ❓ 兼務行における上司の参照元
5. ❓ 自社の SF 設定が Global Assignment 動作になっているか（`06-secondment-rules.md` §2-2）
