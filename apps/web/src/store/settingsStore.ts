import { create } from 'zustand/react'
import { LocalIdentityStore } from '../infrastructure/contact/LocalIdentityStore'

const identity = new LocalIdentityStore()

export type ContactSourceMode = 'file' | null

interface SettingsState {
  // アイデンティティ
  myEmail:       string | null
  myDisplayName: string | null

  // 連絡票ソース
  contactSourceMode:    ContactSourceMode
  hasContactFileHandle: boolean  // IndexedDB にファイルハンドルが保存済みか

  // アクション
  saveIdentity:         (email: string, displayName?: string) => void
  clearIdentity:        () => void
  setContactSourceMode: (mode: ContactSourceMode) => void
  setHasContactFileHandle: (has: boolean) => void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  myEmail:              identity.getMyEmail(),
  myDisplayName:        identity.getMyDisplayName(),
  contactSourceMode:    loadSourceMode(),
  hasContactFileHandle: false,  // 起動時に非同期で確認する（App 側で設定）

  saveIdentity: (email, displayName) => {
    identity.save(email, displayName)
    set({ myEmail: email, myDisplayName: displayName ?? null })
  },

  clearIdentity: () => {
    identity.clear()
    set({ myEmail: null, myDisplayName: null })
  },

  setContactSourceMode: (mode) => {
    saveSourceMode(mode)
    set({ contactSourceMode: mode })
  },

  setHasContactFileHandle: (has) => set({ hasContactFileHandle: has }),
}))

// ── localStorage でソースモードを永続化 ───────────────────────

const SOURCE_MODE_KEY = 'personnel-contact-source-mode'

function loadSourceMode(): ContactSourceMode {
  try {
    const v = localStorage.getItem(SOURCE_MODE_KEY)
    if (v === 'file') return v
    return null
  } catch { return null }
}

function saveSourceMode(mode: ContactSourceMode): void {
  try {
    if (mode == null) localStorage.removeItem(SOURCE_MODE_KEY)
    else localStorage.setItem(SOURCE_MODE_KEY, mode)
  } catch { /* ignore */ }
}
