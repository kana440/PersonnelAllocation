# 開発ロードマップ

## 基本方針

各フェーズは**独立してリリース可能**。後のフェーズが前のフェーズを壊すことなく積み上げられる。
フェーズをまたいで再利用されるのはドメイン層（純粋関数群）であり、ここが最も安定している。

```
Phase 1: Excel 基盤 ──→ Phase 2: ドメイン操作 ──→ Phase 3: AI 統合
                                                       │
                                              Phase 4: SF 読み込み
                                                       │
                                              Phase 5: SF 書き込み
```

---

## Phase 1: Excel 基盤 ✅ 完了

**目標**: Excel で読み込んで編集して Excel に書き出せる

| 機能 | 状態 |
|---|---|
| Excel インポート（3シート対応） | ✅ |
| AllocationRow 型・FIELD_METADATA・FieldBinding | ✅ |
| 行直接編集（DirectEditOperation） | ✅ |
| バリデーション（validateRow） | ✅ |
| Undo/Redo | ✅ |
| 組織図ビュー（Before/After） | ✅ |
| Excel エクスポート（元書式保持・positionCode 判定） | ✅ |
| コードリスト（LocalStorage） | ✅ |
| 追加インポート（アペンド・マージ） | ✅ |
| 担当者フィールド（assignee）・担当者ベースフィルタ | 🚧 |
| 担当者割り当てウィザード・分割エクスポート | 🚧 |
| 上司名自動補完（managerName → managerPositionCode） | 🚧 |

---

## Phase 2: ドメイン操作（ポジション概念含む）✅/🚧

**目標**: ポジション（席）と人（メンバー）を独立エンティティとして操作できる

| 機能 | 状態 | 備考 |
|---|---|---|
| ポジション・人ドメインモデル定義 | ✅ | docs/09参照 |
| FIELD_METADATA による FieldBinding 分類 | ✅ | `allocationRow.ts` |
| 空席ポジション作成 | ✅ | HRApplicationService 直接メソッド |
| ポジション削除（人を未アサイン行に保持） | ✅ | 〃 |
| 空席への人アサイン（A/B ケース） | ✅ | 〃 |
| ポジション↔人の紐付け解除（1行→2行分割） | ✅ | 〃 |
| 内部 positionCode（`_pos_` プレフィックス）の Excel 出力 blank 判定 | ✅ | exceljs/xlsx 両エクスポーター |
| EditCommand としての異動・昇格ハンドラー | 🚧 | 将来追加（現在は DirectEdit で代替） |
| ポジション操作を Undo 対象に（checkpoint 経由化） | 🚧 | 現在は Undo 対象外 |
| 削除済みパネル UI | 🚧 | 未着手 |

---

## Phase 1b: 担当者ワークフロー 🚧 未着手

**目標**: 担当者フィールドを軸にした分割・配布・マージフローを実現する

| 機能 | 状態 | 備考 |
|---|---|---|
| `AllocationRow.assignee` フィールド追加 | 🚧 | Excel A列から読み取り |
| 管理者モード / 担当者モードの切り替え | 🚧 | SetupView のモード選択 |
| 担当者選択UI（AssigneeSelectStep） | 🚧 | OrgSelectStep を置き換え |
| 担当者割り当てウィザード（分割軸選択 → 自動提案 → 調整） | 🚧 | 管理者モードのみ |
| 担当者ごとの分割エクスポート | 🚧 | A列付きで出力 |
| 担当者モードでのワーニング表示 | 🚧 | 他担当・未割当行の通知 |
| 上司名補完サポート機能 | 🚧 | マージ後に実行 |

---

## Phase 3: AI 統合 🚧 部分完了

**目標**: Claude API と連携して自然言語で操作できる

| 機能 | 状態 | 備考 |
|---|---|---|
| AIChatDrawer UI | ✅ | |
| 会話シナリオ 8種（import / help / org / dept / reportLine / promote / impact / export） | ✅ | scenarios/ |
| aiTools（findPersons / findOrgs / executeOperation など） | ✅ | `application/aiTools.ts` |
| agentRunner（Claude API Tool Use ループ） | ✅ | `infrastructure/ai/agentRunner.ts` |
| Claude API 本番接続 | 🚧 | mockChatService で代替中 |
| aiTools へのポジション操作追加（findPositions / assign / unassign etc.） | 🚧 | 未着手（AI は現在ポジション操作不可） |

### 現在の AI シナリオ

```
import-excel    → ファイル選択してインポート
excel-help      → Excel フォーマット説明
check-org       → 組織メンバー確認
check-dept      → 担当部門の組織ツリー確認
report-line     → レポートライン確認
promote         → 昇格対象者への promotionSign 設定
check-impact    → 担当外組織への影響確認
export-excel    → Excel エクスポート
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
  src/components/SetupView.tsx              (SF 読み込みボタンを追加)
```

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

---

## 各フェーズのテスト戦略

| フェーズ | テスト種別 | 対象 |
|---|---|---|
| Phase 1 | 単体テスト | `validateRow`, `rowDiff`, `derivePersons`, FIELD_METADATA など |
| Phase 2 | 単体テスト | 各 Operation の `validate()` / `apply()`、1行→2行分割ロジック |
| Phase 3 | 統合テスト | `createAITools(service)` + モック LLM |
| Phase 4 | 統合テスト | `SFDataSource` + SF API モック |
| Phase 5 | E2E テスト | SF サンドボックスへの書き込み確認 |

> **現状**: テスト環境未セットアップ（Vitest 導入が優先課題）
