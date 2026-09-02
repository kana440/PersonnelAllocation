# 人事異動管理システム — ドキュメント

## このフォルダについて

新しく参加するエンジニアがシステム全体を把握し、
独立した機能単位から開発・テストできるよう設計したガイド集です。

## ドキュメント一覧

### コア（全員必読）

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [01-requirements.md](./01-requirements.md) | 全員 | 要件定義。何を作るか、スコープ、ユーザー、業務ルール |
| [02-architecture.md](./02-architecture.md) | エンジニア | クリーンアーキテクチャの層構成・データフロー・モジュール依存関係 |
| [04-domain-model.md](./04-domain-model.md) | エンジニア | ポジション・人・AllocationRow の 4 状態・FieldBinding |
| [05-operation-framework.md](./05-operation-framework.md) | エンジニア | EditCommand・EditPattern・EditScenario の設計思想と拡張手順 |
| [06-development-guide.md](./06-development-guide.md) | エンジニア | 機能追加の具体的な手順（操作・バリデーション・AI Tool） |

### 実装参照

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [07-tdd-guide.md](./07-tdd-guide.md) | エンジニア | 業務操作パターンの TDD ガイド |
| [08-ai-architecture.md](./08-ai-architecture.md) | エンジニア | AI チャットの Intent-First + Tier 実行アーキテクチャ |
| [10-vacant-position.md](./10-vacant-position.md) | エンジニア | 空席ポジションのアサイン・空席化ロジック |
| [11-db-initialization.md](./11-db-initialization.md) | エンジニア | DB 初期化・マイグレーション（Drizzle ORM + PGlite / Aurora） |
| [15-fullstack-typesafety.md](./15-fullstack-typesafety.md) | エンジニア | フルスタック型安全構成（Drizzle → Hono RPC → React） |
| [16-ai-feedback-loop.md](./16-ai-feedback-loop.md) | エンジニア | AI フィードバックループ（STEP1実装済み・STEP2は構想のみ） |
| [17-canvas-generic-tree.md](./17-canvas-generic-tree.md) | エンジニア | キャンバス汎用ツリー設計（after/before 統合・PanelTreeAdapter） |
| [18-domain-field-rules.md](./18-domain-field-rules.md) | エンジニア | FieldRule・3層バリデーション/導出パイプライン設計 |
| [19-contact-workflow.md](./19-contact-workflow.md) | エンジニア | 連絡票（ContactPanel）実装リファレンス |
| [20-validation-resolution-framework.md](./20-validation-resolution-framework.md) | エンジニア | ValidationIssue・ResolutionDef の2層設計 |
| [22-merge-rebase-review.md](./22-merge-rebase-review.md) | エンジニア | マージ/リベースの対話的レビュー 実装リファレンス |

### STEP2（サーバー移行）

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [12-step2-requirements.md](./12-step2-requirements.md) | 全員 | STEP2 サービス要件・ToBe 業務フロー |
| [13-screen-design.md](./13-screen-design.md) | エンジニア | STEP2 画面設計・実装進捗 |
| [14-delegation-model.md](./14-delegation-model.md) | エンジニア | 依頼・スナップショット・3-way マージモデル（データモデルの正） |

### 業務要件（移植判断用）

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [23-org-view-edit-requirements.md](./23-org-view-edit-requirements.md) | 企画・エンジニア | STEP1組織図view/edit機能の業務要件（他ツールへの移植判断用） |
| [24-org-view-edit-known-issues.md](./24-org-view-edit-known-issues.md) | エンジニア | 23の既知課題・保留中の設計判断 |

### 検討中の設計案（未実装）

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [25-org-chart-ai-ingest-pipeline.html](./25-org-chart-ai-ingest-pipeline.html) | エンジニア | 組織図画像・PPTをAIで読み取り、基本操作へ変換するパイプラインの設計案（HTML形式）。名寄せ・操作選定ルールが未設計のため未着手 |

## 読む順番

### STEP1（Excel ローカル運用）を触るなら

1. [01-requirements.md](./01-requirements.md) — 何を作るかを把握
2. [02-architecture.md](./02-architecture.md) — システム全体の構造を理解
3. [04-domain-model.md](./04-domain-model.md) — ドメインの核心概念を理解
4. [05-operation-framework.md](./05-operation-framework.md) — 操作の仕組みを把握
5. [06-development-guide.md](./06-development-guide.md) — 実装ガイド

### STEP2（サーバー・Round 管理）を触るなら

上記 1-5 に加えて:

6. [12-step2-requirements.md](./12-step2-requirements.md) — STEP2 の目的と業務フロー
7. [14-delegation-model.md](./14-delegation-model.md) — 依頼ツリーとマージの設計（データモデルの正）
8. [13-screen-design.md](./13-screen-design.md) — 画面一覧と実装状況

## 主要ファイルマップ（クイックリファレンス）

```
packages/domain/src/               ← ドメイン層（外部依存ゼロ・@personnel/domain としてインポート）
  allocationRow.ts                    AllocationRow 型 + FIELD_METADATA
  context.ts                          DomainContext・RowContext（共通コンテキスト）
  fieldConstraints.ts                 FIELD_CONSTRAINTS（許容値制約の単一定義ソース）
  commands/                           EditCommand・OperationDef・EditScenario
    types.ts                            ValidationResult, DomainContext など
    handlers/                           操作ハンドラー実装（DirectEdit など）
    defs/                               OperationDef 宣言（メニュー条件・フォーム定義）
  patterns/                           EditPattern 分類・差分検出
  rules/
    field.ts                            FieldRule・FIELD_RULES
    row/ interRow/                      RowRule・InterRowRule 実装
    validate/                           バリデーション A〜W 系（純粋関数）
    derive/                             フィールド自動導出
    options/                            選択肢生成・組織ツリー操作
    resolve/                            ValidationResolutionDef
  masters/                            マスタデータ型定義・AllMasters 集約
  csvImport/                          Excel/CSV 解釈ロジック（純粋関数）
  diffMerge.ts                        3-way マージ・diff 計算（STEP2 用）

apps/web/src/                      ← React Web UI（STEP1 + STEP2 共存）
  application/
    HRApplicationService.ts           Single Source of Truth（状態管理）
    aiTools/                          AI 向け Tool 関数群（read/write/review/diagnose）
  infrastructure/
    excel/                            Excel エクスポート
    masters/                          LocalStorage 実装
    ai/                                AI チャット実装・toolRegistry/
    api/adminApi.ts                   STEP2 API クライアント（hc<AppType>() ベース）
  components/
    admin/AdminView/                  管理画面（STEP2）
    step2/                            PortalView・SubmissionEditView など（STEP2）
    editor/                           発令編集（STEP1/STEP2 共通コア）
    canvas/core/                      組織図キャンバス共通実装（PanelTreeAdapter・OrgTreeConfig）
    sidebar/                          組織・人物検索
    common/                           共通 UI パーツ
  config/features.ts                  Feature Flags（STEP1/STEP2 出し分け）
  store/                              Zustand ストア

apps/server/src/                   ← STEP2 バックエンド（Hono + PGlite/Aurora）
  db/
    schema.ts                         Drizzle スキーマ（テーブル定義の Single Source）
    database.ts                       DB エントリポイント（PGlite/Aurora 切替）
    adapters/                         PGlite（dev）/ Aurora（prod）
  routes/                             Hono REST API
    auth.ts                           認証ルート
    rounds.ts                         Round CRUD
    submissions.ts                    Submission ライフサイクル（提出・マージ・差し戻し）
    ai.ts                             LLM プロキシ（STEP1/STEP2 共通）
    domain.ts                         読み取り専用の軽量ドメイン計算
    admin/                            ユーザー・ポジション・AIスキル管理
  auth/stub.ts                        認証スタブ（将来: SSO アダプタに差替）
```
