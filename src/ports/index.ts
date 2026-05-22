import type { AllCodeLists }   from '../domain/codeLists/aggregate'
import type { AllocationRow }  from '../domain/allocationRow'
import type { Organization } from '../domain/schemas'

// ── Data source port (read) ──────────────────────────────────────────────────
// Excel implementation: src/infrastructure/excelImport.ts (importFromFile)
// Future SF implementation: src/adapters/salesforce/SFDataSource.ts

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
// Excel implementation: src/infrastructure/excelIO.ts (exportToXlsx)
// Future SF implementation: src/adapters/salesforce/SFExporter.ts

export interface IAllocationExporter {
  export(data: AllocationData): Promise<void>
}

// ── Code list port ───────────────────────────────────────────────────────────
// Implementation: src/infrastructure/codeLists/localStorageRepository.ts
// Future SF implementation: SFPicklistRepository

export interface ICodeListSource {
  load(): Promise<AllCodeLists | null>
}

// ── AI chat port (legacy drawer) ─────────────────────────────────────────────
// Mock:   src/infrastructure/ai/mockChatService.ts

export interface ChatMessage {
  role: 'user' | 'ai'
  text: string
}

export interface IAIChatService {
  send(history: ChatMessage[], userMessage: string): Promise<string>
}

// ── Stateless chat service port ───────────────────────────────────────────────
// Matches the OpenAI / Anthropic chat completions pattern:
// full conversation history is passed on every call; the server is stateless.
//
// Mock:   src/infrastructure/ai/mockApiService.ts
// Future: src/infrastructure/ai/openAICompatibleAdapter.ts

export interface APIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface IChatService {
  chat(messages: APIMessage[]): Promise<string>
}
