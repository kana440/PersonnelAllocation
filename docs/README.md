# 人事異動管理システム — ドキュメント

## このフォルダについて

新しく参加するエンジニアがシステム全体を把握し、
独立した機能単位から開発・テストできるよう設計したガイド集です。

## ドキュメント一覧

| ファイル | 対象読者 | 内容 |
|---|---|---|
| [01-requirements.md](./01-requirements.md) | 全員 | 要件定義。何を作るか、スコープ、ユーザー、業務ルール |
| [02-architecture.md](./02-architecture.md) | エンジニア | クリーンアーキテクチャの層構成とデータフロー全体図 |
| [03-modules.md](./03-modules.md) | エンジニア | モジュール一覧、依存関係、独立テスト方法 |
| [04-domain-model.md](./04-domain-model.md) | エンジニア | ポジション・人・AllocationRow の 4 状態・FieldBinding |
| [05-operation-framework.md](./05-operation-framework.md) | エンジニア | EditCommand・EditPattern・EditScenario の設計思想と拡張手順 |
| [06-development-guide.md](./06-development-guide.md) | エンジニア | 機能追加の具体的な手順（操作・バリデーション・AI Tool） |
| [07-tdd-guide.md](./07-tdd-guide.md) | エンジニア | 業務操作パターンの TDD ガイド |
| [08-ai-architecture.md](./08-ai-architecture.md) | エンジニア | AI チャットの Intent-First + Tier 実行アーキテクチャ |

## 読む順番

1. まず [01-requirements.md](./01-requirements.md) で何を作るかを把握
2. [02-architecture.md](./02-architecture.md) でシステム全体の構造を理解
3. [03-modules.md](./03-modules.md) で自分が担当するモジュールを確認
4. [04-domain-model.md](./04-domain-model.md) でドメインの核心概念を理解
5. [05-operation-framework.md](./05-operation-framework.md) で操作の仕組みを把握
6. [06-development-guide.md](./06-development-guide.md) を見ながら実装

## 主要ファイルマップ（クイックリファレンス）

```
src/
├── domain/           ドメイン層（外部依存ゼロ・テスト最優先）
│   ├── allocationRow.ts       AllocationRow 型 + AfterValues
│   ├── schemas.ts             Zod スキーマ（Organization, Person …）
│   ├── context.ts             DomainContext・RowContext（共通コンテキスト）
│   ├── commands/              EditCommand・OperationDef・EditScenario
│   │   ├── types.ts           ValidationResult, DomainContext など
│   │   └── handlers/          操作ハンドラー実装（DirectEdit など）
│   │   └── defs/              OperationDef 宣言（メニュー条件・フォーム定義）
│   ├── patterns/              EditPattern 分類・差分検出
│   ├── validation/            バリデーション A〜W 系（純粋関数）
│   ├── choices/               選択肢生成・組織ツリー操作
│   ├── masters/               マスタデータ型定義・AllCodeLists 集約
│   └── csvImport/             Excel/CSV 解釈ロジック（純粋関数）
├── application/      アプリケーション層
│   ├── HRApplicationService.ts   Single Source of Truth
│   └── aiTools.ts                AI 向け Tool 関数群
├── infrastructure/   インフラ層（外部 I/O）
│   ├── excelImport.ts            Excel 読み込み
│   ├── excelIO.ts                Excel エクスポート
│   ├── allocationListMapper.ts   ドメイン→Excel 行変換
│   ├── masters/                  LocalStorage 実装
│   └── ai/                       AI チャット実装
│       └── mockChatService.ts    モック（将来: openAICompatibleAdapter.ts）
├── ports/            ポート定義（将来の SF / AI 連携はここを実装）
│   └── index.ts                  IAllocationDataSource / IAIChatService など
├── components/       UI 層（React）
│   ├── canvas/                   組織図・レポートライン
│   ├── sidebar/                  組織・人物検索
│   ├── editor/                   発令編集・Excel プレビュー
│   ├── setup/                    セッション初期化画面
│   ├── ai/                       AI チャットドロワー
│   └── common/                   共通 UI パーツ
└── store/            状態管理（Zustand）
```
