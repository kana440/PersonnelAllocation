import type { AllCodeLists }   from '../domain/codeLists/aggregate'
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
