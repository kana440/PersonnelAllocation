# アーキテクチャ設計

## クリーンアーキテクチャ概観

依存の向きは**外側 → 内側のみ**。ドメイン層は何にも依存しない。

```
┌──────────────────────────────────────────────────────────────────┐
│ UI 層              src/components/  src/store/                   │
│  React コンポーネント + Zustand ストア                           │
│  ・状態は useStore 経由でのみ参照                                │
│  ・ドメインロジックを直接書かない                                │
├──────────────────────────────────────────────────────────────────┤
│ アプリケーション層  src/application/                             │
│  HRApplicationService   — Single Source of Truth                │
│  aiTools.ts             — AI 向け Tool 関数群                   │
├──────────────────────────────────────────────────────────────────┤
│ ドメイン層         src/domain/         ← 依存ゼロ・テスト最優先 │
│  allocationRow.ts    — AllocationRow 型, AfterValues            │
│  schemas.ts          — Zod スキーマ（Organization, Person …）   │
│  operation/          — IDomainOperation インターフェース         │
│  projection/         — 派生ビュー（純粋関数）                   │
│  validation/         — バリデーション（純粋関数）                │
│  codeLists/          — コードリスト集約                         │
│  csvImport/          — Excel/CSV 解釈（純粋関数）               │
│  operationPatterns/  — パターン判定インターフェース              │
├──────────────────────────────────────────────────────────────────┤
│ インフラ層         src/infrastructure/                           │
│  excelImport.ts      — xlsx 依存のインポーター                  │
│  codeLists/          — LocalStorage 実装                        │
├──────────────────────────────────────────────────────────────────┤
│ ポート             src/ports/                                    │
│  IAllocationDataSource — データ読み込み抽象                      │
│  IAllocationExporter   — データ書き出し抽象                     │
│  ICodeListSource       — コードリスト読み込み抽象                │
│  （将来の SF アダプターはここを実装する）                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## データフロー

```
Excel ファイル
    │
    ▼
[Infrastructure]  excelImport.ts
    │              AllocationRow[] + Organization[] + AllCodeLists を生成
    │              → importFromFile(file): ImportedWorkbookResult
    ▼
[Application]     HRApplicationService.loadExcelData()
    │              コアデータをメモリに格納
    ▼
[Store]           useStore.ts (Zustand)
    │              DomainSnapshot を UI に公開
    ├─────────────────────┬────────────────────────
    ▼                     ▼
[Web UI]              [AI アシスタント]
 RowEditorPanel         AIChatDrawer
 OrgOperationView       → aiTools.ts
    │                     │
    └──────────┬───────────┘
               ▼
[Application]  HRApplicationService.executeOperation(op)
               │
               ├─ op.validate(ctx)  ← 純粋関数（副作用なし）
               ├─ checkpoint()      ← Undo スタックに積む
               ├─ op.apply(ctx)     ← 純粋関数（副作用なし）
               └─ emit()            ← Zustand 再同期
               │
               ▼
[Infrastructure]  excelIO.ts
    │              allocationList → Excel（要員配置リストシートを上書き）
    ▼
Excel ファイル
```

**設計の核心**:
Web UI も AI も必ず同一の `executeOperation()` を通る。
業務ルール（validate/apply）はドメイン層に集中し、UI にも AI にも漏れない。

---

## 操作の抽象化（IDomainOperation）

`src/domain/operation/types.ts` のインターフェース:

```typescript
interface IDomainOperation {
  readonly kind: string

  // 現在の状態に対して操作が有効かを検証（純粋関数）
  validate(ctx: OperationContext): ValidationResult

  // 新しい allocationList を返す（ctx は変更しない。純粋関数）
  apply(ctx: OperationContext): OperationResult
}
```

### なぜ純粋関数なのか

1. **テスト容易性**: 外部依存なし。任意の AllocationRow[] を渡してテストできる
2. **予測可能性**: 同じ入力には必ず同じ出力
3. **Undo の単純さ**: apply が副作用を持たないため、Undo は単純なスタックの巻き戻しで実現できる

### Excel 後方互換との関係

`apply()` は常に `AllocationRow[]` を返す。
どんな意味的操作（MoveToOrg / Promote / SendOnSecondment…）でも
Excel エクスポート層（`excelIO.ts`）は変更不要。

---

## SuccessFactors 連携（将来）

ポートを介しているため、アダプターを差し替えるだけで連携できる。

```
現在（Excel）                      将来（SuccessFactors）
────────────────────               ────────────────────────────────
excelImport.ts                     src/adapters/salesforce/SFDataSource.ts
  implements (概念的に)               implements IAllocationDataSource
  IAllocationDataSource
                                   src/adapters/salesforce/SFExporter.ts
excelIO.ts                           implements IAllocationExporter
  implements (概念的に)
  IAllocationExporter
```

`HRApplicationService` は `IAllocationDataSource` を受け取るよう
`loadFromSource(source: IAllocationDataSource)` を追加するだけ。
UI・ドメイン層は変更不要。

---

## 状態管理の詳細

### HRApplicationService（真の状態）

```
private allocationList:      AllocationRow[]   ← 唯一の真の状態
private beforeOrganizations: Organization[]
private afterOrganizations:  Organization[]
private companies:           Company[]
private codeLists:           AllCodeLists
private past:                CoreState[]        ← Undo スタック
private future:              CoreState[]        ← Redo スタック
```

### DomainSnapshot（派生・毎回再計算）

```
persons:            Person[]            ← allocationList から userId を dedupe
beforePositions:    Position[]          ← prev* フィールド → Position 型
afterPositions:     Position[]          ← after フィールド → Position 型
beforeAffiliations: Affiliation[]       ← prev* フィールド → Affiliation 型
afterAffiliations:  Affiliation[]       ← after フィールド → Affiliation 型
canUndo:            boolean
canRedo:            boolean
patternCache:       Map<...>            ← パターン判定結果のキャッシュ
```

### Undo の仕組み

```
checkpoint() → past.push(coreSnapshot())  // 5つのコアデータを複製して積む
undo()       → past.pop()                 // 前の状態に戻す
redo()       → future.pop()
```

redo は `undo()` が呼ばれた時点の状態を future に積む。
executeOperation を経由しない editRow（プレビュー用）は checkpoint を積まない。
