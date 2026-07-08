import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ViewMode, DisplayField, OrgTableItem } from './types'
import { DiffModeRow }              from './DiffModeRow'
import { SideBySideRow }            from './SideBySideRow'
import { useRowSelectionStore }     from '../../../store/rowSelectionStore'
import { useReviewFilterStore }     from '../../../store/reviewFilterStore'

const ORG_H   = 30   // 組織セクションヘッダー行の高さ
const DIFF_ROW_H = 42
const SBS_ROW_H  = 33
const ROW_BUFFER = 20

interface Props {
  items:                 OrgTableItem[]
  viewMode:              ViewMode
  allDisplayFields:      DisplayField[]
  onFieldEdit:           (rowId: number, field: string, value: string) => void
  transferReasonOptions: string[]
  selectedRowId:         number | null
  onRowClick:            (rowId: number) => void
  onRowDoubleClick:      (rowId: number) => void
  onOrgClick:            (orgId: string) => void
}

/** 累積高さ配列から scrollTop に対応する先頭 index を二分探索で返す */
function findStartIdx(scrollTop: number, cumulative: number[]): number {
  let lo = 0, hi = cumulative.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cumulative[mid] <= scrollTop) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo - 1)
}

export function UnifiedTable({
  items, viewMode, allDisplayFields,
  onFieldEdit, transferReasonOptions,
  selectedRowId, onRowClick, onRowDoubleClick, onOrgClick,
}: Props) {
  const ROW_H = viewMode === 'diff' ? DIFF_ROW_H : SBS_ROW_H

  const scrollRef    = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [vpHeight,  setVpHeight]  = useState(400)

  // useLayoutEffect 内で最新値を読むためのリーフ参照（deps に入れない）
  const itemsRef         = useRef(items)
  itemsRef.current       = items
  const selectedRowIdRef = useRef(selectedRowId)
  selectedRowIdRef.current = selectedRowId

  // 各 item の高さと累積高さを事前計算
  const cumulative = useMemo(() => {
    const cum = new Array(items.length + 1)
    cum[0] = 0
    for (let i = 0; i < items.length; i++) {
      cum[i + 1] = cum[i] + (items[i].kind === 'org-header' ? ORG_H : ROW_H)
    }
    return cum
  }, [items, ROW_H])

  // cumulative も ref で保持してレイアウトエフェクト内で読む
  const cumulativeRef = useRef(cumulative)
  cumulativeRef.current = cumulative

  const { selectedRowIds, toggleRow, toggleAll } = useRowSelectionStore(
    useShallow(s => ({ selectedRowIds: s.selectedRowIds, toggleRow: s.toggleRow, toggleAll: s.toggleAll }))
  )

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
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

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const isMount = prevViewModeRef.current === null
    prevViewModeRef.current = viewMode

    if (isMount) {
      const store = useReviewFilterStore.getState()
      const pendingRowId = store.pendingScrollRowId
      const pendingOrgId = store.pendingScrollOrgId

      if (pendingRowId !== null) {
        const idx = itemsRef.current.findIndex(
          item => item.kind === 'row' && item.reviewRow.row.rowId === pendingRowId
        )
        if (idx >= 0) el.scrollTop = Math.max(0, cumulativeRef.current[idx] - el.clientHeight / 2)
        store.setPendingScrollRowId(null)
      } else if (pendingOrgId !== null) {
        const idx = itemsRef.current.findIndex(
          item => item.kind === 'org-header' && item.orgId === pendingOrgId
        )
        if (idx >= 0) el.scrollTop = Math.max(0, cumulativeRef.current[idx] - el.clientHeight / 4)
        store.setPendingScrollOrgId(null)
      } else {
        el.scrollTop = store.scrollTopByMode[viewMode] ?? 0
      }
    } else {
      // viewMode 変化: 行高さが変わるため選択行へ再ジャンプ
      const selId = selectedRowIdRef.current
      if (selId !== null) {
        const idx = itemsRef.current.findIndex(
          item => item.kind === 'row' && item.reviewRow.row.rowId === selId
        )
        if (idx >= 0) el.scrollTop = Math.max(0, cumulativeRef.current[idx] - el.clientHeight / 2)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  const totalHeight = cumulative[items.length]

  const startIdx   = Math.max(0, findStartIdx(scrollTop, cumulative) - ROW_BUFFER)
  const endIdx     = Math.min(items.length, findStartIdx(scrollTop + vpHeight, cumulative) + 1 + ROW_BUFFER)
  const paddingTop = cumulative[startIdx]
  const paddingBot = totalHeight - cumulative[endIdx]
  const visibleItems = items.slice(startIdx, endIdx)

  const n = allDisplayFields.length

  // diff:  チェック(1) + 担当者(1) + 本人情報11列 + 変更種別(1) + 差分統合列(n) + 除外(1) + 問題(1) = 16 + n
  // sbs:   チェック(1) + 担当者(1) + 本人情報11列 + 変更種別(1) + After(n) + Before(n) + 除外(1)  = 15 + 2n
  const COL_SPAN = viewMode === 'diff' ? 16 + n : 15 + 2 * n

  const STATIC_W   = 980
  const DIFF_DYN_W = 120
  const SBS_DYN_W  = 96
  const tableWidth = viewMode === 'diff'
    ? STATIC_W + n * DIFF_DYN_W + 384
    : STATIC_W + n * SBS_DYN_W * 2 + 64

  const thD = 'px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200 text-[10px] whitespace-nowrap bg-gray-100 overflow-hidden'
  const thM = 'px-2 py-1.5 text-left font-medium text-white border-b border-indigo-700 text-[10px] whitespace-nowrap bg-indigo-700 overflow-hidden'
  const thA = 'px-2 py-1.5 text-left font-medium text-white border-b border-green-700 text-[10px] whitespace-nowrap bg-green-800 overflow-hidden'
  const thB = 'px-2 py-1.5 text-left font-medium text-white border-b border-blue-700 text-[10px] whitespace-nowrap bg-blue-800 overflow-hidden'

  // チェックボックス用の rowId 一覧（org-header を除く）
  const filteredRowIds = useMemo(
    () => items.flatMap(item => item.kind === 'row' ? [item.reviewRow.row.rowId] : []),
    [items]
  )
  const allChecked = filteredRowIds.length > 0 && filteredRowIds.every(id => selectedRowIds.has(id))
  const someChecked = filteredRowIds.some(id => selectedRowIds.has(id))

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
          <col style={{ width: 28 }} />
          <col style={{ width: 64 }} />
          <col style={{ width: 32 }} />
          <col style={{ width: 72 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 56 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 48 }} />
          <col style={{ width: 96 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 44 }} />
          <col style={{ width: 60 }} />
          <col style={{ width: 56 }} />
          <col style={{ width: 200 }} />
          {viewMode === 'diff' ? (
            <>
              {allDisplayFields.map((_, i) => <col key={`d${i}`} style={{ width: DIFF_DYN_W }} />)}
              <col style={{ width: 64 }} />
              <col style={{ width: 320 }} />
            </>
          ) : (
            <>
              {allDisplayFields.map((_, i) => <col key={`a${i}`} style={{ width: SBS_DYN_W }} />)}
              {allDisplayFields.map((_, i) => <col key={`b${i}`} style={{ width: SBS_DYN_W }} />)}
              <col style={{ width: 64 }} />
            </>
          )}
        </colgroup>
        <thead className="sticky top-0 z-10">
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
          {items.length === 0 && (
            <tr><td colSpan={COL_SPAN} className="px-4 py-8 text-center text-gray-400 text-xs">該当なし</td></tr>
          )}
          {paddingTop > 0 && (
            <tr aria-hidden><td colSpan={COL_SPAN} style={{ height: paddingTop, padding: 0 }} /></tr>
          )}
          {visibleItems.map((item, localIdx) => {
            const globalIdx = startIdx + localIdx

            if (item.kind === 'org-header') {
              // 組織パスを「親パス › 葉ノード名」に分割して表示
              const parts    = item.orgPath ? item.orgPath.split(' › ') : [item.orgName]
              const leafName = parts.at(-1) ?? item.orgName
              const parentPath = parts.length > 1 ? parts.slice(0, -1).join(' › ') : ''
              return (
                <tr
                  key={`org-${globalIdx}`}
                  style={{ height: ORG_H }}
                  className={`sticky z-[5] ${item.orgId ? 'cursor-pointer' : 'cursor-default'} ${
                    item.isOldSection ? 'hover:bg-amber-100' : 'hover:bg-gray-200'
                  }`}
                  onClick={() => { if (item.orgId) onOrgClick(item.orgId) }}
                >
                  <td
                    colSpan={COL_SPAN}
                    className={`px-3 border-b overflow-hidden ${
                      item.isOldSection
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-300 bg-gray-100'
                    }`}
                    style={{ height: ORG_H }}
                  >
                    <div className="flex items-center gap-2 h-full">
                      <div className="min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1">
                          {/* 色だけに頼らず「旧」「旧のみ」「新のみ」「未設定」を明示するバッジ（a11y）。
                              左Nav の OrgSection と同じ方針: 旧優先モードは通常セクションも含めて
                              「旧」を常時表示し、フェールオーバー（isUnmapped）のときは「旧のみ」にする。 */}
                          {item.isOldSection && (
                            <span className="flex-shrink-0 text-[8px] px-1 rounded bg-amber-200 text-amber-800 border border-amber-400 leading-tight">
                              {item.isUnmapped ? '旧のみ' : '旧'}
                            </span>
                          )}
                          {item.isUnmapped && !item.isOldSection && item.orgCode && (
                            <span className="flex-shrink-0 text-[8px] px-1 rounded bg-blue-100 text-blue-700 border border-blue-300 leading-tight">新のみ</span>
                          )}
                          {item.isUnmapped && !item.isOldSection && !item.orgCode && (
                            <span className="flex-shrink-0 text-[8px] px-1 rounded bg-gray-200 text-gray-600 border border-gray-300 leading-tight">未設定</span>
                          )}
                          <div className={`text-[10px] font-semibold truncate leading-tight ${
                            item.isOldSection ? 'text-amber-800' : 'text-gray-700'
                          }`}>
                            {leafName}
                          </div>
                        </div>
                        {parentPath && (
                          <div className="text-[9px] text-gray-400 truncate leading-none">
                            {parentPath}
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-gray-400 flex-shrink-0">
                        {item.rowCount}人
                      </span>
                    </div>
                  </td>
                </tr>
              )
            }

            const rr = item.reviewRow
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
