// toolRegistry/index.ts — ToolEntry 集約とパブリック API
//
// このファイルは読み取り専用に近い。変更するケース:
//   - ToolEntry の kind が新たに追加された場合（execute メソッド分岐を更新）
//   - toolRegistry オブジェクトのインターフェースを変更する場合
// ツールの追加は各 *Tools.ts ファイルで行う。

// ── tool registry — LLMプロトコルアダプター ─────────────────────────────────
//
// 責務: ToolDefinition（JSONスキーマ）の定義 + aiTools/proposalBuilders へのルーティングのみ。
// ビジネスロジックは aiTools/ に、確認ウィジェット組み立ては proposalBuilders.ts に置く。
// 設計思想: specs/G4-ai/00-design-philosophy.md
//
// read    : 即時実行し結果をLLMに返す（副作用なし）
// render  : ウィジェットをUIに表示しつつ要約をLLMに返す（副作用：Widget表示）
// execute : ユーザー確認なしで即時実行する（副作用：ドメイン変更）
// confirm : ユーザーの確認を待ってから操作を適用する（副作用：ドメイン変更）
// navigate: UIナビゲーション専用（ドメインデータは変更しない）
//
// ツール名プレフィックス規約:
//   ui_*       : UIナビゲーション専用
//   propose_*  : ドメイン変更操作（execute / confirm）
//   find* / get* : 読み取り系（read / render）

import type { ToolDefinition, ToolCall } from '../../../ports'
import { READ_TOOLS }      from './readTools'
import { RENDER_TOOLS }    from './renderTools'
import { NAVIGATE_TOOLS }  from './navigateTools'
import { OPERATION_TOOLS } from './operationTools'

export type { ToolResult, ToolEntry, ReadEntry, RenderEntry, ConfirmEntry, ExecuteEntry, NavigateEntry } from './types'

const TOOL_ENTRIES = [
  ...READ_TOOLS,
  ...RENDER_TOOLS,
  ...NAVIGATE_TOOLS,
  ...OPERATION_TOOLS,
]

const entryMap = new Map(TOOL_ENTRIES.map(e => [e.definition.function.name, e]))

function parseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown> }
  catch { return {} }
}

export const toolRegistry = {
  get definitions(): ToolDefinition[] {
    return TOOL_ENTRIES.map(e => e.definition)
  },

  /** Fast Path で公開する安全なツール定義（read / render / navigate）。 */
  getSafeDefinitions(): ToolDefinition[] {
    return TOOL_ENTRIES
      .filter(e => e.kind === 'read' || e.kind === 'render' || e.kind === 'navigate')
      .map(e => e.definition)
  },

  /** 指定したツール名のみに絞り込んだ定義リストを返す（Skill の allowed-tools 用）。 */
  getDefinitionsForNames(names: string[]): ToolDefinition[] {
    return TOOL_ENTRIES
      .filter(e => names.includes(e.definition.function.name))
      .map(e => e.definition)
  },

  getEntry(name: string) {
    return entryMap.get(name)
  },

  /**
   * DB から取得したスキル定義で tool description を上書きする。
   * active な skill_def がある toolName のみ反映。起動時に一度だけ呼ぶ。
   */
  applyDescriptionOverrides(overrides: Record<string, string>): void {
    for (const entry of TOOL_ENTRIES) {
      const desc = overrides[entry.definition.function.name]
      if (desc) entry.definition.function.description = desc
    }
  },

  /** read / execute / navigate ツール用の便利メソッド（AgentRunner が内部で使う）。 */
  execute(call: ToolCall): import('./types').ToolResult {
    const entry = entryMap.get(call.function.name)
    const args  = parseArgs(call.function.arguments)
    let result: unknown
    try {
      if (entry?.kind === 'read' || entry?.kind === 'execute' || entry?.kind === 'navigate') {
        result = entry.execute(args)
      } else {
        result = { error: `'${call.function.name}' は read/execute/navigate ツールではありません` }
      }
    } catch (e) {
      result = { error: String(e) }
    }
    return { toolCallId: call.id, content: JSON.stringify(result) }
  },
}
