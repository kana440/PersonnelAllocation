import { create } from 'zustand'
import { DEFAULT_FILTER, type UnifiedFilter, type ViewMode } from '../components/review/UnifiedReviewView/types'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'

export type NavMode = 'all' | 'changes' | 'issues'

interface ReviewFilterState {
  filter:          UnifiedFilter
  searchInput:     string
  showOldOrg:      boolean
  viewMode:        ViewMode
  showMembersOnly: boolean   // true=直接メンバーがいる組織のみ表示、false=全組織を表示
  /**
   * OrgPersonNav の 全体/変更/問題 タブ。canvas⇔表形式の切替で OrgPersonNav がアンマウント
   * されても状態が消えないよう、コンポーネントローカルではなくここに持つ
   * （filter.changedOnly 等は元々ここにあるのに navMode だけローカルだと、画面を切り替えて
   * 戻ったときタブ表示だけ「全体」に戻り、実際のフィルタとズレて見える不具合になるため）。
   */
  navMode:         NavMode

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
  /** タブを切り替える。切替先に関係なく毎回フィルタを完全にリセットしてから該当条件を立てる */
  switchNavMode:         (mode: NavMode)                  => void
}

export const useReviewFilterStore = create<ReviewFilterState>(set => ({
  filter:          DEFAULT_FILTER,
  searchInput:     '',
  showOldOrg:      false,
  viewMode:        'diff',
  showMembersOnly: true,
  navMode:         'all',
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

  switchNavMode: (mode) => set(s => {
    // 常に「まっさら」から目的のモードの条件だけを立てる（前のモードの絞り込みを引きずらない）
    const base = { changedOnly: false, issuesOnly: false, activePatterns: new Set<EditPattern>(), activeIssueKey: '' }
    const patch =
      mode === 'changes' ? { ...base, changedOnly: true } :
      mode === 'issues'  ? { ...base, issuesOnly: true }  :
      base
    return { navMode: mode, filter: { ...s.filter, ...patch } }
  }),
}))
