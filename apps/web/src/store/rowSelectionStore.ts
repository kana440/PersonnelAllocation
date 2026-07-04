/**
 * Review テーブルと Canvas で共有する行選択状態。
 * UI ステートなので HRApplicationService の Undo 対象外。
 * フィルタ変更・データロード時は clearSelection() で明示的にリセットする。
 */
import { create } from 'zustand'

interface RowSelectionStore {
  selectedRowIds: Set<number>
  toggleRow:      (rowId: number) => void
  setRows:        (rowIds: number[]) => void
  clearSelection: () => void
  /** filteredRowIds を渡して全選択 / 全解除をトグル */
  toggleAll:      (filteredRowIds: number[]) => void
}

export const useRowSelectionStore = create<RowSelectionStore>((set, get) => ({
  selectedRowIds: new Set(),

  toggleRow(rowId) {
    set(s => {
      const next = new Set(s.selectedRowIds)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return { selectedRowIds: next }
    })
  },

  setRows(rowIds) {
    set({ selectedRowIds: new Set(rowIds) })
  },

  clearSelection() {
    set({ selectedRowIds: new Set() })
  },

  toggleAll(filteredRowIds) {
    const { selectedRowIds } = get()
    const allSelected = filteredRowIds.length > 0 && filteredRowIds.every(id => selectedRowIds.has(id))
    set({ selectedRowIds: allSelected ? new Set() : new Set(filteredRowIds) })
  },
}))
