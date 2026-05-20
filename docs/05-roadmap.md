# 開発ロードマップ

## 基本方針

各フェーズは**独立してリリース可能**。後のフェーズが前のフェーズを壊すことなく積み上げられる。
フェーズをまたいで再利用されるのはドメイン層（純粋関数群）であり、ここが最も安定している。

```
Phase 1: Excel 基盤 ──→ Phase 2: 操作パターン ──→ Phase 3: AI 統合
                                                        │
                                               Phase 4: SF 読み込み
                                                        │
                                               Phase 5: SF 書き込み
```

---

## Phase 1: Excel 基盤（現在）

**目標**: Excel で読み込んで編集して Excel に書き出せる

**現状の実装済み機能**:

| 機能 | 状態 | ファイル |
|---|---|---|
| Excel インポート（3シート対応） | ✅ | `infrastructure/excelImport.ts` |
| AllocationRow 型・フィールド定義 | ✅ | `domain/allocationRow.ts` |
| 行直接編集（DirectEditOperation） | ✅ | `domain/operation/handlers/directEdit.ts` |
| バリデーション（validateRow） | ✅ | `domain/validation/validateRow.ts` |
| Undo/Redo | ✅ | `HRApplicationService` |
| 組織図ビュー（Before/After） | ✅ | `components/OrgOperationView.tsx` |
| Excel エクスポート（元書式保持） | ✅ | `utils/excelIO.ts` |
| コードリスト（LocalStorage） | ✅ | `infrastructure/codeLists/` |

**残タスク（Phase 1 完了のために）**:

- [ ] `validateRow()` にコードリスト値チェックを追加（現在 `_codeLists` 引数が未使用）
- [ ] `RowEditorPanel` での保存エラーを UI に表示（`saveRow()` が `ValidationResult` を返すようになった）
- [ ] テスト環境のセットアップ（Vitest 等）

---

## Phase 2: 操作パターン

**目標**: 「異動」「昇格」「出向」等の意味のある操作単位を追加する

**前提**: Phase 1 完了。`IDomainOperation` インターフェースは定義済み。

**追加する実装**:

| ハンドラー | 説明 | 影響するフィールド |
|---|---|---|
| `MoveToOrgOperation` | 異動 | departmentCode, transferReason |
| `PromoteOperation` | 昇格 | band, positionBand, promotionSign |
| `SendOnSecondmentOperation` | 出向 | employmentType（本務行）+ 出向先行の追加 |
| `RecallFromSecondmentOperation` | 出向戻り | 出向先行の削除 |
| `AddConcurrentOperation` | 兼務追加 | 兼務行の追加 |
| `RemoveConcurrentOperation` | 兼務解除 | 兼務行の削除 |
| `HireOperation` | 採用 | 新行生成 |
| `RetireOperation` | 退職 | 行を論理削除 |

**各ハンドラーの追加コスト**: 約 50〜80 行。validate + apply の 2 メソッドのみ。

**操作パターン（Pattern Detection）の追加**:

| パターン | 説明 |
|---|---|
| `SecondmentPattern` | 出向行の2行構造を検出 |
| `ConcurrentPattern` | 兼務行を検出 |
| `TransferPattern` | 組織コードの変化を検出 |
| `PromotionPattern` | バンド変化を検出 |

---

## Phase 3: AI 統合

**目標**: Claude API と連携して自然言語で操作できる

**前提**: Phase 2 完了（操作ハンドラーが揃っている）

**実装内容**:

### 3-1: AIChatDrawer の LLM 接続

```
AIChatDrawer → Claude API (Tool Use)
  ↓
aiTools.findPersons / findOrgs / validateOperation / executeOperation
  ↓
IDomainOperation.validate → apply → emit
```

### 3-2: Claude Tool 定義

各 `aiTools` 関数を Claude Tool Use の JSON schema として定義する。

```typescript
const tools = [
  {
    name: 'findPersons',
    description: '名前・ユーザーID・組織コードで社員を検索する',
    input_schema: {
      type: 'object',
      properties: {
        name:    { type: 'string', description: '名前（部分一致）' },
        userId:  { type: 'string', description: 'ユーザーID（部分一致）' },
        orgCode: { type: 'string', description: '組織コード（完全一致）' },
      },
    },
  },
  {
    name: 'executeOperation',
    description: '操作を実行する（バリデーション後に適用）',
    // ...
  },
]
```

### 3-3: AI が使える操作の流れ

```
ユーザー: 「田中太郎を営業部に異動させて」

AI:
  1. findPersons({ name: '田中太郎' }) → userId, rowId を取得
  2. findOrgs({ name: '営業部' }) → orgCode を取得
  3. validateOperation(new MoveToOrgOperation(...)) → 問題ないか確認
  4. executeOperation(new MoveToOrgOperation(...)) → 実行
  5. ユーザーに結果を報告
```

---

## Phase 4: SuccessFactors 読み込み

**目標**: Excel の代わりに SF から直接データを読み込める

**前提**: Phase 1〜3 完了（ドメイン・操作が安定している）

**変更箇所**（ドメイン層は変更なし）:

```
追加:
  src/adapters/salesforce/SFDataSource.ts    (IAllocationDataSource を実装)
  src/adapters/salesforce/sfApiClient.ts     (SF OData API クライアント)

変更:
  src/application/HRApplicationService.ts   (loadFromSource を追加)
  src/components/MasterSetup.tsx             (SF 読み込みボタンを追加)
```

**段階的移行**:

- Excel と SF を並列サポート（MasterSetup で選択できる）
- 企業・部門単位で SF 対応を段階的に適用できる

---

## Phase 5: SuccessFactors 書き込み

**目標**: 発令結果を SF に直接書き戻せる

**変更箇所**:

```
追加:
  src/adapters/salesforce/SFExporter.ts   (IAllocationExporter を実装)

変更:
  src/components/ExcelPreview.tsx          (SF 送信ボタンを追加)
```

**データ整合性の考慮点**:
- SF への書き込みは発令日単位でバッチ処理
- エラー行は SF に送らず Excel に残す（部分適用）
- 送信前に `validateRow()` を全行に適用して問題行をハイライト

---

## 各フェーズのテスト戦略

| フェーズ | テスト種別 | 対象 |
|---|---|---|
| Phase 1 | 単体テスト | `validateRow`, `rowDiff`, `derivePersons` など |
| Phase 2 | 単体テスト | 各 `XxxOperation.validate()`, `XxxOperation.apply()` |
| Phase 3 | 統合テスト | `createAITools(service)` + モック LLM |
| Phase 4 | 統合テスト | `SFDataSource` + SF API モック |
| Phase 5 | E2E テスト | SF サンドボックスへの書き込み確認 |

---

## 「部分的に Excel から SF に移行する」手順

1 つの会社・部門だけ SF を使い始めて、残りは Excel のまま運用できる。

```
Step 1: Phase 1-2 で Excel 基盤が完成
Step 2: SFDataSource を SF 対象会社のみ実装
Step 3: MasterSetup で「会社単位」で読み込み元を選べるようにする
Step 4: SF の読み込み結果と Excel を同一の allocationList にマージ
Step 5: 最終的に全会社が SF 対応になったら Excel 読み込みを廃止
```

このアプローチが可能なのは、すべての操作が `AllocationRow[]` という
**単一の内部表現**に変換されてから処理されるためである。
