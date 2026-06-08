// AgentRunner — drives the tool-calling loop for a single user turn.
//
// Flow:
//   1. Convert UI chat history to APIMessage[]
//   2. Append the new user message
//   3. Call the model (with tool definitions)
//   4. If the model returns tool_calls: dispatch by kind, append results, go to 3
//      - read    : 即時実行
//      - render  : Widget を latestWidget に格納し、summary をLLMへ返す
//      - confirm : onConfirm コールバックでUI停止 → 承認後に executeOnApprove
//   5. If the model returns a text response: return { text, widget? }
//   6. If MAX_ROUNDS is exceeded: return error message
//
// tool_call / tool_result messages はローカル配列のみで保持し、
// チャットストアには保存しない（最終テキストとウィジェットだけを返す）。

import type { APIMessage } from '../../ports'
import type { ChatMessage, ChatWidget, ConfirmResult } from '../../application/aiTypes'
import type { OpenAICompatibleAdapter } from './openAICompatibleAdapter'
import type { AITraceObserver } from './aiTrace'
import type { ToolDefinition } from '../../ports'
import { SummaryTraceObserver, CompositeTraceObserver } from './aiTrace'
import { TOOL_LABELS } from './toolLabels'
import { toolRegistry } from './toolRegistry'
import { buildAPIMessages } from '../../application/chatSession'

/**
 * スキル1件分のツール定義 + 呼ばれたときに返す instructions。
 *
 * allowedTools は SKILL.md の "allowed-tools" フィールドから取得する。
 * ──────────────────────────────────────────────────────────────────────────
 * 【重要】このフィールドの意味は Claude Code 標準の "allowed-tools" と異なる。
 *
 *   Claude Code の allowed-tools    = ユーザーへの確認ダイアログを省略する「権限」設定
 *                                     （ツール定義の絞り込みではない）
 *   Claude Code の disallowed-tools = LLM へのツール定義を除外するが、1ターンのみ有効
 *
 *   このプロジェクトの allowedTools  = スキルツールが呼ばれた直後のラウンドから
 *                                     同一 run() 内でのみ LLM に渡すツール定義を絞り込む。
 *                                     run() 終了で自動リセット（複数ターンにまたがらない）。
 *
 * 詳細は run() 内のコメント「スキルの allowed-tools スコーピング」を参照。
 * ──────────────────────────────────────────────────────────────────────────
 */
export interface SkillToolEntry {
  slug:          string
  name:          string
  instructions:  string
  allowedTools?: string[]  // SKILL.md の allowed-tools（スキル起動後のツール絞り込み用）
  definition:    ToolDefinition
}

const MAX_ROUNDS = 10


export interface AgentRunResult {
  text:    string
  widget?: ChatWidget
}

export interface AgentRunOptions {
  onProgress?:   (label: string) => void
  /** confirm ツールが呼ばれたとき、UIでウィジェットを表示しユーザーの判断を待つ。
   *  Promise が resolve するまで agentRunner のループは停止する。 */
  onConfirm?:    (widget: ChatWidget) => Promise<ConfirmResult>
  /** 呼び出し側がセッション固有コンテキスト（スコープ等）を追加するための system prompt 上書き。 */
  systemPrompt?: string
  /** アクティブなスキルをツールとして渡す。呼ばれたら instructions を返す。 */
  skillEntries?: SkillToolEntry[]
}

export class AgentRunner {
  private readonly summary:  SummaryTraceObserver
  private readonly observer: AITraceObserver

  constructor(
    private readonly adapter: OpenAICompatibleAdapter,
    extraObserver?: AITraceObserver,
    readonly model?: string,
  ) {
    this.summary  = new SummaryTraceObserver()
    this.observer = extraObserver
      ? new CompositeTraceObserver([this.summary, extraObserver])
      : this.summary
  }

  getSessionLog():  string { return this.summary.getLog() }
  clearSessionLog(): void  { this.summary.clear() }

  async run(
    history: ChatMessage[],
    userText: string,
    options?: AgentRunOptions,
  ): Promise<AgentRunResult> {
    const { onProgress, onConfirm, systemPrompt, skillEntries = [] } = options ?? {}
    const messages: APIMessage[] = buildAPIMessages(history, systemPrompt)
    messages.push({ role: 'user', content: userText })

    // スキルなし時のフルツールセット（スキルツール + 全通常ツール）
    const allDefinitions = [
      ...toolRegistry.definitions,
      ...skillEntries.map(s => s.definition),
    ]

    // ── スキルの allowed-tools スコーピング ──────────────────────────────────────
    // 【注意】これは Claude Code 標準の "allowed-tools" / "disallowed-tools" とは別物。
    //
    //   Claude Code allowed-tools   → 確認ダイアログをスキップする権限設定（ツール除外ではない）
    //   Claude Code disallowed-tools → LLM へのツール定義を除外するが1ターン限り
    //
    //   このプロジェクト独自の動作:
    //     スキルツールが呼ばれた直後のラウンドから run() 終了まで、
    //     LLM に渡すツール定義を skill.allowedTools に列挙されたものだけに絞り込む。
    //     run() が終わると自動的にリセットされ、次のユーザーターンでは全ツールが復活する。
    //
    //   SKILL.md の allowed-tools フィールドはメンテナー向けのドキュメントも兼ねており、
    //   「このスキルが主に使うツール」を明示する意図がある。
    //   allowedTools が空または未設定の場合はスコーピングを行わない（全ツール渡し）。
    // ────────────────────────────────────────────────────────────────────────────
    let activeSkillAllowedTools: string[] | null = null

    let latestWidget: ChatWidget | undefined

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // スキルの allowed-tools が設定済みなら絞り込んだツールセットを使う
      const roundDefinitions = (activeSkillAllowedTools !== null && activeSkillAllowedTools.length > 0)
        ? [
            // スキルツール自体は常に渡す（別スキルへの切り替えを許可）
            ...skillEntries.map(s => s.definition),
            // 通常ツールは allowed-tools リストに含まれるものだけ
            ...toolRegistry.definitions.filter(d =>
              activeSkillAllowedTools!.includes(d.function.name)
            ),
          ]
        : allDefinitions

      this.observer.onEvent({
        kind: 'request', round, messages: [...messages],
        params: { model: this.model, toolCount: roundDefinitions.length },
      })

      const result = await this.adapter.complete(messages, roundDefinitions)

      // No tool calls → final text response
      if (!result.toolCalls || result.toolCalls.length === 0) {
        const text = result.content ?? '（応答がありませんでした）'
        this.observer.onEvent({ kind: 'response', text })
        return { text, widget: latestWidget }
      }

      // Append the assistant's tool_call message
      messages.push({
        role:       'assistant',
        content:    result.content ?? '',
        tool_calls: result.toolCalls,
      })

      const firstToolName = result.toolCalls[0]?.function.name ?? ''
      const firstSkill    = skillEntries.find(s => s.definition.function.name === firstToolName)
      const progressLabel = firstSkill?.name ?? TOOL_LABELS[firstToolName] ?? firstToolName
      onProgress?.(`${progressLabel}...`)

      for (const call of result.toolCalls) {
        const args = (() => {
          try { return JSON.parse(call.function.arguments) as Record<string, unknown> }
          catch { return {} as Record<string, unknown> }
        })()

        const skillEntry = skillEntries.find(s => s.definition.function.name === call.function.name)

        if (skillEntry) {
          // スキルツール: skill_call イベントを発火し instructions を返す
          this.observer.onEvent({ kind: 'skill_call', round, slug: skillEntry.slug, skillName: skillEntry.name })
          messages.push({ role: 'tool', content: skillEntry.instructions, tool_call_id: call.id })

          // 次ラウンドから allowed-tools スコーピングを有効化する
          // （このラウンドはスキル呼び出し自体なので、次ラウンドから絞り込む）
          if (skillEntry.allowedTools && skillEntry.allowedTools.length > 0) {
            activeSkillAllowedTools = skillEntry.allowedTools
          }
          continue
        }

        // 通常のツール
        this.observer.onEvent({ kind: 'tool_call', round, toolName: call.function.name, args })

        const entry = toolRegistry.getEntry(call.function.name)
        let content: string

        if (entry?.kind === 'render') {
          const { summary, widget } = entry.execute(args)
          latestWidget = widget
          content = JSON.stringify(summary)

        } else if (entry?.kind === 'confirm') {
          const proposal = entry.buildProposal(args)
          if ('error' in proposal) {
            content = JSON.stringify({ ok: false, error: proposal.error })
          } else if (onConfirm) {
            const confirmResult = await onConfirm(proposal.widget)
            if (confirmResult.approved) {
              const applyResult = entry.executeOnApprove(args)
              content = JSON.stringify({ ok: true, result: applyResult })
            } else {
              content = JSON.stringify({ ok: false, cancelled: true, message: 'ユーザーが操作を取り消しました' })
            }
          } else {
            content = JSON.stringify({ error: '確認ハンドラが設定されていません' })
          }

        } else {
          // read tool (or unknown)
          const toolResult = toolRegistry.execute(call)
          content = toolResult.content
        }

        this.observer.onEvent({ kind: 'tool_result', round, toolName: call.function.name, result: content })
        messages.push({ role: 'tool', content, tool_call_id: call.id })
      }
    }

    const limitMsg = 'ツール呼び出しが上限（' + MAX_ROUNDS + ' 回）に達しました。処理を中断しました。'
    this.observer.onEvent({ kind: 'response', text: limitMsg })
    return { text: limitMsg, widget: latestWidget }
  }
}
