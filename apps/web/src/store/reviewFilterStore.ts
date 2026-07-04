import { create } from 'zustand'
import { DEFAULT_FILTER, type UnifiedFilter, type ViewMode } from '../components/review/UnifiedReviewView/types'

interface ReviewFilterState {
  filter:          UnifiedFilter
  searchInput:     string
  showOldOrg:      boolean
  viewMode:        ViewMode
  showMembersOnly: boolean   // true=直接メンバーがいる組織のみ表示、false=全組織を表示

  setFilter:          (f: UnifiedFilter)               => void
  patchFilter:        (partial: Partial<UnifiedFilter>) => void
  setSearchInput:     (v: string)                      => void
  setShowOldOrg:      (v: boolean)                     => void
  setViewMode:        (m: ViewMode)                    => void
  setShowMembersOnly: (v: boolean)                     => void
}

export const useReviewFilterStore = create<ReviewFilterState>(set => ({
  filter:          DEFAULT_FILTER,
  searchInput:     '',
  showOldOrg:      false,
  viewMode:        'diff',
  showMembersOnly: true,

  setFilter:          (filter)          => set({ filter }),
  patchFilter:        (partial)         => set(s => ({ filter: { ...s.filter, ...partial } })),
  setSearchInput:     (searchInput)     => set({ searchInput }),
  setShowOldOrg:      (showOldOrg)      => set({ showOldOrg }),
  setViewMode:        (viewMode)        => set({ viewMode }),
  setShowMembersOnly: (showMembersOnly) => set({ showMembersOnly }),
}))
