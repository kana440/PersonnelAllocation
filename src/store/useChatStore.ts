import { create } from 'zustand'
import type { ChatMessage, PersonMatch } from '../components/ai/types'

// Phase is owned here (not in AIView) so it survives mode switches
export type ChatPhase =
  | 'idle'
  | 'awaiting-file'
  | 'importing'
  | 'awaiting-org-name'
  | 'searching-org'
  | 'awaiting-dept-select'
  | 'searching-dept'
  | 'awaiting-person-names'
  | 'searching-persons'
  | 'awaiting-promote-confirm'
  | 'applying-promotion'
  | 'awaiting-report-target'
  | 'searching-report'
  | 'awaiting-impact-org'
  | 'checking-impact'
  | 'awaiting-export-confirm'
  | 'exporting'

let _msgId = 0

interface ChatStore {
  messages:       ChatMessage[]
  phase:          ChatPhase
  pendingPersons: PersonMatch[]
  selectedModel:  string

  addMessage:        (msg: Omit<ChatMessage, 'id'>) => string
  updateMessage:     (id: string, updates: Partial<ChatMessage>) => void
  clearMessages:     () => void
  setPhase:          (phase: ChatPhase) => void
  setPendingPersons: (persons: PersonMatch[]) => void
  setSelectedModel:  (model: string) => void
}

export const useChatStore = create<ChatStore>(set => ({
  messages:       [],
  phase:          'idle',
  pendingPersons: [],
  selectedModel:  '',

  addMessage: msg => {
    const id = `msg-${++_msgId}`
    set(s => ({ messages: [...s.messages, { ...msg, id }] }))
    return id
  },

  updateMessage: (id, updates) =>
    set(s => ({ messages: s.messages.map(m => m.id === id ? { ...m, ...updates } : m) })),

  clearMessages: () => set({ messages: [], phase: 'idle', pendingPersons: [] }),

  setPhase:          phase          => set({ phase }),
  setPendingPersons: pendingPersons => set({ pendingPersons }),
  setSelectedModel:  model          => set({ selectedModel: model }),
}))
