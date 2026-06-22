// toolRegistry/types.ts — ToolEntry 型定義
// このファイルは AI 開発者・Web 開発者の両方が参照するが、変更は AI 開発者のみが行う。
// 新しい kind を追加するときは AgentRunner 側の分岐処理も更新すること。

import type { ChatWidget }    from '../../../application/aiTypes'
import type { ToolDefinition } from '../../../ports'

export interface ToolResult {
  toolCallId: string
  content:    string
}

export interface ReadEntry {
  kind: 'read'
  definition: ToolDefinition
  execute(args: Record<string, unknown>): unknown
}

export interface RenderEntry {
  kind: 'render'
  definition: ToolDefinition
  /** summary はLLMへのツール結果として返す。widget はUIに表示する。 */
  execute(args: Record<string, unknown>): { summary: unknown; widget: ChatWidget }
}

export interface ConfirmEntry {
  kind: 'confirm'
  definition: ToolDefinition
  /**
   * ユーザーに見せる確認ウィジェットを構築する（副作用なし）。
   * 前提条件を満たさない場合は `{ error: string }` を返す。
   * formInputs が含まれる場合、確認UIに入力フォームを追加表示する。
   * AgentRunner はエラーをツール結果として LLM に返し、widget は表示しない。
   */
  buildProposal(args: Record<string, unknown>): { widget: ChatWidget } | { error: string }
  /** ユーザーが承認した後に呼ばれる。userInputs は formInputs をユーザーが確認/上書きした値。 */
  executeOnApprove(args: Record<string, unknown>, userInputs?: Record<string, string>): unknown
}

/**
 * execute kind: ユーザー確認なしで即時実行する。
 * read と違い副作用あり。execute() の戻り値が LLM へのツール結果になる。
 * LLM が戻り値（変更前後など）を見て自然言語で報告する。
 */
export interface ExecuteEntry {
  kind: 'execute'
  definition: ToolDefinition
  execute(args: Record<string, unknown>): unknown
}

/**
 * navigate kind: UIナビゲーション専用。
 * ドメインデータを変更しないため Fast Path でも安全に実行できる。
 * キャンバスのスクロール・フォーカス・ハイライトなど表示操作に使う。
 */
export interface NavigateEntry {
  kind: 'navigate'
  definition: ToolDefinition
  execute(args: Record<string, unknown>): unknown
}

export type ToolEntry = ReadEntry | RenderEntry | ConfirmEntry | ExecuteEntry | NavigateEntry
