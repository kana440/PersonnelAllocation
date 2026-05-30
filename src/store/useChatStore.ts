import { create } from 'zustand'
import type { ChatMessage, PersonMatch } from '../application/aiTypes'

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
  messages:           ChatMessage[]
  phase:              ChatPhase
  pendingPersons:     PersonMatch[]
  selectedModel:      string
  /** チャットに渡す行コンテキスト。テーブル選択（useStore.selectedRowId）とは独立 */
  chatContextRowIds:  number[]

  addMessage:           (msg: Omit<ChatMessage, 'id'>) => string
  updateMessage:        (id: string, updates: Partial<ChatMessage>) => void
  clearMessages:        () => void
  setPhase:             (phase: ChatPhase) => void
  setPendingPersons:    (persons: PersonMatch[]) => void
  setSelectedModel:     (model: string) => void
  /** クリック時: 全件クリアして1件セット */
  setChatContext:       (rowIds: number[]) => void
  /** ドラッグ&ドロップ時: 既存に追加（重複スキップ） */
  addToChatContext:     (rowId: number) => void
  /** バッジの ✕: 該当行のみ削除 */
  removeFromChatContext:(rowId: number) => void
}

export const useChatStore = create<ChatStore>(set => ({
  messages:          [],
  phase:             'idle',
  pendingPersons:    [],
  selectedModel:     '',
  chatContextRowIds: [],

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
  setChatContext:    rowIds         => set({ chatContextRowIds: rowIds }),
  addToChatContext:  rowId          => set(s => ({
    chatContextRowIds: s.chatContextRowIds.includes(rowId)
      ? s.chatContextRowIds
      : [...s.chatContextRowIds, rowId],
  })),
  removeFromChatContext: rowId => set(s => ({
    chatContextRowIds: s.chatContextRowIds.filter(id => id !== rowId),
  })),
}))
