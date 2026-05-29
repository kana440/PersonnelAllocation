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
│  chatSession.ts         — LLM チャットセッション管理             │
├──────────────────────────────────────────────────────────────────┤
│ ドメイン層         src/domain/         ← 依存ゼロ・テスト最優先 │
│  allocationRow.ts    — AllocationRow 型, FIELD_METADATA          │
│  schemas.ts          — Zod スキーマ（Organization, Person …）   │
│  operation/          — IDomainOperation インターフェース         │
│  projection/         — 派生ビュー（純粋関数）                   │
│  validation/         — バリデーション（純粋関数）                │
│  codeLists/          — コードリスト集約                         │
│  csvImport/          — Excel/CSV 解釈（純粋関数）               │
│  assignee.ts         — 担当者ユーティリティ（将来追加）          │
├──────────────────────────────────────────────────────────────────┤
│ インフラ層         src/infrastructure/                           │
│  excel/exceljs/exporter.ts  — Excel エクスポート（ExcelJS）     │
│  excel/xlsx/exporter.ts     — Excel エクスポート（xlsx）        │
│  excel/engine.ts            — エクスポーター選択                │
│  excel/state.ts             — 元ファイルバッファ保持             │
│  allocationListMapper.ts    — ドメイン→Excel 行変換             │
│  codeLists/                 — LocalStorage 実装                 │
│  ai/agentRunner.ts          — Claude API Tool Use ループ        │
│  ai/mockChatService.ts      — AI チャットモック                 │
│  ai/scenarios/              — 会話シナリオ（8種）               │
├──────────────────────────────────────────────────────────────────┤
│ ポート             src/ports/                                    │
│  IAllocationDataSource — データ読み込み抽象                      │
│  IAllocationExporter   — データ書き出し抽象                     │
│  ICodeListSource       — コードリスト読み込み抽象                │
│  IAIChatService        — AI チャット抽象                        │
│  （将来の SF アダプター・AI アダプターはここを実装する）         │
└──────────────────────────────────────────────────────────────────┘
```

---

## データフロー

```
Excel ファイル
    │
    ▼
[Infrastructure]  excelImport.ts / excel/engine.ts
    │              AllocationRow[] + Organization[] + AllCodeLists を生成
    ▼
[Application]     HRApplicationService.loadExcelData()
    │              コアデータをメモリに格納
    ▼
[Store]           useStore.ts (Zustand)
    │              DomainSnapshot を UI に公開
    ├─────────────────────┬────────────────────────
    ▼                     ▼
[Web UI]              [AI アシスタント]
 OrgOperationView       AIChatDrawer + useChatHandlers
 RowEditorPanel         → aiTools.ts → scenarios/
    │                     │
    └──────────┬───────────┘
               ▼
[Application]  HRApplicationService.executeOperation(op)   ← IDomainOperation 経由
               HRApplicationService.createVacantPosition() ← 直接呼び出し（位置操作）
               │
               ├─ op.validate(ctx)  ← 純粋関数（副作用なし）
               ├─ checkpoint()      ← Undo スタックに積む
               ├─ op.apply(ctx)     ← 純粋関数（副作用なし）
               └─ emit()            ← Zustand 再同期
               │
               ▼
[Infrastructure]  excel/engine.ts
    │              allocationList → Excel（要員配置リストシートを上書き）
    ▼
Excel ファイル
```

**設計の核心**:
Web UI も AI も基本的に同一の `executeOperation()` を通る。
ポジション操作（createVacant / assign / unassign / remove）は現在直接メソッドとして実装しており、
IDomainOperation への統一は今後の改善課題（[next-steps](./06-next-steps.md) 参照）。

---

## ドメインモデル：ポジション・人・配属

`docs/09-position-person-domain.md` に詳細を記載。概要:

| エンティティ | キー | 説明 |
|---|---|---|
| **ポジション** | `positionCode` | 組織の「席」。人がいなくても存在できる |
| **人（メンバー）** | `userId`（= groupEmployeeId） | 従業員。ポジションなしでも組織に属せる |
| **配属** | — | ポジションと人の 1:1 紐付け |

`AllocationRow` の 1行はこの3エンティティを合体した Excel 行。
`FieldBinding`（`position / person / both / allocation / meta`）で各フィールドの帰属を管理する。

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
private cachedPersons:       Person[] | null    ← derivePersons キャッシュ（emit でクリア）
private assigneeMode:        { kind: 'admin' } | { kind: 'assignee'; name: string }  ← モード（将来追加）
```

### DomainSnapshot（派生・再計算）

```
persons:             Person[]           ← allocationList から userId を dedupe（キャッシュあり）
canUndo:             boolean
canRedo:             boolean
organizations:       Organization[]    ← beforeOrganizations の後方互換エイリアス
assignees:           string[]          ← allocationList の assignee 値をユニーク化（将来追加）
```

> **注**: `Position` / `Affiliation` の派生ビューは廃止済み。
> コンポーネントは `allocationList` + `useMemo` で構築した Map を直接参照する。
> ポジションツリーは `OrgOperationView` の `positionTreeByOrgId` useMemo で O(n) 構築。

### Undo の仕組み

```
checkpoint() → past.push(coreSnapshot())  // 5つのコアデータを複製して積む
undo()       → past.pop()                 // 前の状態に戻す
redo()       → future.pop()
```

IDomainOperation を経由しないポジション直接操作（createVacantPosition 等）は
現時点で checkpoint を経由しないため Undo 対象外（今後の改善課題）。

---

## AI アーキテクチャ

```
AIChatDrawer
    │
    ├─ useChatHandlers      ← シナリオのオーケストレーション
    │       │
    │       ├─ scenarios/   ← 会話シナリオ（8種: import / orgMembers / dept / reportLine /
    │       │                               promote / impact / export / excelHelp）
    │       └─ aiTools.ts   ← HRApplicationService への読み取り・操作インターフェース
    │
    ├─ agentRunner.ts       ← Claude API Tool Use ループ（本番接続）
    └─ mockChatService.ts   ← モック（Claude API なし環境用）
```

シナリオは「フェーズ管理（ChatPhase）＋ウィジェット表示」のパターンで実装。
自由テキスト入力は agentRunner（Claude API Tool Use）または chatSession（通常チャット）が処理する。

---

## SuccessFactors 連携（将来）

ポートを介しているため、アダプターを差し替えるだけで連携できる。

```
現在（Excel）                           将来（SuccessFactors）
──────────────────────────────         ────────────────────────────────
infrastructure/excelImport.ts          src/adapters/salesforce/SFDataSource.ts
  概念的に IAllocationDataSource         implements IAllocationDataSource

infrastructure/excel/engine.ts         src/adapters/salesforce/SFExporter.ts
  概念的に IAllocationExporter            implements IAllocationExporter

現在（モック + Tool Use）              将来（本番 Claude API）
──────────────────────────────         ────────────────────────────────
ai/mockChatService.ts                  ai/agentRunner.ts (Tool Use) ← 実装済み
  implements IAIChatService
```
