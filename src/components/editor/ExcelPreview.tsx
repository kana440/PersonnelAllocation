import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useScopedStore } from '../../store/useScopedStore'
import { toAllocationRows } from '../../infrastructure/allocationListMapper'
import type { AllocationRow } from '../../infrastructure/allocationListMapper'
import { exportToXlsx } from '../../infrastructure/excel/engine'
import { BEFORE_AFTER_FIELD_PAIRS } from '../../domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '../../domain/csvImport/allocationList/labels'
import { ExportOrgDialog } from './ExportOrgDialog'

type SearchCol = 'name' | 'id' | 'dept'
const SEARCH_COL_LABELS: Record<SearchCol, string> = { name: '氏名', id: '社員ID', dept: '部署名' }
const ALL_SEARCH_COLS: SearchCol[] = ['name', 'id', 'dept']

const DISPLAY_FIELDS = BEFORE_AFTER_FIELD_PAIRS.map(([afterKey, prevKey]) => ({
  label:   ALLOCATION_LIST_LABEL_MAP[String(prevKey)]?.ja ?? String(prevKey),
  afterKey: afterKey as keyof AllocationRow,
  prevKey:  prevKey  as keyof AllocationRow,
}))

// 仮想スクロール設定
const ROW_HEIGHT  = 33   // py-1.5 + text-xs の実測値
const ROW_BUFFER  = 25   // ビューポート外に余分にレンダリングする行数

// ── Component ─────────────────────────────────────────────────────────────────
export function ExcelPreview() {
  const store = useScopedStore()

  // ── 検索（入力は即時反映、フィルタは 300ms デバウンス）────────
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm,  setSearchTerm]  = useState('')
  const [matchIdx,    setMatchIdx]    = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // ── 検索列選択 ────────────────────────────────────────────────
  const [searchCols,    setSearchCols]    = useState<Set<SearchCol>>(new Set(ALL_SEARCH_COLS))
  const [showColPicker, setShowColPicker] = useState(false)
  const colPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showColPicker) return
    const close = (e: MouseEvent) => {
      if (!colPickerRef.current?.contains(e.target as Node)) setShowColPicker(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showColPicker])

  // ── 仮想スクロール ────────────────────────────────────────────
  const scrollRef      = useRef<HTMLDivElement>(null)
  const [scrollTop,     setScrollTop]     = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // クリック選択・ダブルクリック編集
  const { persons, selectedPersonId, selectedRowId, selectRow, enterEditMode, selectPersonAndFocusOrg } = store

  // ── 右クリックコンテキストメニュー ──────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; personId: string } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [contextMenu])

  // O(n) dedup: before/after org を統合
  const allOrgs = useMemo(() => {
    const beforeIds = new Set(store.organizations.map(o => o.id))
    return [
      ...store.organizations,
      ...store.afterOrganizations.filter(o => !beforeIds.has(o.id)),
    ]
  }, [store.organizations, store.afterOrganizations])

  // allOrgs に依存（rawな store フィールドではなく allOrgs の memo 結果を使う）
  const rows = useMemo(() => toAllocationRows(store.allocationList, allOrgs), [store.allocationList, allOrgs])

  const filteredRows = rows

  // 検索マッチするインデックス（デバウンス済み searchTerm・選択列で計算）
  const matchIndices = useMemo(() => {
    if (!searchTerm.trim()) return []
    const lower = searchTerm.toLowerCase()
    return rows.reduce<number[]>((acc, row, i) => {
      const hit =
        (searchCols.has('name') && `${row.lastName ?? ''}${row.firstName ?? ''}`.toLowerCase().includes(lower)) ||
        (searchCols.has('id')   && `${row.userId ?? ''} ${row.employeeNumber ?? ''}`.toLowerCase().includes(lower)) ||
        (searchCols.has('dept') && `${row._meta.companyName ?? ''} ${row.departmentCode ?? ''}`.toLowerCase().includes(lower))
      if (hit) acc.push(i)
      return acc
    }, [])
  }, [rows, searchTerm, searchCols])

  // selectedPersonId / selectedRowId が変わったらその行へジャンプ
  useEffect(() => {
    if (!store.selectedPersonId) return
    const idx = filteredRows.findIndex(r => r.userId && `p_${r.userId}` === store.selectedPersonId)
    if (idx >= 0) scrollToRowIdx(idx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selectedPersonId])

  useEffect(() => {
    if (store.selectedRowId === null) return
    const idx = filteredRows.findIndex(r => r.rowId === store.selectedRowId)
    if (idx >= 0) scrollToRowIdx(idx)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selectedRowId])

  const safeMatchIdx = matchIndices.length > 0 ? matchIdx % matchIndices.length : 0

  // 行インデックスが可視範囲に入っていなければスクロール
  const scrollToRowIdx = useCallback((idx: number) => {
    const el = scrollRef.current
    if (!el) return
    const rowTop = idx * ROW_HEIGHT
    const rowBot = rowTop + ROW_HEIGHT
    if (rowTop < el.scrollTop || rowBot > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: rowTop - el.clientHeight / 2, behavior: 'smooth' })
    }
  }, [])

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || matchIndices.length === 0) return
    e.preventDefault()
    const next = (safeMatchIdx + 1) % matchIndices.length
    setMatchIdx(next)
    scrollToRowIdx(matchIndices[next])
  }, [matchIndices, safeMatchIdx, scrollToRowIdx])

  useEffect(() => {
    setMatchIdx(0)
    if (matchIndices.length > 0) scrollToRowIdx(matchIndices[0])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  const scopeOrg = store.scopeOrgId
    ? store.afterOrganizations.find(o => o.id === store.scopeOrgId) ?? null
    : null

  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const handleExport = () => {
    if (scopeOrg) {
      setExportDialogOpen(true)   // scope active → show org selection dialog
    } else {
      exportToXlsx(rows, store.effectiveDate)  // no scope → direct download
    }
  }

  // ── 仮想スクロールの計算 ──────────────────────────────────────
  const startIdx      = Math.max(0,                 Math.floor(scrollTop / ROW_HEIGHT) - ROW_BUFFER)
  const endIdx        = Math.min(filteredRows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + ROW_BUFFER)
  const paddingTop    = startIdx * ROW_HEIGHT
  const paddingBottom = (filteredRows.length - endIdx) * ROW_HEIGHT
  const visibleRows   = filteredRows.slice(startIdx, endIdx)

  const N   = DISPLAY_FIELDS.length
  const COL_SPAN = 11 + N * 2 + 1   // メタ11 + After N + Before N + 除外1
  const thM = 'px-2 py-2 text-left whitespace-nowrap bg-gray-700 text-white text-xs'
  const thA = 'px-2 py-2 text-left whitespace-nowrap bg-green-900 text-white text-xs'
  const thB = 'px-2 py-2 text-left whitespace-nowrap bg-blue-900 text-white text-xs'
  const thX = 'px-2 py-2 text-left whitespace-nowrap bg-red-900 text-white text-xs'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600 flex-shrink-0">要員配置リスト（Excel形式プレビュー）</span>
        <span className="text-xs text-gray-400 flex-shrink-0">
          {rows.length.toLocaleString()} 件
        </span>

        {/* 検索バー */}
        <div className="flex items-center gap-1 flex-1 max-w-xs">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="🔍 検索（Enter で次へ）"
            className="flex-1 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
          />
          {searchInput && (
            <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
              {matchIndices.length > 0
                ? `${safeMatchIdx + 1}/${matchIndices.length}`
                : '0件'}
            </span>
          )}
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setSearchTerm('') }}
              className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0"
            >✕</button>
          )}
        </div>

        {/* 検索列選択 */}
        <div className="relative flex-shrink-0" ref={colPickerRef}>
          <button
            onClick={() => setShowColPicker(v => !v)}
            className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center gap-1"
          >
            <span>列</span>
            <span className="text-gray-400">▾</span>
          </button>
          {showColPicker && (
            <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-24">
              {ALL_SEARCH_COLS.map(col => (
                <label key={col} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={searchCols.has(col)}
                    onChange={() => setSearchCols(prev => {
                      const s = new Set(prev)
                      s.has(col) ? s.delete(col) : s.add(col)
                      return s
                    })}
                    className="rounded"
                  />
                  {SEARCH_COL_LABELS[col]}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {scopeOrg && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              スコープ: {scopeOrg.name}（{rows.length}行）
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-blue-300 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            📤 エクスポート
          </button>
        </div>

        {exportDialogOpen && (
          <ExportOrgDialog
            afterOrgs={store.afterOrganizations}
            rows={rows}
            effectiveDate={store.effectiveDate}
            scopeOrg={scopeOrg}
            onClose={() => setExportDialogOpen(false)}
          />
        )}
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 100 }}
          className="bg-white shadow-lg border border-gray-200 rounded py-1 text-xs min-w-[6rem]"
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={() => { selectPersonAndFocusOrg(contextMenu.personId); setContextMenu(null) }}
            className="block w-full text-left px-3 py-1.5 hover:bg-blue-50 text-gray-700"
          >
            編集
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-auto min-h-0"
        ref={scrollRef}
        onScroll={e => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th colSpan={11} className="px-2 py-1 text-center bg-gray-600 text-white border-r border-gray-500 text-xs font-bold">本人情報 / 変更区分</th>
              <th colSpan={N}  className="px-2 py-1 text-center bg-green-800 text-white border-r border-green-700 text-xs font-bold">After（発令後）</th>
              <th colSpan={N}  className="px-2 py-1 text-center bg-blue-800 text-white border-r border-blue-700 text-xs font-bold">Before（発令前）</th>
              <th colSpan={1}  className="px-2 py-1 text-center bg-red-800 text-white text-xs font-bold">除外</th>
            </tr>
            <tr>
              <th className={thM}>No</th>
              <th className={thM}>ユーザー/社員ID</th>
              <th className={thM}>グループ社員ID</th>
              <th className={thM}>社員番号</th>
              <th className={thM}>姓</th>
              <th className={thM}>名</th>
              <th className={`${thM} border-l border-gray-500`}>申請区分(異動事由)</th>
              <th className={thM}>メモ</th>
              <th className={thM}>昇降格サイン</th>
              <th className={thM}>降格理由</th>
              <th className={`${thM} border-r border-gray-500`}>給与等級変更サイン</th>
              {DISPLAY_FIELDS.map(f => <th key={`a_${String(f.afterKey)}`} className={thA}>{f.label}</th>)}
              {DISPLAY_FIELDS.map(f => <th key={`b_${String(f.prevKey)}`}  className={thB}>{f.label}</th>)}
              <th className={thX}>除外理由</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={COL_SPAN} className="px-4 py-8 text-center text-gray-400">
                  データがありません
                </td>
              </tr>
            )}

            {/* 仮想スクロール: 上側スペーサー */}
            {paddingTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={COL_SPAN} style={{ height: paddingTop, padding: 0 }} />
              </tr>
            )}

            {visibleRows.map((row, localIdx) => {
              const i = startIdx + localIdx
              const changed = row._meta.operationType !== '変更なし'
              const isMatch   = matchIndices.includes(i)
              const isCurrent = isMatch && matchIndices[safeMatchIdx] === i

              const matchedPerson = row.userId ? persons.find(p => p.sfPersonId === row.userId) : undefined
              const isPersonSelected = matchedPerson && selectedPersonId === matchedPerson.id
              const isRowSelected    = selectedRowId === row.rowId

              const baseBg = isRowSelected
                ? 'bg-blue-100'
                : isPersonSelected
                ? 'bg-yellow-50'
                : changed
                ? (i % 2 === 0 ? 'bg-orange-50' : 'bg-orange-100/60')
                : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50')
              const tdM = `px-2 py-1.5 whitespace-nowrap text-xs ${baseBg}`
              const tdA = `px-2 py-1.5 whitespace-nowrap text-xs bg-green-50`
              const tdB = `px-2 py-1.5 whitespace-nowrap text-xs bg-blue-50`
              const v   = (val: string | undefined | null) =>
                val ? val : <span className="text-gray-300">—</span>

              const handleRowClick = () => {
                if (!matchedPerson) return
                selectPersonAndFocusOrg(matchedPerson.id)
                selectRow(row.rowId)
              }

              const handleRowDragStart = (e: React.DragEvent) => {
                if (!matchedPerson) return
                e.dataTransfer.setData('application/json', JSON.stringify({
                  personId:        matchedPerson.id,
                  fromOrgId:       '',
                  fromCompanyId:   row._meta.companyId ?? '',
                  affiliationType: 'primary',
                  source:          'excel',
                }))
                e.dataTransfer.effectAllowed = 'move'
              }

              return (
                <tr
                  key={`${row.userId ?? ''}_${i}_${row._meta.companyId}`}
                  draggable={!!matchedPerson}
                  onDragStart={handleRowDragStart}
                  onClick={handleRowClick}
                  onDoubleClick={() => row.rowId && enterEditMode(row.rowId)}
                  onContextMenu={e => {
                    if (!row.userId) return
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, personId: `p_${row.userId}` })
                  }}
                  className={`border-b border-gray-200 cursor-pointer ${
                    isRowSelected    ? 'ring-2 ring-inset ring-blue-400' :
                    isPersonSelected ? 'ring-1 ring-inset ring-yellow-300' :
                    isCurrent        ? 'ring-2 ring-inset ring-yellow-400' :
                    isMatch          ? 'ring-1 ring-inset ring-yellow-200' : ''
                  }`}
                >
                  <td className={`${tdM} text-gray-400`}>{row.no}</td>
                  <td className={`${tdM} font-mono text-gray-500`}>{v(row.userId)}</td>
                  <td className={`${tdM} font-mono text-gray-400`}>{v(row.groupEmployeeId)}</td>
                  <td className={`${tdM} font-mono text-gray-400`}>{v(row.employeeNumber)}</td>
                  <td className={`${tdM} font-medium`}>{v(row.lastName)}</td>
                  <td className={tdM}>{v(row.firstName)}</td>
                  <td className={`${tdM} border-l border-gray-200`}>
                    {row.transferReason ?? (changed ? row._meta.operationType : '')}
                    {!row._meta.hasSF && <span className="ml-1 text-gray-400">(SF外)</span>}
                  </td>
                  <td className={`${tdM} max-w-32 truncate`}>{v(row.memo)}</td>
                  <td className={`${tdM} text-center`}>{row.promotionSign ?? ''}</td>
                  <td className={`${tdM} text-red-600`}>{v(row.demotionReason)}</td>
                  <td className={`${tdM} text-center border-r border-gray-200`}>{row.payGradeChangeSign ?? ''}</td>
                  {DISPLAY_FIELDS.map(f => {
                    const val = row[f.afterKey]
                    return (
                      <td key={`a_${String(f.afterKey)}`} className={tdA}>
                        {val !== undefined && val !== null && val !== '' ? String(val) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                  {DISPLAY_FIELDS.map(f => {
                    const val = row[f.prevKey]
                    return (
                      <td key={`b_${String(f.prevKey)}`} className={tdB}>
                        {val !== undefined && val !== null && val !== '' ? String(val) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                  <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-red-600 ${baseBg}`}>
                    {v(row.exclusionReason)}
                  </td>
                </tr>
              )
            })}

            {/* 仮想スクロール: 下側スペーサー */}
            {paddingBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={COL_SPAN} style={{ height: paddingBottom, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
