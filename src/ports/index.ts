import type { AllCodeLists }   from '../domain/masters/aggregate'
import type { AllocationRow }  from '../domain/allocationRow'
import type { Organization } from '../domain/schemas'

// ── Data source port (read) ──────────────────────────────────────────────────
export interface AllocationData {
  allocationList:      AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  codeLists:           AllCodeLists
}

export interface IAllocationDataSource {
  load(): Promise<AllocationData>
}

// ── Data export port (write) ─────────────────────────────────────────────────
export interface IAllocationExporter {
  export(data: AllocationData): Promise<void>
}

// ── Code list port ───────────────────────────────────────────────────────────
export interface ICodeListSource {
  load(): Promise<AllCodeLists | null>
}

// ── Position code port ───────────────────────────────────────────────────────

export interface UnassignedPosition {
  rowId:          number
  positionCode:   string   // _pos_XXX 形式の内部採番コード
  localJobTitle:  string
  orgName:        string
  departmentCode: string
}

export interface PositionCodeAssignment {
  rowId:           number
  newPositionCode: string  // P + 8桁数字（例: P12345678）
}

export interface IPositionCodePort {
  /** 未割当ポジション一覧をクリップボード用 TSV にフォーマットする */
  formatForExport(positions: UnassignedPosition[]): string
  /** クリップボードからペーストされたテキストをパースして割り当てリストを返す */
  parseImport(raw: string): PositionCodeAssignment[]
  /** 利用可能なコードをソースから取得する（将来: DB/API 対応） */
  fetchAvailable?(count: number): Promise<string[]>
  /** 使用済みフラグを立てる（将来: DB/API 対応） */
  markUsed?(codes: string[], memo: string): Promise<void>
}

// ── AI chat port (legacy drawer) ─────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'ai'
  text: string
}

export interface IAIChatService {
  send(history: ChatMessage[], userMessage: string): Promise<string>
}

// ── OpenAI-compatible message types ──────────────────────────────────────────

export interface ToolFunction {
  name: string
  description: string
  parameters: Record<string, unknown>  // JSON Schema object
}

export interface ToolDefinition {
  type: 'function'
  function: ToolFunction
}

// Represents a single tool call requested by the assistant
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON string
  }
}

// Full OpenAI message shape — role 'tool' carries tool results back to the model
export interface APIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?:   ToolCall[]  // set on assistant messages that request tool calls
  tool_call_id?: string      // set on tool result messages
}

// Result from a completion call that may include tool invocations
export interface CompletionResult {
  content?:   string
  toolCalls?: ToolCall[]
}

// ── Stateless chat service port ───────────────────────────────────────────────
// Simple text-in / text-out. Used by ChatSession and MockApiService.
export interface IChatService {
  chat(messages: APIMessage[]): Promise<string>
}

// Extended service that also supports tool use (function calling).
// OpenAICompatibleAdapter implements this; MockApiService only implements IChatService.
export interface IChatServiceWithTools extends IChatService {
  complete(messages: APIMessage[], tools?: ToolDefinition[]): Promise<CompletionResult>
}
