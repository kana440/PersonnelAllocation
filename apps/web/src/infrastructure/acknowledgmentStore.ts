import { create } from 'zustand'
import type { IAcknowledgmentStore, WarningAcknowledgment } from '@personnel/domain/acknowledgment'

interface AcknowledgmentState extends IAcknowledgmentStore {
  _items: Map<string, WarningAcknowledgment>
}

export const useAcknowledgmentStore = create<AcknowledgmentState>((set, get) => ({
  _items: new Map(),

  acknowledge(key, reason) {
    set(s => {
      const next = new Map(s._items)
      next.set(key, { warningKey: key, reason, acknowledgedAt: new Date().toISOString() })
      return { _items: next }
    })
  },

  unacknowledge(key) {
    set(s => {
      const next = new Map(s._items)
      next.delete(key)
      return { _items: next }
    })
  },

  isAcknowledged: (key)  => get()._items.has(key),
  getAll:         ()     => [...get()._items.values()],
  clear:          ()     => set({ _items: new Map() }),
}))

/** 非 React コンテキスト向けシングルトン（IAcknowledgmentStore を満たす） */
export const acknowledgmentStore: IAcknowledgmentStore = {
  acknowledge:    (key, reason) => useAcknowledgmentStore.getState().acknowledge(key, reason),
  unacknowledge:  (key)         => useAcknowledgmentStore.getState().unacknowledge(key),
  isAcknowledged: (key)         => useAcknowledgmentStore.getState().isAcknowledged(key),
  getAll:         ()            => useAcknowledgmentStore.getState().getAll(),
  clear:          ()            => useAcknowledgmentStore.getState().clear(),
}
