# AI 開発者ガイド — ファイル所有権・インターフェース規約

AI サブシステム（チャット・ツール呼び出し・提案フロー）と Web/コア機能は並行して開発が進む。
このドキュメントは両者の担当領域と接点インターフェースを整理し、コードレビュー時の
オーナーシップ判断・新規ツール追加の作業手順を明確にする。

---

## 所有権マップ

| ディレクトリ / ファイル | オーナー | 説明 |
|---|---|---|
| `apps/web/src/infrastructure/ai/` | **AI** | AI インフラ層全体（`toolRegistry/operationTools.ts` を除く） |
| `apps/web/src/infrastructure/ai/toolRegistry/operationTools.ts` | **Web** | propose_* / undo（ドメイン変更を伴うツール） |
| `apps/web/src/application/aiTools/` | **AI** | ツール実装（read 系） |
| `apps/web/src/infrastructure/ai/proposalBuilders.ts` | **Web** | confirm ウィジェット組み立て |
| `packages/domain/src/commands/defs/` | **Web** | EditOperation 定義 |
| `apps/web/src/components/` / `apps/web/src/store/` | **Web** | React コンポーネント・Zustand ストア |
| `apps/web/src/application/HRApplicationService.ts` | **Web** | ドメイン状態管理の単一真の状態 |

### 境界ルール

```
AI が所有するファイル → Web が所有するファイルを import しない
Web が所有するファイル → AI が所有するファイルを import しない
```

唯一の接点は `aiTools`（`application/aiTools/index.ts`）と `toolRegistry` の public API
（`toolRegistry/index.ts`）。前者は AI が実装、後者は Web コンポーネント（`useChatHandlers.ts` 等）が
import して呼び出す。

---

## 新しいツールの追加方法

### read / navigate ツール（AI 開発者が単独で追加できる）

1. `apps/web/src/application/aiTools/read.ts`（または該当サブファイル）に純粋な参照処理を実装し、
   `aiTools` オブジェクトに追加する。`service.executeOperation` は呼ばない。
2. `toolRegistry/readTools.ts`（または `navigateTools.ts`）に `ReadEntry` / `NavigateEntry` を追加する。
   `index.ts` は変更不要（配列が自動的に展開される）。

navigate ツールは `useStore` / `useUICommandStore` / `useFormStateStore` のみ変更してよい。
ドメイン変更が必要なら navigate ではなく execute 種別のツールにし、下記の手順で Web 開発者に依頼する。

### execute / confirm ツール（Web 開発者との連携が必要）

Web 開発者が `EditOperation` を追加したら、`operationTools.ts` に `propose_xxx` エントリを追加してもらう
（`execute: args => aiTools.executeXxx(...)` の形）。AI 開発者側は `aiTools/index.ts` に
`executeXxx()`（内部で `service.executeOperation(new XxxOperation(...))` を呼ぶだけ）を追加する。
2つのファイルは独立して変更できる。

### `getOperationStatus` を使ったデバッグパターン

`propose_xxx` が失敗したら `getOperationStatus(rowId)` を呼び、`unavailable[].reason`
（`packages/domain/src/commands/defs/` の `availableFor` が返す文字列）を読んで原因を判断する。
AI 開発者はこの文字列をそのまま解釈すればよく、ドメイン側の変更は不要。

---

## aiTools と HRApplicationService の関係

```
aiTools.executeXxx()   →   service.executeOperation(new XxxOperation(...))   // Undo 対象
aiTools.findPersons()  →   service.getSnapshot().allocationList を直接参照     // read-only
```

`service` に直接ドメインロジックを書かない（`EditCommand` 経由が原則）。

---

## Fast Path でのツール制限

```typescript
// agentRunner.ts の Fast Path では getSafeDefinitions() を使用
toolRegistry.getSafeDefinitions()
// → kind: 'read' | 'render' | 'navigate' のみ。'execute' | 'confirm' は除外
```

新しい `read` / `navigate` ツールは自動的に Fast Path で使えるようになる。
`execute` / `confirm` を Fast Path で使いたい場合のみ `agentRunner.ts` の
`FAST_PATH_ALLOWED_TOOLS` への追加が必要。

---

## 参考: ファイル構成図

```
apps/web/src/
  infrastructure/ai/
    toolRegistry/
      index.ts             ← 集約・パブリック API（変更不要）
      types.ts             ← ToolEntry 型
      readTools.ts         ← 読み取りツール追加はここ（AI）
      renderTools.ts       ← ウィジェット表示ツール追加はここ（AI）
      navigateTools.ts     ← UI操作ツール追加はここ（AI）
      operationTools.ts    ← propose_* 追加はここ（Web）
    agentRunner.ts          ← Agent 実行エンジン（AI）
    chatServiceFactory.ts   ← チャットサービス初期化（AI）
    proposalBuilders.ts     ← confirm ウィジェット組み立て（Web）
    skillLoader.ts          ← スキル定義ロード（AI）
  application/
    aiTools/                ← ツール実装（AI）
    HRApplicationService.ts ← ドメイン状態管理（Web）
packages/domain/src/
  commands/defs/            ← EditOperation 定義（Web）
```
