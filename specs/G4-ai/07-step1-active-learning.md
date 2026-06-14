# G4-07 STEP1 能動的ルール構築 実装仕様

> **設計方針**: `docs/16-ai-feedback-loop.md`
> **ステータス**: 未実装（Phase 1 から着手）
> **対象**: STEP1 — HR専門家（1〜3名）が能動的にAIに業務ルールを教えるフロー

---

## 概要

HR専門家がAIと対話しながら、暗黙の業務ルールを形式知化していく仕組み。
専門家の訂正を即座に分類し、適切な成果物（ツール説明・ルール・スキル・Code Fix依頼）を生成する。
すべてlocalStorageで完結し、サーバー不要。

| フェーズ | 完了条件 |
|---|---|
| Phase 1: 訂正キャプチャ | 「AIに教える」ボタンと自動検出が機能し、分類結果がチャットに表示される |
| Phase 2: 即時適用 | ツール説明・業務ルール・スキルが確認後に即時反映される |
| Phase 3: 管理UI | スキル一覧・Code Fix蓄積・全データ管理が使える |

---

## データ型定義

```typescript
// apps/web/src/infrastructure/ai/feedback/types.ts に追加

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
  skillDraft?: LocalSkill       // 後述
  codeFixDraft?: {
    title: string
    description: string
    expectedBehavior: string
    targetTool?: string
  }

  status: 'pending' | 'applied' | 'rejected'
  createdAt: number
}

// localStorageに保存するスキル（SKILL.mdのJSON版）
export interface LocalSkill {
  id: string
  slug: string
  name: string
  description: string           // いつ使うか
  instructions: string          // ステップバイステップの手順（Markdown）
  allowedTools: string[]        // 主に使うツール名
  sourceCaptures: string[]      // 元になったキャプチャID
  isActive: boolean
  createdAt: number
  updatedAt: number
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

---

## localStorageキー

```typescript
// apps/web/src/infrastructure/ai/feedback/feedbackStore.ts に追加

const LS_KEYS = {
  // STEP1
  corrections:   'ai_feedback:corrections',   // CorrectionCapture[]
  classified:    'ai_feedback:classified',     // ClassifiedCorrection[]
  localSkills:   'ai_feedback:skills',         // LocalSkill[]
  // 共通
  codeFixes:     'ai_feedback:codefixes',      // AiCodeFixRequest[]
  appliedRules:  'ai_feedback:applied',        // AiAppliedRule[]（05-feedback-loop参照）
}
```

---

## Phase 1 — 訂正キャプチャ

### 1-1. 「AIに教える」ボタン（主要トリガー）

チャットUI上のアシスタントメッセージの横に配置。

```
[アシスタントの回答]  [👍] [👎] [AIに教える]
```

「AIに教える」を押すと:
1. 直前の会話（最大10件）をキャプチャ
2. 専門家に「どう修正すべきか」を入力させるテキストエリアを表示
3. 送信 → 分類器を起動

```typescript
// CorrectionCapture を作成して feedbackStore に保存
// → 分類器を呼び出す（Phase 1-3）
```

### 1-2. 自動検出（補助トリガー）

AgentRunner の `run()` 内で、ユーザーメッセージが訂正パターンに合致するか判定する。
判定はキーワードベース（LLM呼び出しなし）。

```typescript
// apps/web/src/infrastructure/ai/feedback/correctionDetector.ts

const CORRECTION_PATTERNS = [
  /それは違[うい]/,
  /実際には/,
  /正しくは/,
  /〜の場合は/,
  /そうではなく/,
  /もしかして.*間違/,
]

export function detectCorrection(userMessage: string): boolean {
  return CORRECTION_PATTERNS.some(p => p.test(userMessage))
}
```

検出された場合、AgentRunner がテキスト応答の末尾に提案を追加する:

```
（通常の回答）

---
💡 この内容を業務ルールとして記録しますか？ [記録する]
```

「記録する」を押すと「AIに教える」ボタンと同じフローへ。

### 1-3. 分類器

訂正キャプチャを受け取り、1回のLLM呼び出しで分類・生成物を作成する。

```typescript
// apps/web/src/infrastructure/ai/feedback/correctionClassifier.ts

export async function classifyCorrection(
  capture: CorrectionCapture,
  adapter: OpenAICompatibleAdapter,
): Promise<ClassifiedCorrection> {
  const prompt = buildClassifierPrompt(capture)
  const result = await adapter.complete(
    [{ role: 'user', content: prompt }],
    [],
    { temperature: 0.2 },
  )
  return parseClassifierOutput(capture.id, result.content)
}
```

**分類器プロンプト**の入力:
- 会話ウィンドウ（最大10件）
- 専門家の訂正メッセージ
- 現在のツール名と説明文の一覧
- 5種類の分類基準（下記）

**分類基準（プロンプトに含める）:**

```
tool_description_issue:
  AIが別のツールを使うべき場面で誤ったツールを選んだ。
  ツール説明文を修正すれば解消できる。
  → proposedDescription を生成する

business_rule_gap:
  AIが業務ルールを知らなかったため誤った提案・判断をした。
  コードは正しいが知識が不足している。
  → ruleText を1〜2文で生成する（「〜の場合は〜する」形式）

workflow_pattern:
  複数のツールを特定の順序で使うべき場面で、AIがその手順を知らなかった。
  → LocalSkill のdraft（name・instructions・allowedTools）を生成する

tool_logic_bug:
  ツールが返すデータが正確でない、または動作が期待と異なる。
  コードの修正が必要。
  → title・description・expectedBehavior を生成する

missing_tool:
  専門家が求める操作を実行できるツールが存在しない。
  新しいツールの追加が必要。
  → title・description・expectedBehavior を生成する
```

**出力形式（JSON）:**

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

### 1-4. 分類結果の表示

分類完了後、チャットに生成物のプレビューを表示する。専門家はそこで内容を確認・修正できる。

```
🔍 分類結果: 業務ルールの欠如（信頼度 95%）

理由: 出向中のband変更に対して明示的に訂正がありました。

追加するルール:
「出向中（secondmentToCompany が設定されている）の従業員のbandは変更してはいけない。」

[✏️ 編集] [✅ 適用] [❌ 却下]
```

`tool_logic_bug` / `missing_tool` の場合:

```
🐛 コード修正依頼として記録します

タイトル: 出向者でprevDeptCodeがnullになる
内容: 出向中フラグがある行でgetPersonDetailを呼ぶと...
期待動作: prevDepartmentCodeには出向前の所属組織コードが入るべき

[✅ 記録] [✏️ 編集] [❌ 却下]
```

---

## Phase 2 — 即時適用

### 2-1. ツール説明文の更新

```typescript
function applyToolDescriptionFix(classified: ClassifiedCorrection): void {
  const { targetTool, proposedDescription } = classified.toolDescriptionDraft!
  // 既存の仕組みをそのまま流用
  toolRegistry.applyDescriptionOverrides({ [targetTool]: proposedDescription })
  // appliedRules に記録（ロールバック用）
  feedbackStore.saveAppliedRule({
    id: ulid(), kind: 'tool_description',
    targetKey: targetTool,
    prevContent: classified.toolDescriptionDraft!.currentDescription,
    newContent: proposedDescription,
    appliedAt: Date.now(), isActive: true,
    basedOnProposedId: classified.id,
  })
  feedbackStore.saveClassified({ ...classified, status: 'applied' })
}
```

### 2-2. 業務ルールの追加

```typescript
function applyBusinessRule(classified: ClassifiedCorrection): void {
  const { ruleText } = classified.businessRuleDraft!
  feedbackStore.saveAppliedRule({
    id: ulid(), kind: 'learned_rule',
    targetKey: ulid(),  // ルールごとに一意なキー
    newContent: ruleText,
    appliedAt: Date.now(), isActive: true,
    basedOnProposedId: classified.id,
  })
  feedbackStore.saveClassified({ ...classified, status: 'applied' })
  // 次のAgentRunner起動時にシステムプロンプトへ注入される（後述）
}
```

システムプロンプト注入（`buildAPIMessages` 内）:

```typescript
const learnedRules = feedbackStore.getAppliedRules()
  .filter(r => r.kind === 'learned_rule' && r.isActive)
  .map(r => `- ${r.newContent}`)
  .join('\n')

const systemPrompt = baseSystemPrompt
  + (learnedRules ? `\n\n【学習済み業務ルール】\n${learnedRules}` : '')
```

### 2-3. スキルの保存と有効化

```typescript
function applySkillDraft(classified: ClassifiedCorrection): void {
  const skill: LocalSkill = {
    ...classified.skillDraft!,
    id: ulid(),
    isActive: true,
    createdAt: Date.now(), updatedAt: Date.now(),
    sourceCaptures: [classified.captureId],
  }
  feedbackStore.saveLocalSkill(skill)
  feedbackStore.saveClassified({ ...classified, status: 'applied' })
  // skillLoader が次回から自動でピックアップする（後述）
}
```

**skillLoader への組み込み** (`infrastructure/ai/skillLoader.ts`):

```typescript
// 既存の静的SKILL.mdに加え、localStorageのスキルもロードする
export async function loadSkills(): Promise<SkillToolEntry[]> {
  const staticSkills = await loadStaticSkills()   // 既存ロジック
  const localSkills  = loadLocalSkills()           // localStorage から
  return [...staticSkills, ...localSkills]
}

function loadLocalSkills(): SkillToolEntry[] {
  return feedbackStore.getLocalSkills()
    .filter(s => s.isActive)
    .map(s => ({
      slug:         s.slug,
      name:         s.name,
      instructions: s.instructions,
      allowedTools: s.allowedTools,
      definition: {
        type: 'function',
        function: {
          name:        `skill_${s.slug}`,
          description: s.description,
          parameters:  { type: 'object', properties: {} },
        },
      },
    }))
}
```

### 2-4. Code Fix依頼の記録

```typescript
function recordCodeFix(classified: ClassifiedCorrection): void {
  feedbackStore.saveCodeFix({
    id: ulid(),
    classification: classified.kind as 'tool_logic_bug' | 'missing_tool',
    targetKey:       classified.codeFixDraft!.targetTool,
    title:           classified.codeFixDraft!.title,
    description:     classified.codeFixDraft!.description,
    expectedBehavior:classified.codeFixDraft!.expectedBehavior,
    exampleInputs:   [],
    status:          'pending',
    createdAt:       Date.now(),
  })
  feedbackStore.saveClassified({ ...classified, status: 'applied' })
}
```

### 2-5. 起動時の復元

アプリ起動時（`chatServiceFactory.ts` または `HRApplicationService` の初期化）:

```typescript
// 適用済みtool descriptionをlocalStorageから復元
const activeDescriptions = Object.fromEntries(
  feedbackStore.getAppliedRules()
    .filter(r => r.kind === 'tool_description' && r.isActive)
    .map(r => [r.targetKey, r.newContent])
)
toolRegistry.applyDescriptionOverrides(activeDescriptions)
```

---

## Phase 3 — 管理UI

チャット画面内のサイドパネルまたは設定画面として配置する。管理者専用にはしない。

### 3-1. 学習状況ダッシュボード

```
┌─ AI 学習状況（STEP1）──────────────────────────────┐
│                                                    │
│  訂正キャプチャ  12件（今週 3件）                  │
│                                                    │
│  適用済み改善                                      │
│    ツール説明の改善  2件                           │
│    業務ルールの追加  4件                           │
│    スキルの追加      1件                           │
│                                                    │
│  Code Fix 依頼（コード変更が必要）                 │
│    未解決  3件  [まとめてエクスポート]             │
│                                                    │
│  承認待ち  1件                                     │
└────────────────────────────────────────────────────┘
```

### 3-2. スキル管理

```
スキル一覧
  ├── [有効] 部署統廃合ワークフロー
  │     使用条件: 「統廃合」「部署をまとめる」...
  │     手順: 1. propose_concurrent_release ...
  │     [編集] [無効化]
  │
  ├── [有効] 昇格処理フロー（自動検出）
  │     ...
  │
  └── [+ 新しいスキルを手動追加]
```

スキル編集はMarkdownエディタで手順を直接編集できる。

### 3-3. Code Fix エクスポート

選択した Code Fix依頼をClaude Code向けMarkdownとして生成・クリップボードコピー:

```markdown
# AI フィードバック由来のコード修正タスク

## 1. [tool_logic_bug] getPersonDetail: 出向者でprevDeptCodeがnull
**対象ツール**: getPersonDetail（aiTools/read.ts）
**問題**: 出向中フラグ(secondmentToCompany)がある行でgetPersonDetailを呼ぶとprevDepartmentCodeがnullになる
**期待される挙動**: prevDepartmentCodeには出向前の所属組織コードが入るべき

## 2. [missing_tool] 兼務を一括解除するツールがない
...
```

### 3-4. データ管理

```
データ管理
  [全データをエクスポート]  → JSONファイルダウンロード（バックアップ）
  [データをインポート]      → 別デバイス・別ブラウザへの移行
  [訂正履歴をクリア]        → キャプチャ・分類結果を削除。適用済みは残す
  [すべてリセット]          → 全削除（確認ダイアログあり。適用済みルールも失われる旨を明示）
```

**インポート機能**（他デバイスへの知識移行）:  
エクスポートしたJSONをインポートすると、適用済みルール・スキルが復元される。  
チームで共有したいときはエクスポートJSONを渡せばよい（サーバー不要）。

---

## 自動スキル検出（オプション）

AgentRunner が同一セッション内で同じtool呼び出し順序を3回以上実行した場合、
セッション終了時に「このパターンをスキルとして登録しますか？」を提案する。

```typescript
// AgentRunner 内でtool呼び出し列を記録
// セッション終了（もしくはパネルを開いたとき）に重複パターンを検出
// 検出したパターンからskillDraft を生成してユーザーに提示
```

---

## 実装チェックリスト

### Phase 1: 訂正キャプチャ

- ✓ `types.ts` に `CorrectionCapture`, `ClassifiedCorrection`, `AiAppliedRule`, `AiCodeFixRequest` を追加
  - 注: `LocalSkill` は既存の `Skill` 型（`infrastructure/skills/types.ts`）を流用
- ✓ `feedbackStore.ts` に corrections / classified / codeFixes / appliedRules の read/write を追加
  - 注: localSkills は既存の `skill_store_v1`（`LocalSkillRepository`）を流用
- ✓ `correctionDetector.ts` — キーワードベースの自動検出
- ✓ `correctionClassifier.ts` — 分類器（LLM 1回呼び出し）
- ✓ `buildClassifierPrompt()` — 5種類の分類基準を含むプロンプト
- ✓ チャットUIの各アシスタントメッセージに「AIに教える」ボタンを追加
- ✓ 「AIに教える」押下 → 訂正入力 → キャプチャ保存 → 分類器呼び出しのフロー
- ✗ AgentRunner の自動検出 → 「記録する」提案の追加（既存の「AIに教える」ボタンで代替）
- ✓ 分類結果のチャット内プレビュー表示（適用・却下ボタン付き）
  - 注: 編集機能は Phase 3 管理UIで対応

### Phase 2: 即時適用

- ✓ `applyToolDescriptionFix()` — ツール説明文の即時更新（`useChatHandlers.handleClassificationApply`）
- ✓ `applyBusinessRule()` — 業務ルールの追加（feedbackStore + システムプロンプト注入）
- ✓ `applySkillDraft()` — スキルを既存の `useSkillStore.save()` 経由で保存
- ✓ `recordCodeFix()` — Code Fix依頼の記録
- ✗ `skillLoader.ts` に `loadLocalSkills()` を追加 — 既存の `LocalSkillRepository` で自動対応済み
- ✓ `buildCurrentSystemPrompt` に learned_rule 注入を追加（`useChatHandlers.ts`）
- ✓ アプリ起動時の `appliedRules` 復元処理（`useChatHandlers` の `useEffect`）

### Phase 3: 管理UI

- ✓ 学習状況ダッシュボードコンポーネント（`FeedbackPanel/DashboardView.tsx`）
- ✓ スキル一覧・編集・有効/無効化 UI → 既存 `SkillsPanel` を流用（リンクで遷移）
- ✓ Code Fix一覧・エクスポート（Markdownクリップボード）（`FeedbackPanel/CodeFixView.tsx`）
- ✓ データ管理（エクスポート・インポート・クリア・リセット）（`FeedbackPanel/DataView.tsx`）
- ✓ 承認待ち一覧（`FeedbackPanel/PendingView.tsx`）
- ✓ AIChatDrawer の🧠ボタンからパネルを開けるよう `AIChatDrawer.tsx` を更新

### 自動スキル検出（オプション）

- ✗ AgentRunner でtool呼び出し列を記録
- ✗ 重複パターン検出とskillDraft生成
- ✗ ユーザーへの提案UI
