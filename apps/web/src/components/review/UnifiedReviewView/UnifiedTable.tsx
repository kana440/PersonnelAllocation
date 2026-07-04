import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ReviewRow } from '../hooks/useReviewData'
import type { ViewMode, DisplayField } from './types'
import { DiffModeRow }              from './DiffModeRow'
import { SideBySideRow }            from './SideBySideRow'
import { useRowSelectionStore }     from '../../../store/rowSelectionStore'
import { useReviewFilterStore }     from '../../../store/reviewFilterStore'

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

  const scrollRef    = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [vpHeight,  setVpHeight]  = useState(400)

  // useLayoutEffect 内で最新値を読むためのリーフ参照（deps に入れない）
  const rowsRef         = useRef(rows)
  rowsRef.current       = rows
  const selectedRowIdRef = useRef(selectedRowId)
  selectedRowIdRef.current = selectedRowId

  const { selectedRowIds, toggleRow, toggleAll } = useRowSelectionStore(
    useShallow(s => ({ selectedRowIds: s.selectedRowIds, toggleRow: s.toggleRow, toggleAll: s.toggleAll }))
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // RAF デバウンス: ResizeObserver ループが起きても1フレームで収束させる
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setVpHeight(el.clientHeight))
    })
    ro.observe(el)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  // ── スクロール位置管理 ──────────────────────────────────────────────
  const prevViewModeRef = useRef<ViewMode | null>(null)

  // マウント時: pendingScrollRowId（切替前にセット済）に即ジャンプ、なければ保存位置を復元
  // viewMode 変化時: 行高さが変わるため選択行へ即ジャンプ
  // どちらも useLayoutEffect でペイント前に確定 → スクロールアニメが見えない
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const isMount = prevViewModeRef.current === null
    prevViewModeRef.current = viewMode

    if (isMount) {
      const store = useReviewFilterStore.getState()
      const pending = store.pendingScrollRowId
      if (pending !== null) {
        const idx = rowsRef.current.findIndex(r => r.row.rowId === pending)
        if (idx >= 0) el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2)
        store.setPendingScrollRowId(null)
      } else {
        el.scrollTop = store.scrollTopByMode[viewMode] ?? 0
      }
    } else {
      // viewMode 変化: 選択行へ即再ジャンプ（行高さが変わったため）
      const selId = selectedRowIdRef.current
      if (selId !== null) {
        const idx = rowsRef.current.findIndex(r => r.row.rowId === selId)
        if (idx >= 0) el.scrollTop = Math.max(0, idx * ROW_H - el.clientHeight / 2)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]) // ROW_H は viewMode からの派生値なので viewMode のみで十分

  const startIdx    = Math.max(0, Math.floor(scrollTop / ROW_H) - ROW_BUFFER)
  const endIdx      = Math.min(rows.length, Math.ceil((scrollTop + vpHeight) / ROW_H) + ROW_BUFFER)
  const paddingTop  = startIdx * ROW_H
  const paddingBot  = (rows.length - endIdx) * ROW_H
  const visibleRows = rows.slice(startIdx, endIdx)
  const n           = allDisplayFields.length

  // diff:  チェック(1) + 担当者(1) + 本人情報11列 + 変更種別(1) + 差分統合列(n) + 除外(1) + 問題(1) = 16 + n
  // sbs:   チェック(1) + 担当者(1) + 本人情報11列 + 変更種別(1) + After(n) + Before(n) + 除外(1)  = 15 + 2n
  const COL_SPAN = viewMode === 'diff' ? 16 + n : 15 + 2 * n

  // 列幅定数 — table-layout:fixed で仮想スクロール時のカラム幅再計算フリッカーを防ぐ
  const STATIC_W   = 876  // 静的14列の合計px
  const DIFF_DYN_W = 120  // diff モード動的列（1フィールド）
  const SBS_DYN_W  = 96   // sbs モード動的列（after/before 各1フィールド）
  const tableWidth = viewMode === 'diff'
    ? STATIC_W + n * DIFF_DYN_W + 384  // 384 = 除外(64)+問題(320)
    : STATIC_W + n * SBS_DYN_W * 2 + 64  // 64 = 除外

  const thD = 'px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200 text-[10px] whitespace-nowrap bg-gray-100 overflow-hidden'
  const thM = 'px-2 py-1.5 text-left font-medium text-white border-b border-indigo-700 text-[10px] whitespace-nowrap bg-indigo-700 overflow-hidden'
  const thA = 'px-2 py-1.5 text-left font-medium text-white border-b border-green-700 text-[10px] whitespace-nowrap bg-green-800 overflow-hidden'
  const thB = 'px-2 py-1.5 text-left font-medium text-white border-b border-blue-700 text-[10px] whitespace-nowrap bg-blue-800 overflow-hidden'


  const filteredRowIds = rows.map(r => r.row.rowId)
  const allChecked     = filteredRowIds.length > 0 && filteredRowIds.every(id => selectedRowIds.has(id))
  const someChecked    = filteredRowIds.some(id => selectedRowIds.has(id))

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto min-h-0 [scrollbar-gutter:stable]"
      onScroll={e => {
        const top = (e.target as HTMLDivElement).scrollTop
        setScrollTop(top)
        useReviewFilterStore.getState().setScrollTopByMode(viewMode, top)
      }}
    >
      <table className="text-xs border-collapse [table-layout:fixed]" style={{ width: tableWidth }}>
        <colgroup>
          <col style={{ width: 28 }} />   {/* チェック */}
          <col style={{ width: 64 }} />   {/* 担当者 */}
          <col style={{ width: 32 }} />   {/* No */}
          <col style={{ width: 72 }} />   {/* ユーザーID */}
          <col style={{ width: 96 }} />   {/* グループ社員ID */}
          <col style={{ width: 56 }} />   {/* 社員番号 */}
          <col style={{ width: 48 }} />   {/* 姓 */}
          <col style={{ width: 48 }} />   {/* 名 */}
          <col style={{ width: 96 }} />   {/* 異動事由 */}
          <col style={{ width: 80 }} />   {/* メモ */}
          <col style={{ width: 44 }} />   {/* 昇降格 */}
          <col style={{ width: 60 }} />   {/* 降格理由 */}
          <col style={{ width: 56 }} />   {/* 給与等級 */}
          <col style={{ width: 96 }} />   {/* 変更種別 */}
          {viewMode === 'diff' ? (
            <>
              {allDisplayFields.map((_, i) => <col key={`d${i}`} style={{ width: DIFF_DYN_W }} />)}
              <col style={{ width: 64 }} />   {/* 除外理由 */}
              <col style={{ width: 320 }} />  {/* 問題 */}
            </>
          ) : (
            <>
              {allDisplayFields.map((_, i) => <col key={`a${i}`} style={{ width: SBS_DYN_W }} />)}
              {allDisplayFields.map((_, i) => <col key={`b${i}`} style={{ width: SBS_DYN_W }} />)}
              <col style={{ width: 64 }} />  {/* 除外理由 */}
            </>
          )}
        </colgroup>
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
