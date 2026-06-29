# 人事異動管理システム — ドキュメント

## このフォルダについて

新しく参加するエンジニアがシステム全体を把握し、
独立した機能単位から開発・テストできるよう設計したガイド集です。

## ドキュメント一覧

### コア（全員必読）

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [01-requirements.md](./01-requirements.md) | 全員 | 要件定義。何を作るか、スコープ、ユーザー、業務ルール |
| [02-architecture.md](./02-architecture.md) | エンジニア | クリーンアーキテクチャの層構成とデータフロー全体図 |
| [04-domain-model.md](./04-domain-model.md) | エンジニア | ポジション・人・AllocationRow の 4 状態・FieldBinding |
| [05-operation-framework.md](./05-operation-framework.md) | エンジニア | EditCommand・EditPattern・EditScenario の設計思想と拡張手順 |
| [06-development-guide.md](./06-development-guide.md) | エンジニア | 機能追加の具体的な手順（操作・バリデーション・AI Tool） |

### 実装参照

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [03-modules.md](./03-modules.md) | エンジニア | モジュール一覧・依存関係・公開 API |
| [07-tdd-guide.md](./07-tdd-guide.md) | エンジニア | 業務操作パターンの TDD ガイド |
| [08-ai-architecture.md](./08-ai-architecture.md) | エンジニア | AI チャットの Intent-First + Tier 実行アーキテクチャ |
| [11-db-initialization.md](./11-db-initialization.md) | エンジニア | DB 初期化・マイグレーション（Drizzle ORM + PGlite / Aurora） |
| [15-fullstack-typesafety.md](./15-fullstack-typesafety.md) | エンジニア | フルスタック型安全構成（Drizzle → Hono RPC → React） |

### STEP2（サーバー移行）

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [12-step2-requirements.md](./12-step2-requirements.md) | 全員 | STEP2 サービス要件・ToBe 業務フロー |
| [13-screen-design.md](./13-screen-design.md) | エンジニア | STEP2 画面設計・実装進捗 |
| [14-delegation-model.md](./14-delegation-model.md) | エンジニア | 依頼・スナップショット・3-way マージモデル |
| [09-migration-vision.md](./09-migration-vision.md) | 企画・エンジニア | 移行の背景・フェーズ設計（なぜ STEP2 が必要か） |

### UI アーキテクチャ

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [17-canvas-generic-tree.md](./17-canvas-generic-tree.md) | エンジニア | キャンバス汎用ツリー設計（after/before 統合・PanelTreeAdapter・パフォーマンス） |

### 課題・提案

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [10-improvement-proposals.md](./10-improvement-proposals.md) | エンジニア | 既知の技術課題・改善提案 |

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
7. [14-delegation-model.md](./14-delegation-model.md) — 依頼ツリーとマージの設計
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
  validation/                         バリデーション A〜W 系（純粋関数）
  choices/                            選択肢生成・組織ツリー操作
  masters/                            マスタデータ型定義・AllCodeLists 集約
  csvImport/                          Excel/CSV 解釈ロジック（純粋関数）
  diffMerge.ts                        3-way マージ・diff 計算（STEP2 用）

apps/web/src/                      ← React Web UI（STEP1 + STEP2 共存）
  application/
    HRApplicationService.ts           Single Source of Truth（状態管理）
    aiTools.ts                        AI 向け Tool 関数群
  infrastructure/
    excel/                            Excel エクスポート
    masters/                          LocalStorage 実装
    ai/                               AI チャット実装
    api/adminApi.ts                   STEP2 API クライアント
  components/
    admin/AdminView/                  管理画面（STEP2）
    step2/                            PortalView・SubmissionEditView など（STEP2）
    editor/                           発令編集（STEP1/STEP2 共通コア）
    canvas/                           組織図・レポートライン
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
    revisions.ts                      Revision 確定
  auth/stub.ts                        認証スタブ（将来: SSO アダプタに差替）
```
