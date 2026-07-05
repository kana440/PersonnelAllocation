import { create } from 'zustand/react'
import { rebuildContactService } from '../infrastructure/contact'
import { toHeaderTsv, toRequestTsv, toFullTsv } from '../infrastructure/contact'
import { useSettingsStore } from './settingsStore'
import type { SubmitResult } from '../application/ContactService'
import type { ContactRecord, CreateContactParams, ContactMessage, SyncResult, ContactAnchor } from '../ports/contactTypes'

function svc() {
  const mode = useSettingsStore.getState().contactSourceMode
  return rebuildContactService(mode)
}

interface ContactState {
  contacts:    ContactRecord[]
  isLoading:   boolean
  isPanelOpen: boolean
  activeTab:   'sent' | 'received'
  selectedId:  string | null
  isFormOpen:  boolean
  syncResult:  SyncResult | null

  openPanel:     () => void
  closePanel:    () => void
  setTab:        (tab: 'sent' | 'received') => void
  select:        (id: string | null) => void
  openForm:      () => void
  closeForm:     () => void

  load:          () => Promise<void>
  sync:          () => Promise<void>
  create:        (params: CreateContactParams) => Promise<ContactRecord>
  submitMessage: (id: string, msg: Pick<ContactMessage, 'type' | 'summary' | 'data'>) => Promise<SubmitResult>
  markSent:      (id: string) => Promise<void>
  archive:       (id: string) => Promise<void>
  setAnchor:     (id: string, anchor: ContactAnchor) => Promise<void>

  copyHeader:    () => void
  copyRequest:   (record: ContactRecord) => void
  copyFull:      (record: ContactRecord) => void
}

export const useContactStore = create<ContactState>()((set, _get) => ({
  contacts:    [],
  isLoading:   false,
  isPanelOpen: false,
  activeTab:   'sent',
  selectedId:  null,
  isFormOpen:  false,
  syncResult:  null,

  openPanel:  () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false, selectedId: null, isFormOpen: false }),
  setTab:     (tab) => set({ activeTab: tab, selectedId: null }),
  select:     (id) => set({ selectedId: id, isFormOpen: false }),
  openForm:   () => set({ isFormOpen: true, selectedId: null }),
  closeForm:  () => set({ isFormOpen: false }),

  load: async () => {
    set({ isLoading: true })
    try {
      const contacts = await svc().getAll()
      set({ contacts })
    } finally {
      set({ isLoading: false })
    }
  },

  sync: async () => {
    set({ isLoading: true })
    try {
      const result = await svc().syncFromSource()
      set({ syncResult: result })
      const contacts = await svc().getAll()
      set({ contacts })
    } finally {
      set({ isLoading: false })
    }
  },

  create: async (params) => {
    const record = await svc().create(params)
    const contacts = await svc().getAll()
    set({ contacts, isFormOpen: false, selectedId: record.id })
    return record
  },

  submitMessage: async (id, msg) => {
    const result = await svc().submitMessage(id, msg)
    const contacts = await svc().getAll()
    set({ contacts })
    return result
  },

  markSent: async (id) => {
    await svc().markSent(id)
    const contacts = await svc().getAll()
    set({ contacts })
  },

  archive: async (id) => {
    await svc().archive(id)
    const contacts = await svc().getAll()
    set({ contacts, selectedId: null })
  },

  setAnchor: async (id, anchor) => {
    await svc().setAnchor(id, anchor)
    const contacts = await svc().getAll()
    set({ contacts })
  },

  copyHeader:  () => { navigator.clipboard.writeText(toHeaderTsv()) },
  copyRequest: (record) => { navigator.clipboard.writeText(toRequestTsv(record)) },
  copyFull:    (record) => { navigator.clipboard.writeText(toFullTsv(record)) },
}))

// 連絡票機能が利用可能かどうか
export function isContactEnabled(): boolean {
  const { myEmail, contactSourceMode } = useSettingsStore.getState()
  return !!myEmail && contactSourceMode !== null
}
