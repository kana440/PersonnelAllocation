# AI 開発者ガイド — ファイル所有権・インターフェース規約

このドキュメントは AI 開発担当者（以下 **AI開発者**）向け。
Web UI 担当者（以下 **Web開発者**）と GitHub を使わずにコードをマージするため、
ファイルの所有権と境界インターフェースを明確にする。

---

## 所有権マップ

| ディレクトリ / ファイル | オーナー | 説明 |
|---|---|---|
| `apps/web/src/infrastructure/ai/` | **AI** | AI インフラ層全体 |
| `apps/web/src/infrastructure/ai/toolRegistry/readTools.ts` | **AI** | read ツール群 |
| `apps/web/src/infrastructure/ai/toolRegistry/renderTools.ts` | **AI** | render ツール群 |
| `apps/web/src/infrastructure/ai/toolRegistry/navigateTools.ts` | **AI** | navigate ツール群 |
| `apps/web/src/infrastructure/ai/toolRegistry/types.ts` | **AI** | ToolEntry 型定義 |
| `apps/web/src/infrastructure/ai/toolRegistry/helpers.ts` | **AI** | detectCascadeWidget |
| `apps/web/src/infrastructure/ai/toolRegistry/index.ts` | **AI** | 集約・パブリック API |
| `apps/web/src/infrastructure/ai/toolRegistry/operationTools.ts` | **Web** | propose_* / undo |
| `apps/web/src/application/aiTools/` | **AI** | ツール実装（read 系） |
| `apps/web/src/application/aiTools/read.ts` | **AI** | read ツール実装 |
| `apps/web/src/infrastructure/ai/proposalBuilders.ts` | **Web** | confirm ウィジェット組み立て |
| `apps/web/src/infrastructure/ai/agentRunner.ts` | **AI** | Agent 実行エンジン |
| `apps/web/src/infrastructure/ai/chatServiceFactory.ts` | **AI** | チャットサービス初期化 |
| `apps/web/src/infrastructure/ai/skillLoader.ts` | **AI** | スキル定義ロード |
| `packages/domain/src/commands/defs/` | **Web** | EditOperation 定義 |
| `apps/web/src/components/` | **Web** | React コンポーネント |
| `apps/web/src/store/` | **Web** | Zustand ストア |

### 境界ルール（これを守ればコンフリクトなし）

```
AI が所有するファイル → Web が所有するファイルを import しない
Web が所有するファイル → AI が所有するファイルを import しない
```

唯一の接点:
- `aiTools` オブジェクト（`apps/web/src/application/aiTools/index.ts`）
  → AI が実装、Web が呼び出す形にはならない。AI が読み書きの両方を行う。
- `toolRegistry` の public API（`toolRegistry/index.ts`）
  → Web コンポーネント（`useChatHandlers.ts` 等）がここを import する。AI が定義する。

---

## 読み取り系ツールの追加方法（AI 開発者が行う）

### 1. `aiTools/read.ts` に実装を追加

```typescript
// apps/web/src/application/aiTools/read.ts
export function myNewQuery(args: { ... }): ... {
  const { allocationList, masters } = service.getSnapshot()
  // 純粋な参照処理。service.executeOperation は呼ばない。
  return ...
}
```

`aiTools` オブジェクトに追加:
```typescript
export const aiTools = {
  // ... 既存
  myNewQuery,
}
```

### 2. `toolRegistry/readTools.ts` に ReadEntry を追加

```typescript
// READ_TOOLS 配列の末尾に追加
{
  kind: 'read',
  definition: {
    type: 'function',
    function: {
      name:        'myNewQuery',
      description: '...',
      parameters:  { type: 'object', properties: { ... } },
    },
  },
  execute: args => aiTools.myNewQuery(args as { ... }),
},
```

`index.ts` は変更不要。`READ_TOOLS` が自動的に展開される。

---

## UI ナビゲーションツールの追加方法（AI 開発者が行う）

`toolRegistry/navigateTools.ts` の `NAVIGATE_TOOLS` に `NavigateEntry` を追加する。

```typescript
{
  kind: 'navigate',
  definition: {
    type: 'function',
    function: {
      name: 'ui_my_action',
      description: '...',
      parameters: { ... },
    },
  },
  execute: (args) => {
    // useStore / useUICommandStore / useFormStateStore のみ変更可
    // appService.executeOperation は呼ばない（それは execute/confirm ツールの責務）
    const store = useStore.getState()
    store.someUIAction(args.rowId as number)
    return { ok: true }
  },
},
```

**注意**: `navigate` ツールはドメインデータを変更しない。変更が必要なら `execute` 種別の
ツールを追加し、`operationTools.ts`（Web 開発者）に依頼する。

---

## Web 開発者が新しい操作を追加した場合の連携方法

Web 開発者が新しい `EditOperation`（例: `newOpDef`）を追加したとき、
AI からそれを呼べるようにするには以下の手順:

**Web 開発者が行う（operationTools.ts に追加）:**
```typescript
// propose_new_op（Web 開発者が追加）
{
  kind: 'execute',
  definition: {
    type: 'function',
    function: {
      name:        'propose_new_op',
      description: '...',
      parameters:  { ... },
    },
  },
  execute: args => aiTools.executeNewOp(args.rowId as number),
},
```

**AI 開発者が行う（aiTools への実装追加）:**
```typescript
// apps/web/src/application/aiTools/index.ts（または適切なサブファイル）
export function executeNewOp(rowId: number) {
  return service.executeOperation(new NewOperation(rowId))
}
```

2つのファイルが **独立して変更できる**ことが重要。コンフリクトが起きない。

---

## `getOperationStatus` を使った AI デバッグパターン

```
1. AI が propose_xxx を呼ぼうとして失敗
2. AI が getOperationStatus(rowId) を呼ぶ
3. unavailable[] の reason を読んで原因を把握
4. 適切な操作に切り替えるか、ユーザーに説明する
```

`getOperationStatus` の `unavailable[].reason` は
`packages/domain/src/commands/defs/` の各 `availableFor` 関数で定義されている（Web 開発者が管理）。
AI 開発者はこの文字列を読んで判断するだけでよい。変更は不要。

---

## aiTools と HRApplicationService の関係

```
AI ツール実装                HRApplicationService（Web が管理）
─────────────────────────────────────────────────────────
aiTools.executeXxx()   →   service.executeOperation(new XxxOperation(...))
aiTools.findPersons()  →   service.getSnapshot().allocationList を直接参照
```

- `service.executeOperation` は Undo 対象。副作用を持つ処理はここ経由。
- `service.getSnapshot()` は read-only。
- **`service` に直接ドメインロジックを書かない**（`EditCommand` 経由が原則）。

---

## Fast Path でのツール制限

```typescript
// agentRunner.ts の Fast Path では getSafeDefinitions() を使用
toolRegistry.getSafeDefinitions()
// → kind: 'read' | 'render' | 'navigate' のみ
// → 'execute' | 'confirm' は除外（ドメイン変更を起こさない）
```

新しい `read` / `navigate` ツールは自動的に Fast Path で利用可能になる。
`execute` / `confirm` ツールを Fast Path で使いたい場合は `agentRunner.ts` の
`FAST_PATH_ALLOWED_TOOLS` リストへの追加が必要（AI 開発者が判断）。

---

## マージ時のコンフリクト予防チェックリスト

マージ前に以下を確認する:

- [ ] `toolRegistry/readTools.ts` — AI 開発者のみ変更している
- [ ] `toolRegistry/operationTools.ts` — Web 開発者のみ変更している
- [ ] `toolRegistry/navigateTools.ts` — AI 開発者のみ変更している
- [ ] `toolRegistry/index.ts` — 変更がない（ほぼ変更不要）
- [ ] `aiTools/read.ts` — AI 開発者のみ変更している
- [ ] `proposalBuilders.ts` — Web 開発者のみ変更している
- [ ] `agentRunner.ts` — AI 開発者のみ変更している

コンフリクトが起きるとしたら `aiTools/index.ts`（全体の export） のみ。
その場合は単純に export を追記するだけ（ロジックの競合は起きない）。

---

## 触ってはいけないファイル（AI 開発者）

| ファイル | 理由 |
|---|---|
| `packages/domain/src/commands/defs/*.ts` | Web 開発者が管理する EditOperation 定義 |
| `apps/web/src/application/HRApplicationService.ts` | ドメイン状態管理の単一真の状態（変更は Web 開発者）|
| `apps/web/src/store/*.ts` | Zustand ストア定義（Web 開発者）|
| `toolRegistry/operationTools.ts` | propose_* ツール（Web 開発者）|
| `toolRegistry/helpers.ts` | （読み取り可・変更は注意）detectCascadeWidget は operationTools.ts が依存 |
| `apps/web/src/components/` | React コンポーネント（Web 開発者）|

---

## 参考: ファイル構成図

```
apps/web/src/
  infrastructure/ai/
    toolRegistry/          ← AI開発者管理（operationTools.ts 除く）
      index.ts             ← 集約・パブリック API（変更不要）
      types.ts             ← ToolEntry 型
      helpers.ts           ← detectCascadeWidget
      readTools.ts         ← AI開発者: 読み取りツール追加はここ
      renderTools.ts       ← AI開発者: ウィジェット表示ツール追加はここ
      navigateTools.ts     ← AI開発者: UI操作ツール追加はここ
      operationTools.ts    ← Web開発者: propose_* 追加はここ
    agentRunner.ts         ← AI開発者
    chatServiceFactory.ts  ← AI開発者
    proposalBuilders.ts    ← Web開発者
    skillLoader.ts         ← AI開発者
  application/
    aiTools/               ← AI開発者（実装）
      read.ts              ← AI開発者: 読み取り実装
      index.ts             ← AI開発者: export 集約
    HRApplicationService.ts ← Web開発者
packages/
  domain/src/
    commands/defs/         ← Web開発者
```
