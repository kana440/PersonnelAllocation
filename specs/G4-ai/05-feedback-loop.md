# G4-05 AI フィードバックループ 実装仕様（STEP2）

> **設計方針**: `docs/16-ai-feedback-loop.md`
> **ステータス**: 未実装（STEP2 移行後に着手）
> **対象**: STEP2 — 部門担当者など不特定多数が利用する環境

> **STEP1の実装仕様は `specs/G4-ai/07-step1-active-learning.md` を参照。**
> このファイルはSTEP2の統計的フィードバックループのみを扱う。

---

## 設計方針

**不特定多数ユーザーの暗黙的シグナルを統計的に集約し、HR専門家がレビューして適用する。**

| 観点 | 方針 |
|---|---|
| プライバシー | 会話スナップショットを含むすべてのデータがデバイスから出ない |
| ストレージ | localStorage を一次ストア。サーバーDB同期はオプション |
| 複数ユーザー集約 | STEP2のオプション同期（Phase 4）で対応 |
| ストレージ上限 | エントリ数上限で管理。古いものから自動削除 |

**データの永続性**:
- localStorage に保存するため、ウィンドウを閉じても・タブを閉じても・ブラウザを再起動しても**データは消えない**
- `sessionId` だけは sessionStorage（タブ閉じでリセット）。これは「独立セッション数」を正しく数えるための意図的な設計
- データが消えるのは: ブラウザの「サイトデータをクリア」を実行したとき、または Feedback UI のデータ管理機能を使ったとき
- `appliedRules`（適用済みルール）は定期的にエクスポートしておくことを推奨

---

## データ型定義

```typescript
// apps/web/src/infrastructure/ai/feedback/types.ts

export type SignalKind = 'message_feedback' | 'confirm_result' | 'undo_after_approve'

export interface AiSignal {
  id: string                // ulid
  sessionId: string         // sessionStorage の UUID（タブ閉じでリセット）
  kind: SignalKind
  weight: number            // -3 | -2 | -1 | +1
  toolName?: string
  intentKey?: string        // ツール名+操作種別（値は含まない）
  messageId?: string
  delayMs?: number          // undo_after_approve 時
  createdAt: number         // unixepoch ms
}

export interface AiSignalContext {
  signalId: string
  // 前後3件のメッセージ。tool_result の生データは除外。
  messageWindow: Array<{ role: 'user' | 'assistant'; content: string }>
  // ツール名と intentKey のみ（引数の値は含まない）
  toolCallTrace: Array<{ toolName: string; intentKey: string }>
  createdAt: number
}

export type ProposedRuleStatus = 'pending' | 'applied' | 'rejected'

export interface AiProposedRule {
  id: string
  classification: 'tool_description_issue' | 'business_rule_gap'
  targetKey?: string        // tool_description_issue: ツール名
  proposedContent?: string  // tool_description_issue: 改善後の説明文
  learnedRule?: string      // business_rule_gap: プロンプトに追記するテキスト
  reasoning: string
  confidenceScore: number
  signalIds: string[]
  independentSessions: number
  windowDays: number
  hasConflict: boolean
  status: ProposedRuleStatus
  createdAt: number
}

export interface AiCodeFixRequest {
  id: string
  classification: 'tool_logic_bug' | 'missing_tool'
  targetKey?: string
  title: string
  description: string
  expectedBehavior: string
  exampleInputs: object[]   // 再現パターン（値は匿名化）
  signalIds: string[]
  independentSessions: number
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: number
}

export interface AiAppliedRule {
  id: string
  kind: 'tool_description' | 'learned_rule'
  targetKey: string         // tool_description: ツール名 / learned_rule: 任意キー
  prevContent?: string      // ロールバック用
  newContent: string
  appliedAt: number
  isActive: boolean
  basedOnProposedId?: string
}
```

---

## ストレージ管理

```typescript
// apps/web/src/infrastructure/ai/feedback/feedbackStore.ts

const LS_KEYS = {
  signals:       'ai_feedback:signals',
  contexts:      'ai_feedback:contexts',
  proposedRules: 'ai_feedback:proposed',
  codeFixes:     'ai_feedback:codefixes',
  appliedRules:  'ai_feedback:applied',
} as const

// エントリ上限（超えたら古いものから削除）
const LIMITS = {
  signals:  300,
  contexts:  50,   // 会話スナップショットはサイズが大きい
}

// 各エンティティの read/write/prune は feedbackStore が一元管理
export const feedbackStore = {
  getSignals():        AiSignal[]          { ... }
  addSignal(s):        void                { ...; pruneIfNeeded('signals') }
  getContexts():       AiSignalContext[]   { ... }
  addContext(c):       void                { ...; pruneIfNeeded('contexts') }
  getProposedRules():  AiProposedRule[]    { ... }
  saveProposedRule(r): void                { ... }
  getCodeFixes():      AiCodeFixRequest[]  { ... }
  saveCodeFix(r):      void                { ... }
  getAppliedRules():   AiAppliedRule[]     { ... }
  saveAppliedRule(r):  void                { ... }
  exportAll():         string              { JSON全体をbase64でエクスポート }

  // データ管理
  clearSignals():      void   { signals と contexts を削除。appliedRules は残す }
  clearAll():          void   { すべて削除（appliedRules も含む）。適用済みtool descriptionが失われる }
  getStats():          FeedbackStats  { 学習状況サマリーを返す（後述）}
}
```

---

## セッションID

```typescript
// apps/web/src/infrastructure/ai/feedback/session.ts

export function getOrCreateSessionId(): string {
  const key = 'ai_session_id'
  // sessionStorage を使う → タブを閉じると新しいセッションIDになる
  // = 「独立セッション」の自然な定義
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = ulid()
    sessionStorage.setItem(key, id)
  }
  return id
}
```

---

## 分類ごとの適用パス

```
シグナル蓄積（localStorage）
    ↓
AIバリデーター（クライアント側でAIアダプター呼び出し）
    ├── tool_description_issue
    │     → AiProposedRule に保存
    │     → ユーザーが Feedback UI で確認・適用
    │     → 適用: feedbackStore.appliedRules に追加
    │             → toolRegistry.applyDescriptionOverrides() で即時反映
    │
    ├── business_rule_gap
    │     → AiProposedRule に保存
    │     → ユーザーが Feedback UI で確認・適用
    │     → 適用: システムプロンプトの末尾に追記テキストとして注入
    │
    ├── tool_logic_bug / missing_tool
    │     → AiCodeFixRequest に保存
    │     → Feedback UI から「Claude Code向けMarkdown」としてエクスポート
    │
    └── user_error → 破棄
```

---

## Phase 1 — シグナル収集

### 1-1. `intentKey` の設計

セッション固有の値（rowId・userId）を除外し、「操作の意図」だけをキーにする:

```typescript
// apps/web/src/infrastructure/ai/feedback/intentKey.ts

export function buildIntentKey(toolName: string, args: Record<string, unknown>): string {
  const FIELD_KEYED: Record<string, string> = {
    propose_field_edit:     `field=${args.field}`,
    propose_bulk_set_field: `field=${args.field}`,
  }
  const suffix = FIELD_KEYED[toolName] ?? ''
  return suffix ? `${toolName}:${suffix}` : toolName
}
```

### 1-2. `emitSignal()` ユーティリティ

```typescript
// apps/web/src/infrastructure/ai/feedback/emitSignal.ts

export function emitSignal(
  input: Omit<AiSignal, 'id' | 'sessionId' | 'weight' | 'createdAt'> & {
    messageWindow?: AiSignalContext['messageWindow']
    toolCallTrace?:  AiSignalContext['toolCallTrace']
  }
): void {
  // STEP1/STEP2 共通。サーバー呼び出しなし。
  const signal: AiSignal = {
    id:        ulid(),
    sessionId: getOrCreateSessionId(),
    weight:    calcWeight(input.kind, input),
    createdAt: Date.now(),
    ...input,
  }
  feedbackStore.addSignal(signal)

  if (input.messageWindow || input.toolCallTrace) {
    feedbackStore.addContext({
      signalId:      signal.id,
      messageWindow: input.messageWindow ?? [],
      toolCallTrace: input.toolCallTrace  ?? [],
      createdAt:     Date.now(),
    })
  }
}

function calcWeight(kind: SignalKind, input: typeof input): number {
  if (kind === 'undo_after_approve') return -3
  if (kind === 'confirm_result')     return input.approved ? +1 : -2
  if (kind === 'message_feedback')   return input.signal === 1 ? +1 : -1
  return 0
}
```

### 1-3. AgentRunner への組み込み

コンストラクタに `sessionId` を追加:

```typescript
class AgentRunner {
  constructor(
    private readonly adapter: OpenAICompatibleAdapter,
    extraObserver?: AITraceObserver,
    readonly model?: string,
    private readonly sessionId: string = getOrCreateSessionId(),  // NEW
  ) { ... }
}
```

confirm 処理後（[agentRunner.ts:195](../../../apps/web/src/infrastructure/ai/agentRunner.ts#L195) 周辺）:

```typescript
const confirmResult = await onConfirm(proposal.widget)
if (confirmResult.approved) {
  const applyResult = entry.executeOnApprove(args)
  appService.markLastOperationApproved()          // UndoStack に approvedAt を記録
  emitSignal({
    kind: 'confirm_result', approved: true,
    toolName: call.function.name,
    intentKey: buildIntentKey(call.function.name, args),
    // メッセージウィンドウは直前5件から組み立て（tool_result生データを除外）
    messageWindow: buildMessageWindow(messages),
    toolCallTrace: buildToolTrace(result.toolCalls),
  })
  content = JSON.stringify({ ok: true, result: applyResult })
} else {
  emitSignal({
    kind: 'confirm_result', approved: false,
    toolName: call.function.name,
    intentKey: buildIntentKey(call.function.name, args),
  })
  content = JSON.stringify({ ok: false, cancelled: true })
}
```

### 1-4. UndoStack ↔ 承認の紐付け

`HRApplicationService` に追加:

```typescript
markLastOperationApproved(): void {
  // UndoStack の最新エントリに approvedAt: Date.now() を付与
  this.undoStack.markLastApproved()
}
```

`HRApplicationService.undo()` に追加:

```typescript
undo() {
  const last = this.undoStack.peek()
  if (last?.approvedAt && Date.now() - last.approvedAt < 30_000) {
    emitSignal({
      kind: 'undo_after_approve',
      delayMs: Date.now() - last.approvedAt,
    })
  }
  // 既存ロジック...
}
```

### 1-5. 👍/👎 ボタン

チャットメッセージ（アシスタント発話のみ）に追加。投票済みはハイライト・無効化。

```typescript
emitSignal({
  kind: 'message_feedback',
  signal: 1 | -1,
  messageId,
  messageWindow: buildMessageWindow(surroundingMessages),
})
```

---

## Phase 2 — Feedback UI

サーバーのAdmin UIではなく、**チャット画面内のサイドパネルまたは設定画面**として実装する。
管理者専用にはしない（フィードバックを与えたユーザー自身が確認・操作できる）。

### 2-1. 学習状況ダッシュボード

Feedback パネルの最上部に表示。AIがどの程度学習しているかを一目で確認できる。

```
┌─ AI 学習状況 ──────────────────────────────────────────────┐
│                                                            │
│  収集シグナル   47件   👍 12  👎 8  取消 5  Undo 3         │
│                                                            │
│  パターン蓄積                                              │
│    分類実行待ち   4パターン（最短: あと1セッション）        │
│    提案済み       2件（承認待ち）                          │
│    適用済み       3件                                      │
│                                                            │
│  適用済み改善                                              │
│    ツール説明文の改善   2件                                │
│    業務ルールの追加     1件                                │
│                                                            │
│  Code Fix 依頼（コード変更が必要）   未解決 2件            │
│                                                            │
│  [フィードバックを分析]（Phase 3 以降）                    │
└────────────────────────────────────────────────────────────┘
```

`FeedbackStats` 型（`feedbackStore.getStats()` が返す）:

```typescript
interface FeedbackStats {
  signals: {
    total: number
    byKind: Record<SignalKind, number>
    positiveCount: number    // weight > 0
    negativeCount: number    // weight < 0
  }
  patterns: {
    classifiable: number     // 分類条件を満たしているが未分類
    nearlyClassifiable: Array<{
      intentKey: string
      sessionsNeeded: number // あと何セッション必要か
    }>
    proposedPending: number
    proposedApplied: number
  }
  appliedRules: {
    toolDescriptions: number
    learnedRules: number
  }
  codeFixes: {
    pending: number
    resolved: number
  }
}
```

### 2-2. Feedback パネル全体構成

```
Feedback パネル
  ├── 学習状況ダッシュボード（2-1）
  │
  ├── Proposed rules（承認待ち）
  │     [tool_description_issue]
  │       現在の説明文 vs 提案説明文（diff表示）
  │       信頼度スコア / 根拠セッション数
  │       [適用] [却下]
  │     [business_rule_gap]
  │       追記されるルールテキスト
  │       [適用] [却下]
  │
  ├── 適用済みルール
  │     kind / targetKey / appliedAt / [Rollback]
  │
  ├── Code Fix 依頼
  │     title / classification / 独立セッション数
  │     [詳細] [解決済みにする]
  │     [選択してClaude Codeへエクスポート]
  │
  ├── シグナル一覧（直近30件・折りたたみ）
  │     種別 / 重み / intentKey / 日時
  │
  └── データ管理
        [全データをエクスポート]（JSONファイルダウンロード）
        [シグナルをクリア]（蓄積データを削除。適用済みルールは残す）
        [すべてリセット]（適用済みルールも含め全削除。確認ダイアログあり）
```

**クリア操作の使い分け**:
- **シグナルをクリア**: 蓄積されたシグナル・会話スナップショットを削除する。適用済みのツール説明文や業務ルールは**残る**。フィードバック収集を仕切り直したいときに使う
- **すべてリセット**: 適用済みルールも含め全削除。ツール説明文が初期状態に戻る。確認ダイアログで「適用済みルールも失われます」を明示する

### 2-2. 適用済みルールの即時反映

`tool_description` の適用:

```typescript
// Feedback UIで [適用] を押したとき
function applyProposedRule(rule: AiProposedRule): void {
  const prev = toolRegistry.getEntry(rule.targetKey!)?.definition.function.description
  feedbackStore.saveAppliedRule({
    id: ulid(), kind: 'tool_description',
    targetKey: rule.targetKey!, prevContent: prev,
    newContent: rule.proposedContent!, appliedAt: Date.now(),
    isActive: true, basedOnProposedId: rule.id,
  })
  // 既存の仕組みをそのまま流用
  toolRegistry.applyDescriptionOverrides({ [rule.targetKey!]: rule.proposedContent! })
  // ProposedRule のステータスを applied に更新
  feedbackStore.saveProposedRule({ ...rule, status: 'applied' })
}
```

`learned_rule` の適用（business_rule_gap）:
システムプロンプト生成時に `feedbackStore.getAppliedRules()` から `kind='learned_rule'` かつ `isActive=true` を取得し末尾に追記する。

`AgentRunner` 起動時（または `buildAPIMessages` 内）:

```typescript
const learnedRules = feedbackStore.getAppliedRules()
  .filter(r => r.kind === 'learned_rule' && r.isActive)
  .map(r => `- ${r.newContent}`)
  .join('\n')

const systemPrompt = baseSystemPrompt
  + (learnedRules ? `\n\n【学習済み業務ルール】\n${learnedRules}` : '')
```

### 2-3. 起動時の復元

アプリ起動時（`HRApplicationService` または `chatServiceFactory.ts`）:

```typescript
// 適用済みのtool descriptionをlocalStorageから復元
const activeDescriptions = Object.fromEntries(
  feedbackStore.getAppliedRules()
    .filter(r => r.kind === 'tool_description' && r.isActive)
    .map(r => [r.targetKey, r.newContent])
)
toolRegistry.applyDescriptionOverrides(activeDescriptions)
```

---

## Phase 3 — AIバリデーター（クライアント側）

### 3-1. 分類トリガー

Feedback UIに「フィードバックを分析」ボタンを配置。押したときに実行。
（自動実行は実装しない。ユーザーが能動的に確認するフロー。）

### 3-2. 分類条件

```typescript
// 分類を実行するシグナルパターンの抽出条件
function extractClassifiablePatterns(): SignalPattern[] {
  const signals = feedbackStore.getSignals()
  // intentKey でグループ化
  // 条件: 独立セッション >= 3 AND 期間 >= 7日
  return groupBy(signals, s => s.intentKey)
    .filter(group =>
      countDistinct(group, s => s.sessionId) >= 3 &&
      daysBetween(group[0].createdAt, group.at(-1)!.createdAt) >= 7
    )
}
```

### 3-3. 分類器の呼び出し

既存の `OpenAICompatibleAdapter` を再利用してクライアント側で分類:

```typescript
async function classifyPattern(pattern: SignalPattern): Promise<ClassificationResult> {
  const contexts = feedbackStore.getContexts()
    .filter(c => pattern.signalIds.includes(c.signalId))
    .slice(-3)   // 最新3件

  const prompt = buildClassifierPrompt(pattern, contexts)

  // 2回独立実行して一致確認（temperature 0.1 / 0.3）
  const [r1, r2] = await Promise.all([
    adapter.complete([{ role: 'user', content: prompt }], [], { temperature: 0.1 }),
    adapter.complete([{ role: 'user', content: prompt }], [], { temperature: 0.3 }),
  ])

  const c1 = parseClassification(r1.content)
  const c2 = parseClassification(r2.content)
  if (c1.classification !== c2.classification) return null  // 不一致 → 破棄

  return { ...c1, signalIds: pattern.signalIds, independentSessions: pattern.sessionCount }
}
```

### 3-4. 分類器プロンプト

入力:
- シグナルパターンのサマリー（intentKey・weight合計・セッション数・期間）
- 代表的な会話スナップショット（最新3件の messageWindow）
- 現在のツール説明文（tool_description_issue 疑いの場合）

分類基準（プロンプトに含める）:

```
tool_description_issue: 以下を全て満たす
  - 正しいツールが別に存在する
  - 3セッション以上で同じ誤ったツール選択が観測される
  - 説明文の変更だけで解消できると推定される

business_rule_gap: 以下のいずれか
  - ユーザーが AIの業務判断に対して明示的に訂正した
  - 同種の操作で繰り返しrejectが発生し、業務ルールの欠如が原因と推定される

tool_logic_bug: 以下のいずれか
  - ツールの返すデータが現在の状態と一致していない
  - 承認後すぐにUndoされており、操作結果が期待と異なったと推定される

missing_tool: 以下を全て満たす
  - 求める操作を既存ツールがカバーしていない
  - AIが「できない」と回答しているか不適切なツールで代替している

user_error: 上記のいずれにも当てはまらない。または同セッション内でreject→承認が発生
```

出力形式（JSON）:

```json
{
  "classification": "tool_description_issue",
  "confidence": 0.92,
  "targetKey": "findPersons",
  "proposedContent": "改善後の説明文...",
  "reasoning": "3セッション・7日間で searchPersons が正しい文脈で findPersons が呼ばれた。",
  "hasConflict": false
}
```

### 3-5. Code Fix エクスポート（Markdown生成）

```typescript
function exportCodeFixBundle(ids: string[]): string {
  const fixes = feedbackStore.getCodeFixes().filter(f => ids.includes(f.id))
  return [
    '# AI フィードバック由来のコード修正タスク\n',
    '以下は AIフィードバックループで蓄積された修正依頼です。',
    '各項目を確認し、適切なコード変更を行ってください。\n',
    ...fixes.map((f, i) => [
      `## ${i + 1}. [${f.classification}] ${f.title}`,
      `**対象ツール**: ${f.targetKey ?? '（新規）'}`,
      `**問題**: ${f.description}`,
      `**期待される挙動**: ${f.expectedBehavior}`,
      `**再現パターン**: ${JSON.stringify(f.exampleInputs, null, 2)}`,
      `**独立セッション数**: ${f.independentSessions}件\n`,
    ].join('\n')),
  ].join('\n')
}
```

---

## Phase 4 — STEP2 サーバー同期（オプション）

STEP2 環境でのみ提供。複数ユーザーのフィードバックを集約したい場合に実装する。

```
POST /api/ai/feedback/sync
  body: { signals, proposedRules, codeFixes, appliedRules }
  → localStorageの内容をサーバーにアップロード

GET /api/ai/feedback/aggregate
  → 全ユーザーのシグナルを集約した Proposed Rules / Code Fixes を返す
  → クライアントは必要に応じてマージ
```

**実装しない限り STEP1 の動作に影響しない。**

---

## 実装チェックリスト

### Phase 1: シグナル収集

- ✗ `apps/web/src/infrastructure/ai/feedback/` ディレクトリ作成
- ✗ `types.ts` — 型定義
- ✗ `feedbackStore.ts` — localStorage read/write/prune
- ✗ `session.ts` — sessionId 管理
- ✗ `intentKey.ts` — `buildIntentKey()`
- ✗ `emitSignal.ts` — シグナル送信ユーティリティ
- ✗ AgentRunner に `sessionId` を追加・confirm 後のシグナル送信
- ✗ `HRApplicationService.markLastOperationApproved()` 実装
- ✗ `UndoStack.markLastApproved()` 実装
- ✗ `HRApplicationService.undo()` に Undo-after-approve 検出追加
- ✗ ChatMessage に 👍/👎 ボタン追加

### Phase 2: Feedback UI

- ✗ `buildMessageWindow()` / `buildToolTrace()` ヘルパー実装
- ✗ `applyProposedRule()` — tool_description 即時反映
- ✗ 起動時の `appliedRules` 復元（`toolRegistry.applyDescriptionOverrides`）
- ✗ `learned_rule` のシステムプロンプト注入
- ✗ `feedbackStore.getStats()` — FeedbackStats 集計実装
- ✗ Feedback パネル UI コンポーネント
  - ✗ 学習状況ダッシュボード（シグナル数・パターン状況・適用済み件数）
  - ✗ Proposed rules（diff表示・信頼度・適用・却下）
  - ✗ 適用済みルール一覧・Rollback
  - ✗ Code Fix 一覧・エクスポートボタン
  - ✗ シグナル一覧（折りたたみ）
  - ✗ データ管理（全エクスポート・シグナルクリア・すべてリセット＋確認ダイアログ）

### Phase 3: AIバリデーター

- ✗ `extractClassifiablePatterns()` 実装
- ✗ `classifyPattern()` — 2回独立実行・一致確認
- ✗ 分類器プロンプト実装
- ✗ `exportCodeFixBundle()` — Markdown 生成
- ✗ Feedback UI に「フィードバックを分析」ボタン追加

### Phase 4: STEP2 サーバー同期（オプション）

- ✗ `POST /api/ai/feedback/sync` ルート
- ✗ `GET /api/ai/feedback/aggregate` ルート
- ✗ クライアント側同期ロジック
