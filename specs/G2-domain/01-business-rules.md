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

```
orgMapping（旧組織ID → 新組織ID[]）から sameOrgPairs を構築:
  "prevExternalCode|afterExternalCode" の Set

transfer = (departmentCode != prevDepartmentCode)
         AND NOT sameOrgPairs.has(`${prevCode}|${afterCode}`)
```

→ 旧組織・新組織が対応関係にある場合は transfer を付与しない（同一組織内の昇降格として扱う）。

### 1.2 promotion / demotion と transfer の同時成立

- **transfer + promotion**: 組織をまたいで昇格した → 「異動+昇級」
- **transfer + demotion**: 組織をまたいで降格した → 「異動+降級」
- **promotion のみ**: 同一（対応）組織内でバンドが上がった → 「昇級」（新ポジション必須 ← validateRow参照）
- **demotion のみ**: 同一（対応）組織内でバンドが下がった → 「降級」（新ポジション必須）

---

## 2. ポジションライフサイクルルール

### 2.1 昇級・降級時のポジション扱い

**✓ 確定ルール**: 昇級・降級（promotion / demotion）が発生した場合、同一のポジションコードを継続使用しない。新ポジションに登録し直す。

**実装**: `validateBandChangeRequiresNewPosition` が positionCode 未変更を ERROR で検出。

```
if (promotion || demotion) && !transfer && positionCode == prevPositionCode
  → ERROR: 新ポジションへの登録が必要
```

### 2.2 異動時のポジション扱い

❓ **業務確認待ち**: 異動時、ポジションコードは新組織で新規作成か、旧コードを引き継ぐか？

### 2.3 空席ポジション

- `positionCode` あり + `userId` なし → 空席
- 空席は Excel 出力時にも出力される
- `_pos_` prefix = ツール内部採番（Excel出力時は blank になる）

---

## 3. 上司関係ルール

### 3.1 managerName の導出

**✓ 確定ルール**: `managerName` は `managerPositionCode` に在席している人物の氏名から自動補完する。

```
managerPositionCode → allocationList.find(r => r.positionCode === code && r.userId)
  → `${lastName}${firstName}`
```

❓ **業務確認待ち**:
- managerPositionCodeが空席だった場合、managerNameは空にするか？
- managerPositionCodeが未設定の場合、UIでの扱いは？
- 兼務の場合、上司は本務ポジションの上司を参照するか？

### 3.2 レポートライン

❓ **業務確認待ち**: `managerPositionCode` の連鎖からレポートラインを構成するロジックの仕様。

---

## 4. 兼務ルール

| ルール | 状態 | 詳細 |
|---|---|---|
| `concurrentType = '兼務'` の行は兼務 | ✓ | CLAUDE.md記載 |
| `concurrentType` が '兼務' の時のみ `concurrentReason` を表示・必須化 | ✗ | UIで未実装 |
| 兼務行に上司は本務ポジションから引く | ❓ | 業務確認待ち |
| 一人の人物に複数の兼務行を持てるか | ❓ | 業務確認待ち |

---

## 5. 出向ルール

❓ **業務確認待ち（大半未定義）**

| フィールド | 用途 | 確認事項 |
|---|---|---|
| `secondmentFromCompany` | 出向元会社 | どのタイミングで設定されるか |
| `secondmentFromEmployeeNumber` | 出向元社員番号 | 自社Excelに含まれるか |
| `secondmentToCompany` | 出向先会社 | departmentCodeとの関係 |

**✓ 実装済みルール**: `secondmentToCompany` あり + `departmentCode` なし → WARNING

---

## 6. 組織コードと組織階層フィールドの関係

❓ **業務確認待ち**:

`departmentCode`（SF組織コード）が確定した時、以下のフィールドはどのように決まるか：

- `businessUnit`: departmentCodeから自動的に決まるか、手入力か
- `division`: 同上
- `subDivision`: 同上
- `group`: 同上
- `team`: 同上

**仮説**: これらはSFシステム上の組織階層から引き継がれる（orgMasterに含まれるか？）。

---

## 7. バンド・給与等級ルール

❓ **業務確認待ち（大半未定義）**:

- `band`（人バンド）と `positionBand`（ポジションバンド）は基本的に一致するか？
- 乖離が許容されるケースは？（例: 昇格待ち、降格猶予期間）
- `payGrade` の有効値と `band` との対応関係
- `band` の有効値一覧（codeListに定義なし。Excelシートに記載あるか？）

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

1. ❓ `band` の有効値一覧
2. ❓ `businessUnit`〜`team` は `departmentCode` から自動補完か手入力か
3. ❓ 昇降格時の `managerPositionCode` 扱い（ポジション新規作成に伴う上司設定）
4. ❓ 兼務行における上司の参照元
5. ❓ 異動時のポジションコード引き継ぎルール
6. ❓ `promotionSign` / `payGradeChangeSign` の有効値
7. ❓ 出向フィールド群の業務フロー
