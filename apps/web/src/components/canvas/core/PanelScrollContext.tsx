import { createContext, useContext } from 'react'
import type { RefObject } from 'react'

export interface PanelScrollContextValue {
  /** パネル本体（overflow-y-auto）のスクロールコンテナ ref。行単位の仮想化がスクロール位置を読むために使う */
  scrollerRef: RefObject<HTMLDivElement | null>
}

export const PanelScrollContext = createContext<PanelScrollContextValue | null>(null)

export function usePanelScroll(): PanelScrollContextValue {
  const ctx = useContext(PanelScrollContext)
  if (!ctx) throw new Error('usePanelScroll must be used within PanelScrollContext.Provider')
  return ctx
}
