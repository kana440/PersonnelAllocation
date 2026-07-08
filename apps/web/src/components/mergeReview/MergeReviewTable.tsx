import { useRef, useState, useEffect, useMemo } from 'react'
import { FIELD_METADATA } from '@personnel/domain/allocationRow'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import { fieldLabel } from './helpers'
import type { ReviewRow } from '../review/hooks/useReviewData'
import type { MergeSessionRow } from '../../infrastructure/workspace'

const KIND_LABEL: Record<MergeSessionRow['kind'], string> = {
  added:    '追加',
  modified: '変更',
  removed:  '消えた行',
}
const KIND_BADGE_CLS: Record<MergeSessionRow['kind'], string> = {
  added:    'bg-green-100 text-green-700',
  modified: 'bg-yellow-100 text-yellow-700',
  removed:  'bg-red-100 text-red-700',
}
const DYN_FIELD_KEYS = FIELD_METADATA.map(m => m.after as string)
const DYN_W  = 96
const ORG_H  = 30
// 変更あり行は「取り込み値 / 現在値(取消線)」の2行スタックになるため、UnifiedTable の
// diff モードと同様、全行を同じ高さに揃える（仮想化の累積高さ計算を単純に保つため）
const ROW_H  = 40
const ROW_BUFFER = 20

export type GroupedItem =
  | { kind: 'org-header'; orgCode: string; orgName: string; orgPath: string; rowCount: number }
  | { kind: 'row'; reviewRow: ReviewRow }

interface Props {
  groupedItems:           GroupedItem[]
  keyByRowId:             Map<number, string>
  sessionRowByKey:        Map<string, MergeSessionRow>
  currentByNo:            Map<string | undefined, AllocationRow>
  beforeOrgByCode:        Map<string, Organization>
  selected:               Set<number>
  toggleRow:              (rowId: number) => void
  allVisibleSelected:     boolean
  toggleSelectAllVisible: () => void
  updateMergeRowField:    (key: string, field: string, value: string) => void
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

const thField  = 'px-1.5 py-1 text-left font-medium text-gray-600 bg-gray-100 text-[9px] whitespace-nowrap border-b border-gray-200'
const COL_SPAN = 5 + DYN_FIELD_KEYS.length
const TABLE_W  = 560 + DYN_FIELD_KEYS.length * DYN_W

/**
 * 変更前後を1列にまとめる比較セル（UnifiedTable の DiffCell と同じ見た目・配色）。
 * 変更なし = 1行のみ。変更あり = 取り込み値(青太字/編集可) の下に現在値(灰・取消線)。
 * 表示対象は常に未承認（pending）行のみのため、編集は常に有効。
 */
function MergeDiffCell({
  incoming, current, onChange,
}: {
  incoming?: string
  current:   string
  onChange:  (value: string) => void
}) {
  if (incoming === undefined) {
    return (
      <td className="px-1.5 py-1 align-top">
        <span className="text-[10px] text-gray-500">{current || <span className="text-gray-300">—</span>}</span>
      </td>
    )
  }
  const changed = incoming !== current
  return (
    <td className={`px-1.5 py-1 align-top ${changed ? 'bg-yellow-50' : ''}`}>
      <div className="flex flex-col gap-0.5">
        <input
          value={incoming}
          onChange={e => onChange(e.target.value)}
          className={`w-full px-1 py-0.5 border border-gray-200 rounded text-[10px] focus:outline-none focus:border-blue-400 bg-white ${changed ? 'font-medium text-blue-700' : 'text-gray-600'}`}
        />
        {changed && (
          <span className="text-gray-400 line-through text-[9px] block overflow-hidden text-ellipsis">{current || '—'}</span>
        )}
      </div>
    </td>
  )
}

/**
 * 行ウィンドウイングされたテーブル本体。UnifiedTable.tsx と同じ技法（累積高さ配列 +
 * 二分探索 + 前後パディング行）を使う。マージ/リベースは数万行規模になり得るため
 * （特にリベースは全社規模の差し替えを扱う）、DOM に全行を出さないことが必須。
 * 表示形式は UnifiedTable の「比較形式（diff モード）」に揃え、取り込み値と現在値を
 * フィールドごとに1列へ統合する（Excel形式=左右2列並びは採用しない）。
 */
export function MergeReviewTable({
  groupedItems, keyByRowId, sessionRowByKey, currentByNo, beforeOrgByCode,
  selected, toggleRow, allVisibleSelected, toggleSelectAllVisible, updateMergeRowField,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [vpHeight,  setVpHeight]  = useState(400)

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

  const cumulative = useMemo(() => {
    const cum = new Array(groupedItems.length + 1)
    cum[0] = 0
    for (let i = 0; i < groupedItems.length; i++) {
      cum[i + 1] = cum[i] + (groupedItems[i].kind === 'org-header' ? ORG_H : ROW_H)
    }
    return cum
  }, [groupedItems])

  const totalHeight = cumulative[groupedItems.length]
  const startIdx   = Math.max(0, findStartIdx(scrollTop, cumulative) - ROW_BUFFER)
  const endIdx     = Math.min(groupedItems.length, findStartIdx(scrollTop + vpHeight, cumulative) + 1 + ROW_BUFFER)
  const paddingTop = cumulative[startIdx]
  const paddingBot = totalHeight - cumulative[endIdx]
  const visibleItems = groupedItems.slice(startIdx, endIdx)

  if (groupedItems.length === 0) {
    return <div className="px-4 py-8 text-center text-xs text-gray-400">該当する行はありません</div>
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-auto min-h-0 [scrollbar-gutter:stable]"
      onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <table className="text-xs border-collapse [table-layout:fixed]" style={{ width: TABLE_W }}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-gray-100 border-b border-gray-200" colSpan={5} />
            <th colSpan={DYN_FIELD_KEYS.length} className="px-1.5 py-1 text-center font-medium text-white bg-indigo-700 text-[10px] whitespace-nowrap">
              変更前後（変更あり = 青↓取消線）
            </th>
          </tr>
          <tr>
            <th className="px-3 py-2 bg-gray-100 border-b border-gray-200 w-8">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} className="accent-blue-600" />
            </th>
            <th className="text-left px-2 py-2 text-gray-500 font-medium bg-gray-100 border-b border-gray-200 w-16">種別</th>
            <th className="text-left px-2 py-2 text-gray-500 font-medium bg-gray-100 border-b border-gray-200">氏名</th>
            <th className="text-left px-2 py-2 text-gray-500 font-medium bg-gray-100 border-b border-gray-200">旧組織</th>
            <th className="text-left px-2 py-2 text-gray-500 font-medium bg-gray-100 border-b border-gray-200 w-16">要確認</th>
            {DYN_FIELD_KEYS.map(key => (
              <th key={key} className={thField} style={{ width: DYN_W }}>{fieldLabel(key)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr aria-hidden><td colSpan={COL_SPAN} style={{ height: paddingTop, padding: 0 }} /></tr>
          )}
          {visibleItems.map((item, localIdx) => {
            const globalIdx = startIdx + localIdx

            if (item.kind === 'org-header') {
              return (
                <tr key={`org-${globalIdx}`} style={{ height: ORG_H }} className="bg-gray-100">
                  <td colSpan={COL_SPAN} className="px-3 border-b border-gray-300" style={{ height: ORG_H }}>
                    <div className="flex items-center gap-2 h-full">
                      <span className="text-[11px] font-semibold text-gray-700">{item.orgName}</span>
                      {item.orgPath && item.orgPath !== item.orgName && (
                        <span className="text-[10px] text-gray-400 truncate">{item.orgPath}</span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">{item.rowCount}人</span>
                    </div>
                  </td>
                </tr>
              )
            }

            const r = item.reviewRow
            const key        = keyByRowId.get(r.row.rowId)
            const sessionRow = key ? sessionRowByKey.get(key) : undefined
            const kind       = sessionRow?.kind ?? 'modified'
            const currentRow = key ? currentByNo.get(key) : undefined
            const incoming   = sessionRow?.incomingRow
            const prevOrgName = beforeOrgByCode.get(r.row.prevDepartmentCode as string ?? '')?.name
              ?? (r.row.prevDepartmentCode as string | undefined)

            return (
              <tr key={r.row.rowId} style={{ height: ROW_H }} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-1 align-top">
                  <input type="checkbox" checked={selected.has(r.row.rowId)} onChange={() => toggleRow(r.row.rowId)} className="accent-blue-600" />
                </td>
                <td className="px-2 py-1 align-top">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${KIND_BADGE_CLS[kind]}`}>{KIND_LABEL[kind]}</span>
                </td>
                <td className="px-2 py-1 align-top text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">{r.personName || r.row.userId || `No.${r.row.no ?? ''}`}</td>
                <td className="px-2 py-1 align-top text-gray-400 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">{prevOrgName || '—'}</td>
                <td className="px-2 py-1 align-top">
                  {r.issues.length > 0 && <span className="text-red-600 text-[10px]">⚠ {r.issues.length}</span>}
                </td>
                {DYN_FIELD_KEYS.map(fkey => {
                  const currentVal = currentRow ? String((currentRow as unknown as Record<string, unknown>)[fkey] ?? '') : ''
                  const incomingVal = incoming ? String((incoming as unknown as Record<string, unknown>)[fkey] ?? '') : undefined
                  return (
                    <MergeDiffCell
                      key={fkey}
                      incoming={incomingVal}
                      current={currentVal}
                      onChange={val => key && updateMergeRowField(key, fkey, val)}
                    />
                  )
                })}
              </tr>
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
