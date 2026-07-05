import { create } from 'zustand'
import { DEFAULT_FILTER, type UnifiedFilter, type ViewMode } from '../components/review/UnifiedReviewView/types'

interface ReviewFilterState {
  filter:          UnifiedFilter
  searchInput:     string
  showOldOrg:      boolean
  viewMode:        ViewMode
  showMembersOnly: boolean   // true=直接メンバーがいる組織のみ表示、false=全組織を表示

  /** 表形式に切り替える直前にセットし、UnifiedTable のマウント時に一度だけ消費する */
  pendingScrollRowId: number | null
  /** 組織セクションへのスクロール先。表形式マウント時に一度だけ消費する */
  pendingScrollOrgId: string | null
  /** viewMode ごとのスクロール位置。アンマウント後も保持し復元に使う */
  scrollTopByMode:    Record<ViewMode, number>

  setFilter:             (f: UnifiedFilter)               => void
  patchFilter:           (partial: Partial<UnifiedFilter>) => void
  setSearchInput:        (v: string)                      => void
  setShowOldOrg:         (v: boolean)                     => void
  setViewMode:           (m: ViewMode)                    => void
  setShowMembersOnly:    (v: boolean)                     => void
  setPendingScrollRowId: (id: number | null)              => void
  setPendingScrollOrgId: (id: string | null)              => void
  setScrollTopByMode:    (mode: ViewMode, top: number)    => void
}

export const useReviewFilterStore = create<ReviewFilterState>(set => ({
  filter:          DEFAULT_FILTER,
  searchInput:     '',
  showOldOrg:      false,
  viewMode:        'diff',
  showMembersOnly: true,
  pendingScrollRowId: null,
  pendingScrollOrgId: null,
  scrollTopByMode:    { diff: 0, 'side-by-side': 0 },

  setFilter:          (filter)          => set({ filter }),
  patchFilter:        (partial)         => set(s => ({ filter: { ...s.filter, ...partial } })),
  setSearchInput:     (searchInput)     => set({ searchInput }),
  setShowOldOrg:      (showOldOrg)      => set({ showOldOrg }),
  setViewMode:        (viewMode)        => set({ viewMode }),
  setShowMembersOnly: (showMembersOnly) => set({ showMembersOnly }),
  setPendingScrollRowId: (id)           => set({ pendingScrollRowId: id }),
  setPendingScrollOrgId: (id)           => set({ pendingScrollOrgId: id }),
  setScrollTopByMode: (mode, top)       => set(s => ({ scrollTopByMode: { ...s.scrollTopByMode, [mode]: top } })),
}))
