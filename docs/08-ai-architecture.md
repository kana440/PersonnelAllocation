# AI アーキテクチャ設計

## 概要

本システムの AI チャット機能は OpenAI 互換 API（カスタム LLM）を使用する。
設計方針は「**Intent-First + Tier 実行**」— まずユーザーの意図を分類し、複雑さに応じた実行戦略を選ぶ。

---

## 実行 Tier

| Tier | 用途 | AI 往復 | ユーザー体験 |
|---|---|---|---|
| **Guide** | 説明・手順案内・読み取り | 1往復（ツールなし） | 即レスポンス |
| **Simple Write** | 単一操作の提案・実行 | 1〜2往復 | 確認 → 実行 |
| **Wizard** | 複合操作（統廃合・玉突き等） | N ステップ逐次 | 手順一覧 → 段階確認 |

---

## データフロー

```
User Input
    │
    ▼
Intent Classifier（構造化出力・ツールなし）
    │ { tier, intent, params, clarification? }
    │
    ├─ Guide  ──→ コンテキスト注入済みプロンプト → テキスト回答
    │
    ├─ Simple ──→ params 確定 → propose → confirm → execute
    │              └─ 不足なら 1回だけ clarify
    │
    └─ Wizard ──→ ステップ計画生成 → UI に一覧表示
                   → ユーザーが 1 ステップずつ承認 → 実行
                   → 各ステップ後にバリデーション診断
```

---

## コンテキスト注入（システムプロンプト）

毎回のリクエスト前にセッション状態をシステムプロンプトへ束ねる。
これにより `getValidationDiagnosis` / `listChangedRows` 等の余分なツール往復を削減できる。

```typescript
buildSystemPrompt(snapshot): string {
  // 注入する内容（トークン上限に注意）
  // - 変更行の件数・変更種別サマリー（全行は注入しない）
  // - バリデーションエラーのフィールド別件数
  // - 業務ルール（昇降格→新ポジション必須 等）
  // - AI禁止事項（prevXxx変更不可 等）
}
```

詳細: `specs/G4-ai/04-intent-tier-architecture.md`

---

## Streaming と進捗表示

OpenAI 互換 streaming を使い、tool call の開始・完了をイベントとして UI に流す。

```
tool_call 開始 → "組織メンバーを確認中..." スピナー表示
tool_call 完了 → 結果サマリーをチャットに追記
text chunk    → ストリーミング表示
```

---

## AI チャット UI の実装形式

AI チャットは **`FloatingAIChat`（`components/layout/FloatingAIChat.tsx`）** として実装されている。

- `EditViewCore` の末尾（JSX の最後）に置かれ、`position: fixed` 相当のフローティングウィジェット
- ドラッグ可能（右下 offset で初期位置、マウスドラッグで移動）
- レイアウト幅に影響しない（サイドパネルではない）
- 開閉状態は内部の `useState` で管理

照会パネル等の新機能を追加するときに AI チャットとレイアウト上の競合は発生しない。

---

## 現状との対応関係

| 現状のファイル | 役割 | 再設計後 |
|---|---|---|
| `agentRunner.ts` | ツール use ループ | Intent Classifier + Tier ルーター に拡張 |
| `toolRegistry/` | ツール定義・ルーティング | readTools / renderTools / navigateTools / operationTools の4ファイル分割済み |
| `scenarios/` | mock ベースの文言 | Wizard ステップ定義に転換 |
| `aiTools/` | ツール実装 | そのまま（`getFieldOptions` 登録を追加） |

---

## navigate ツール（UIナビゲーション専用）

`kind: 'navigate'` のツールはドメインデータを変更しない。Fast Path でも安全に実行できる。

### AI → UI コマンドの2パターン

```
パターン1: Zustand ストアを直接変更（canvasLayoutStore / canvasDisplayStore 等）
  navigateTools.ts → useCanvasLayoutStore.getState().setCanvasPanelStyle(...)
  → ストア変更 → React が自動的に再レンダー

パターン2: uiCommandStore dispatch（React local state の制御）
  navigateTools.ts → useUICommandStore.getState().dispatch({ type: 'setMainViewMode', mode })
  → EditViewCore の useEffect が購読 → setMainViewMode(mode)
  例: mainViewMode は EditViewCore の local useState のため直接変更不可
```

### 現在の navigate ツール一覧

| ツール | 実装パターン | 用途 |
|---|---|---|
| `ui_set_main_view` | dispatch（mainViewMode は local state） | 組織図/表形式の切り替え |
| `ui_set_canvas_display` | 直接 getState() | ツリー/コンパクト・グループ・比較モード制御 |
| `ui_show_person` | 直接 getState() | 人物検索+フォーカス |
| `ui_focus_row` | 直接 getState() | rowId フォーカス |
| `ui_open_operation` | dispatch（操作フォームは PersonOperationPanel local state） | フォームを開く+事前入力 |
| `ui_get_form_state` | formStateStore 読み取り（kind: read） | フォーム現在値取得 |
| `ui_suggest_form_field` | formStateStore 書き込み | フォームフィールド設定 |

設計指針（いつツールを追加すべきか）は `specs/G4-ai/03-ai-ui-policy.md` の「navigate ツールの設計指針」参照。
