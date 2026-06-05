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

## 現状との対応関係

| 現状のファイル | 役割 | 再設計後 |
|---|---|---|
| `agentRunner.ts` | ツール use ループ | Intent Classifier + Tier ルーター に拡張 |
| `toolRegistry.ts` | ツール定義 | そのまま（登録漏れを修正） |
| `scenarios/` | mock ベースの文言 | Wizard ステップ定義に転換 |
| `aiTools/` | ツール実装 | そのまま（`getFieldOptions` 登録を追加） |
