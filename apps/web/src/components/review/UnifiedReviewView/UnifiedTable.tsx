import { useRef, useState, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ReviewRow } from '../hooks/useReviewData'
import type { ViewMode, DisplayField } from './types'
import { DiffModeRow }           from './DiffModeRow'
import { SideBySideRow }         from './SideBySideRow'
import { useRowSelectionStore }  from '../../../store/rowSelectionStore'

const DIFF_ROW_H = 42
const SBS_ROW_H  = 33
const ROW_BUFFER = 20

interface Props {
  rows:                  ReviewRow[]
  viewMode:              ViewMode
  allDisplayFields:      DisplayField[]
  onFieldEdit:           (rowId: number, field: string, value: string) => void
  transferReasonOptions: string[]
  selectedRowId:         number | null
  onRowClick:            (rowId: number) => void
  onRowDoubleClick:      (rowId: number) => void
}

export function UnifiedTable({
  rows, viewMode, allDisplayFields,
  onFieldEdit, transferReasonOptions,
  selectedRowId, onRowClick, onRowDoubleClick,
}: Props) {
  const ROW_H = viewMode === 'diff' ? DIFF_ROW_H : SBS_ROW_H

  const scrollRef   = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [vpHeight,  setVpHeight]  = useState(400)

  const { selectedRowIds, toggleRow, toggleAll } = useRowSelectionStore(
    useShallow(s => ({ selectedRowIds: s.selectedRowIds, toggleRow: s.toggleRow, toggleAll: s.toggleAll }))
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setVpHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const startIdx    = Math.max(0, Math.floor(scrollTop / ROW_H) - ROW_BUFFER)
  const endIdx      = Math.min(rows.length, Math.ceil((scrollTop + vpHeight) / ROW_H) + ROW_BUFFER)
  const paddingTop  = startIdx * ROW_H
  const paddingBot  = (rows.length - endIdx) * ROW_H
  const visibleRows = rows.slice(startIdx, endIdx)
  const n           = allDisplayFields.length

  // diff:  チェック(1) + 担当者(1) + 本人情報11列 + 変更種別(1) + 差分統合列(n) + 除外(1) + 問題(1) = 16 + n
  // sbs:   チェック(1) + 担当者(1) + 本人情報11列 + 変更種別(1) + After(n) + Before(n) + 除外(1)  = 15 + 2n
  const COL_SPAN = viewMode === 'diff' ? 16 + n : 15 + 2 * n

  const thD = 'px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200 text-[10px] whitespace-nowrap bg-gray-100'
  const thM = 'px-2 py-1.5 text-left font-medium text-white border-b border-indigo-700 text-[10px] whitespace-nowrap bg-indigo-700'
  const thA = 'px-2 py-1.5 text-left font-medium text-white border-b border-green-700 text-[10px] whitespace-nowrap bg-green-800'
  const thB = 'px-2 py-1.5 text-left font-medium text-white border-b border-blue-700 text-[10px] whitespace-nowrap bg-blue-800'

  const scrollToRow = useCallback((rowId: number) => {
    const idx = rows.findIndex(r => r.row.rowId === rowId)
    if (idx < 0) return
    const el = scrollRef.current
    if (!el) return
    const top = idx * ROW_H
    if (top < el.scrollTop || top + ROW_H > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: top - el.clientHeight / 2, behavior: 'smooth' })
    }
  }, [rows, ROW_H])

  useEffect(() => {
    if (selectedRowId !== null) scrollToRow(selectedRowId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRowId])

  const filteredRowIds = rows.map(r => r.row.rowId)
  const allChecked     = filteredRowIds.length > 0 && filteredRowIds.every(id => selectedRowIds.has(id))
  const someChecked    = filteredRowIds.some(id => selectedRowIds.has(id))

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto min-h-0"
      onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          {/* ── グループヘッダー行 ── */}
          <tr>
            <th className="px-1.5 py-1 bg-gray-100 border-b border-gray-200 w-6">
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                onChange={() => toggleAll(filteredRowIds)}
                className="accent-blue-600 w-3 h-3 cursor-pointer"
                title="表示中の全行を選択"
              />
            </th>
            <th className="px-2 py-1 text-center bg-purple-800 text-white text-[10px]">担当者</th>
            <th colSpan={11} className="px-2 py-1 text-center bg-gray-600 text-white text-[10px]">本人情報</th>
            <th className="px-2 py-1 text-center bg-gray-500 text-white text-[10px]">変更種別</th>
            {viewMode === 'diff' ? (
              <>
                <th colSpan={n} className="px-2 py-1 text-center bg-indigo-700 text-white text-[10px]">
                  変更前後（変更あり = 青↓取消線）
                </th>
                <th className="px-2 py-1 text-center bg-red-800 text-white text-[10px]">除外</th>
                <th className="px-2 py-1 text-center bg-red-700 text-white text-[10px]">問題</th>
              </>
            ) : (
              <>
                <th colSpan={n} className="px-2 py-1 text-center bg-green-800 text-white text-[10px]">After（発令後）</th>
                <th colSpan={n} className="px-2 py-1 text-center bg-blue-800 text-white text-[10px]">Before（発令前）</th>
                <th className="px-2 py-1 text-center bg-red-800 text-white text-[10px]">除外</th>
              </>
            )}
          </tr>
          {/* ── 列ヘッダー行 ── */}
          <tr>
            <th className="px-1.5 py-1.5 bg-gray-100 border-b border-gray-200 w-6"></th>
            <th className={thD}>担当者</th>
            <th className={thD}>No</th>
            <th className={thD}>ユーザーID</th>
            <th className={thD}>グループ社員ID</th>
            <th className={thD}>社員番号</th>
            <th className={thD}>姓</th>
            <th className={thD}>名</th>
            <th className={thD}>異動事由</th>
            <th className={thD}>メモ</th>
            <th className={thD}>昇降格</th>
            <th className={thD}>降格理由</th>
            <th className={thD}>給与等級</th>
            <th className={thD}>変更種別</th>
            {viewMode === 'diff' ? (
              <>
                {allDisplayFields.map(f => <th key={f.afterKey} className={thM}>{f.label}</th>)}
                <th className={thD}>除外理由</th>
                <th className={`${thD} text-red-600`}>問題</th>
              </>
            ) : (
              <>
                {allDisplayFields.map(f => <th key={`a_${f.afterKey}`} className={thA}>{f.label}</th>)}
                {allDisplayFields.map(f => <th key={`b_${f.prevKey}`}  className={thB}>{f.label}</th>)}
                <th className={thD}>除外理由</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={COL_SPAN} className="px-4 py-8 text-center text-gray-400 text-xs">該当なし</td></tr>
          )}
          {paddingTop > 0 && (
            <tr aria-hidden><td colSpan={COL_SPAN} style={{ height: paddingTop, padding: 0 }} /></tr>
          )}
          {visibleRows.map((rr, localIdx) => {
            const globalIdx = startIdx + localIdx
            const isChecked = selectedRowIds.has(rr.row.rowId)
            return viewMode === 'diff' ? (
              <DiffModeRow
                key={rr.row.rowId}
                reviewRow={rr}
                allDisplayFields={allDisplayFields}
                rowIndex={globalIdx}
                onFieldEdit={onFieldEdit}
                transferReasonOptions={transferReasonOptions}
                isSelected={rr.row.rowId === selectedRowId}
                isChecked={isChecked}
                onRowClick={onRowClick}
                onRowDoubleClick={onRowDoubleClick}
                onCheckChange={toggleRow}
              />
            ) : (
              <SideBySideRow
                key={rr.row.rowId}
                reviewRow={rr}
                allDisplayFields={allDisplayFields}
                rowIndex={globalIdx}
                onFieldEdit={onFieldEdit}
                transferReasonOptions={transferReasonOptions}
                isSelected={rr.row.rowId === selectedRowId}
                isChecked={isChecked}
                onRowClick={onRowClick}
                onRowDoubleClick={onRowDoubleClick}
                onCheckChange={toggleRow}
              />
            )
          })}
          {paddingBot > 0 && (
            <tr aria-hidden><td colSpan={COL_SPAN} style={{ height: paddingBot, padding: 0 }} /></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
