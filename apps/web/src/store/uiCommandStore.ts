import { create } from 'zustand/react'

/**
 * AI → UI の一方向コマンドキュー。
 * toolRegistry(infrastructure/ai) が dispatch し、
 * React コンポーネントが useEffect で購読して実行する。
 * ドメインデータは変更しない（navigate ツール専用）。
 */
export type UICommand =
  | { type: 'openOperation'; rowId: number; operationId: string; prefill?: Record<string, string> }
  | { type: 'setMainViewMode'; mode: 'canvas' | 'review' }

interface UICommandState {
  command:  UICommand | null
  dispatch: (cmd: UICommand) => void
  clear:    () => void
}

export const useUICommandStore = create<UICommandState>((set) => ({
  command:  null,
  dispatch: (cmd) => set({ command: cmd }),
  clear:    ()    => set({ command: null }),
}))
