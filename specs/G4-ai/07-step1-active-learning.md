# G4-07 STEP1 能動的ルール構築 実装リファレンス

> **設計方針**: `docs/16-ai-feedback-loop.md`
> **ステータス**: 実装済み（Phase 1〜3）
> **対象**: STEP1 — HR専門家（1〜3名）が能動的にAIに業務ルールを教えるフロー

---

## 概要

HR専門家がAIと対話しながら、暗黙の業務ルールを形式知化していく仕組み。
専門家の訂正を即座に分類し、適切な成果物（ツール説明・ルール・スキル・Code Fix依頼）を生成する。
すべて localStorage で完結し、サーバー不要。

| フェーズ | 内容 | 状態 |
|---|---|---|
| Phase 1: 訂正キャプチャ | 「AIに教える」ボタンで訂正を捕捉し、LLM 1回呼び出しで分類する | ✓ |
| Phase 2: 即時適用 | ツール説明・業務ルール・スキルが確認後に即時反映される | ✓ |
| Phase 3: 管理UI | スキル一覧・Code Fix蓄積・全データ管理が使える | ✓ |
| 自動スキル検出（オプション） | tool呼び出し列の重複パターンから自動提案 | ✗ 未実装 |

---

## データ型定義

```typescript
// apps/web/src/infrastructure/ai/feedback/types.ts

// 訂正キャプチャ
export interface CorrectionCapture {
  id: string                    // ulid
  sessionId: string
  trigger: 'explicit' | 'auto'  // 「AIに教える」ボタン or 自動検出
  conversationWindow: Array<{   // 訂正前後の会話（最大10件）
    role: 'user' | 'assistant'
    content: string
  }>
  userCorrection: string        // 訂正メッセージ本文
  createdAt: number
}

// 分類結果と生成物
export type CorrectionKind =
  | 'tool_description_issue'
  | 'business_rule_gap'
  | 'workflow_pattern'
  | 'tool_logic_bug'
  | 'missing_tool'

export interface ClassifiedCorrection {
  id: string
  captureId: string
  kind: CorrectionKind
  confidence: number
  reasoning: string             // 分類の根拠（ユーザーに見せる）

  // kind別の生成物（いずれか1つ）
  toolDescriptionDraft?: {
    targetTool: string
    currentDescription: string
    proposedDescription: string
  }
  businessRuleDraft?: {
    ruleText: string            // システムプロンプトに追記するテキスト
  }
  skillDraft?: LocalSkill       // 既存の Skill 型（infrastructure/skills/types.ts）を流用
  codeFixDraft?: {
    title: string
    description: string
    expectedBehavior: string
    targetTool?: string
  }

  status: 'pending' | 'applied' | 'rejected'
  createdAt: number
}

// Code Fix蓄積（STEP1・STEP2共通）
export interface AiCodeFixRequest {
  id: string
  classification: 'tool_logic_bug' | 'missing_tool'
  targetKey?: string
  title: string
  description: string
  expectedBehavior: string
  exampleInputs: object[]
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: number
}
```

### localStorageキー（`feedbackStore.ts`）

```typescript
const LS_KEYS = {
  // STEP1
  corrections:   'ai_feedback:corrections',   // CorrectionCapture[]
  classified:    'ai_feedback:classified',     // ClassifiedCorrection[]
  localSkills:   'ai_feedback:skills',         // LocalSkill[]（実体は skill_store_v1 / LocalSkillRepository を流用）
  // 共通
  codeFixes:     'ai_feedback:codefixes',      // AiCodeFixRequest[]
  appliedRules:  'ai_feedback:applied',        // AiAppliedRule[]（05-feedback-loop 参照）
}
```

---

## Phase 1 — 訂正キャプチャ

### トリガー

主要トリガーはチャットUI上、各アシスタントメッセージの横にある「AIに教える」ボタン。
押すと直前の会話（最大10件）をキャプチャし、専門家に「どう修正すべきか」を入力させる
テキストエリアを表示、送信で分類器を起動する。

AgentRunner による自動検出（訂正パターンのキーワードマッチで「記録しますか？」と提案する仕組み）は
**未実装**。現状は「AIに教える」ボタンで代替している。

### 分類器（`correctionClassifier.ts`）

訂正キャプチャを受け取り、1回のLLM呼び出しで分類・生成物を作成する（`classifyCorrection()`）。
プロンプトの入力は会話ウィンドウ（最大10件）・専門家の訂正メッセージ・現在のツール名と説明文の一覧・
5種類の分類基準。

```
tool_description_issue:
  AIが別のツールを使うべき場面で誤ったツールを選んだ。ツール説明文を修正すれば解消できる。
  → proposedDescription を生成する

business_rule_gap:
  AIが業務ルールを知らなかったため誤った提案・判断をした。コードは正しいが知識が不足している。
  → ruleText を1〜2文で生成する（「〜の場合は〜する」形式）

workflow_pattern:
  複数のツールを特定の順序で使うべき場面で、AIがその手順を知らなかった。
  → LocalSkill のdraft（name・instructions・allowedTools）を生成する

tool_logic_bug:
  ツールが返すデータが正確でない、または動作が期待と異なる。コードの修正が必要。
  → title・description・expectedBehavior を生成する

missing_tool:
  専門家が求める操作を実行できるツールが存在しない。新しいツールの追加が必要。
  → title・description・expectedBehavior を生成する
```

出力例（JSON）:

```json
{
  "kind": "business_rule_gap",
  "confidence": 0.95,
  "reasoning": "出向中のband変更に対してユーザーが明示的に訂正した。コードではなく業務知識の欠如。",
  "businessRuleDraft": {
    "ruleText": "出向中（secondmentToCompany が設定されている）の従業員のbandは変更してはいけない。"
  }
}
```

### 分類結果の表示

分類完了後、チャットに生成物のプレビューを表示する。`tool_description_issue` / `business_rule_gap` /
`workflow_pattern` は「編集・適用・却下」ボタン付きで提案内容を表示、`tool_logic_bug` / `missing_tool` は
「コード修正依頼として記録します」という文言で Code Fix プレビューを表示する。編集機能は Phase 3 管理UIで対応。

---

## Phase 2 — 即時適用

kind ごとの適用先と実装箇所:

| kind | 適用処理 | 実装箇所 |
|---|---|---|
| `tool_description_issue` | `toolRegistry.applyDescriptionOverrides()` で即時上書き、`appliedRules` にロールバック用の前後差分を記録 | `useChatHandlers.handleClassificationApply` |
| `business_rule_gap` | `appliedRules` に `learned_rule` として保存 | `feedbackStore` + システムプロンプト注入 |
| `workflow_pattern` | 既存の `useSkillStore.save()` 経由で `LocalSkillRepository` に保存 | Phase 3 の `SkillsPanel` と共通の保存経路 |
| `tool_logic_bug` / `missing_tool` | `feedbackStore.saveCodeFix()` で Code Fix依頼として記録 | — |

### システムプロンプトへの学習済みルール注入

`buildCurrentSystemPrompt`（`useChatHandlers.ts`）内で、`appliedRules` のうち `kind === 'learned_rule'`
かつ `isActive` なものを箇条書きで注入する:

```typescript
const learnedRules = feedbackStore.getAppliedRules()
  .filter(r => r.kind === 'learned_rule' && r.isActive)
  .map(r => `- ${r.newContent}`)
  .join('\n')

const systemPrompt = baseSystemPrompt
  + (learnedRules ? `\n\n【学習済み業務ルール】\n${learnedRules}` : '')
```

### スキルの自動ロード

`workflow_pattern` の適用で保存された `LocalSkill` は、既存の `LocalSkillRepository` の仕組みにより
`skillLoader.ts` が次回起動時から自動的にツールとして展開する（追加実装は不要だった）。

### 起動時の復元

アプリ起動時（`useChatHandlers` の `useEffect`）に、適用済みの `tool_description` ルールを
`appliedRules` から読み出し `toolRegistry.applyDescriptionOverrides()` で再適用する。

---

## Phase 3 — 管理UI

チャット画面の🧠ボタン（`AIChatDrawer.tsx`）から `FeedbackPanel` を開く。管理者専用にはしない。

```
apps/web/src/components/ai/FeedbackPanel/
  index.tsx           ← パネルシェル・タブ切替
  DashboardView.tsx    ← 学習状況ダッシュボード（キャプチャ件数・適用済み件数・Code Fix未解決件数）
  PendingView.tsx      ← 承認待ち一覧
  CodeFixView.tsx      ← Code Fix一覧・Markdownエクスポート（クリップボードコピー）
  DataView.tsx         ← データ管理（エクスポート・インポート・クリア・リセット）
```

スキル一覧・編集・有効/無効化は既存の `SkillsPanel`（`apps/web/src/components/ai/SkillsPanel/`）への
リンクで代替し、専用UIは作らなかった。

### DashboardView

`feedbackStore.getStats()` の集計値をカード表示する。表示項目: 訂正キャプチャ累計件数、適用済み改善
（ツール説明の改善件数・業務ルールの追加件数・スキルの作成件数）、承認待ち件数、Code Fix未解決件数。
各カードはタップで該当タブ（pending / skills / codefixes / data）に遷移する。

### PendingView

分類結果（`ClassifiedCorrection`）の一覧。フィルタタブは「承認待ち／適用済み／却下済み／全て」の4種。
各カードは元の訂正テキスト（`capture.userCorrection`）と分類結果を表示し、`pending` のもののみ
`ClassificationResultWidget` で「適用・却下」操作ができる。適用済み・却下済みは `reasoning` のみ表示。

### Code Fix エクスポート形式

選択した Code Fix依頼を Claude Code 向け Markdown として生成しクリップボードにコピーする:

```markdown
# AI フィードバック由来のコード修正タスク

## 1. [tool_logic_bug] getPersonDetail: 出向者でprevDeptCodeがnull
**対象ツール**: getPersonDetail（aiTools/read.ts）
**問題**: 出向中フラグ(secondmentToCompany)がある行でgetPersonDetailを呼ぶとprevDepartmentCodeがnullになる
**期待される挙動**: prevDepartmentCodeには出向前の所属組織コードが入るべき

## 2. [missing_tool] 兼務を一括解除するツールがない
...
```

### データ管理

- 全データをエクスポート → JSONファイルダウンロード（バックアップ）
- データをインポート → 別デバイス・別ブラウザへの移行（チーム共有もエクスポートJSONの受け渡しで可能。サーバー不要）
- 訂正履歴をクリア → キャプチャ・分類結果を削除。適用済みは残す
- すべてリセット → 全削除（確認ダイアログあり。適用済みルールも失われる旨を明示）

---

## 未実装事項

- **AgentRunner の自動検出提案**: キーワードベースで訂正パターンを検出し「記録しますか？」と提案する UI。
  現状は「AIに教える」ボタンによる明示的トリガーのみで運用しており、優先度は低い。
- **自動スキル検出**: AgentRunner が同一セッション内で同じtool呼び出し順序を3回以上実行した場合に、
  セッション終了時「このパターンをスキルとして登録しますか？」と提案する仕組み。未着手。

---

## 主要ファイル一覧

```
apps/web/src/infrastructure/ai/feedback/
  types.ts                  ← CorrectionCapture / ClassifiedCorrection / AiCodeFixRequest 等
  feedbackStore.ts          ← localStorage read/write（corrections / classified / codeFixes / appliedRules）
  correctionDetector.ts     ← キーワードベースの自動検出（detectCorrection）
  correctionClassifier.ts   ← 分類器（LLM 1回呼び出し）

apps/web/src/components/ai/
  FeedbackPanel/            ← 管理UI（Dashboard / Pending / CodeFix / Data）
  SkillsPanel/               ← スキル一覧・編集（既存流用）
  AIChatDrawer.tsx           ← 🧠ボタンから FeedbackPanel を開く
  useChatHandlers.ts         ← 分類結果の適用ロジック・システムプロンプト注入・起動時復元

apps/web/src/infrastructure/skills/
  localSkillRepository.ts   ← LocalSkill の永続化（workflow_pattern の保存先）
apps/web/src/infrastructure/ai/skillLoader.ts  ← ローカルスキルの自動ロード
```
