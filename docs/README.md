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
| [04-development-guide.md](./04-development-guide.md) | エンジニア | 機能追加の具体的な手順（操作・バリデーション・AI Tool） |
| [05-roadmap.md](./05-roadmap.md) | 全員 | 開発フェーズ計画。現状→操作抽象化→AI→SuccessFactors |

## 読む順番

1. まず [01-requirements.md](./01-requirements.md) で何を作るかを把握
2. [02-architecture.md](./02-architecture.md) でシステム全体の構造を理解
3. [03-modules.md](./03-modules.md) で自分が担当するモジュールを確認
4. [04-development-guide.md](./04-development-guide.md) を見ながら実装

## 主要ファイルマップ（クイックリファレンス）

```
src/
├── domain/           ドメイン層（外部依存ゼロ・テスト最優先）
│   ├── allocationRow.ts       AllocationRow 型 + AfterValues
│   ├── schemas.ts             Zod スキーマ（Organization, Person …）
│   ├── operation/             EditCommand インターフェース
│   │   ├── types.ts           ValidationResult, OperationContext など
│   │   └── handlers/          操作ハンドラー実装（DirectEdit など）
│   ├── projection/            派生ビュー（純粋関数）
│   ├── validation/            バリデーション（純粋関数）
│   ├── codeLists/             コードリスト集約
│   └── csvImport/             Excel/CSV 解釈ロジック（純粋関数）
├── application/      アプリケーション層
│   ├── HRApplicationService.ts   Single Source of Truth
│   └── aiTools.ts                AI 向け Tool 関数群
├── infrastructure/   インフラ層（外部 I/O）
│   ├── excelImport.ts            Excel 読み込み
│   ├── excelIO.ts                Excel エクスポート
│   ├── allocationListMapper.ts   ドメイン→Excel 行変換
│   ├── codeLists/                LocalStorage 実装
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
