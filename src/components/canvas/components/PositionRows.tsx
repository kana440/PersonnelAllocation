import { useState, useMemo, useCallback } from 'react'
import { useOrgView } from '../OrgViewContext'
import type { DragData, PositionEntry } from '../OrgViewContext'
import type { AllocationRow } from '../../../domain/allocationRow'
import { appService } from '../../../application/HRApplicationService'
import { detectPositionPatterns } from '../../../application/positionPatterns'
import { useCanvasDisplayStore } from '../../../store/canvasDisplayStore'
import { CanvasFieldDiff } from './CanvasFieldDiff'

// ── カラーパレット（ReportLineView と同系） ───────────────────────────────────
const PALETTE = [
  { border: 'border-l-blue-400',    posBg: 'bg-blue-50',    personBg: 'bg-white', personBorder: 'border-gray-200' },
  { border: 'border-l-emerald-400', posBg: 'bg-emerald-50', personBg: 'bg-white', personBorder: 'border-gray-200' },
  { border: 'border-l-violet-400',  posBg: 'bg-violet-50',  personBg: 'bg-white', personBorder: 'border-gray-200' },
  { border: 'border-l-amber-400',   posBg: 'bg-amber-50',   personBg: 'bg-white', personBorder: 'border-gray-200' },
  { border: 'border-l-cyan-400',    posBg: 'bg-cyan-50',    personBg: 'bg-white', personBorder: 'border-gray-200' },
  { border: 'border-l-rose-400',    posBg: 'bg-rose-50',    personBg: 'bg-white', personBorder: 'border-gray-200' },
  { border: 'border-l-teal-400',    posBg: 'bg-teal-50',    personBg: 'bg-white', personBorder: 'border-gray-200' },
  { border: 'border-l-orange-400',  posBg: 'bg-orange-50',  personBg: 'bg-white', personBorder: 'border-gray-200' },
]

const isInternalPosCode = (s?: string) => !s || s.startsWith('_pos_')

const getPositionTitle = (row: AllocationRow): string =>
  row.localJobTitle || row.officialPositionCode ||
  (isInternalPosCode(row.positionCode) ? '' : (row.positionCode ?? '')) ||
  '（役職未設定）'

interface PositionRowsProps { orgId: string }

export function PositionRows({ orgId }: PositionRowsProps) {
  const displayFields = useCanvasDisplayStore(state => state.displayFields)
  const {
    positionTreeByOrgId,
    positionContext,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDropOnVacantSlot,
    handleDropPositionOnPosition,
    handlePositionContextMenu,
    handleReorderRow,
    isSelectMode, selectedPersonIds, togglePersonSelection,
    selectedPersonId, selectPerson,
    handleRowDoubleClick, handlePersonContextMenu,
    setConfirmDialog,
  } = useOrgView()

  const entries = positionTreeByOrgId.get(orgId) ?? []

  // ── 折りたたみ状態 ──────────────────────────────────────────────────────────
  const [collapsedPositions, setCollapsedPositions] = useState<Set<string>>(new Set())

  // ポジション→ポジションドラッグ中のホバー先 rowId
  const [dragOverPositionRowId, setDragOverPositionRowId] = useState<number | null>(null)

  // 並べ替えドラッグ状態（-1 = リスト末尾へのドロップを示す sentinel）
  const [reorderDragActive,    setReorderDragActive]    = useState(false)
  const [dropIndicatorRowId,   setDropIndicatorRowId]   = useState<number | null>(null)

  const onReorderDragOver = useCallback((e: React.DragEvent, rowId: number | null) => {
    if (!e.dataTransfer.types.includes('application/x-reorder-drag')) return
    e.preventDefault(); e.stopPropagation()
    setDropIndicatorRowId(rowId)
  }, [])

  const onReorderDrop = useCallback((e: React.DragEvent, beforeRowId: number | null) => {
    if (!e.dataTransfer.types.includes('application/x-reorder-drag')) return
    e.preventDefault(); e.stopPropagation()
    const fromRowId = parseInt(e.dataTransfer.getData('application/x-reorder-drag'), 10)
    if (!isNaN(fromRowId) && fromRowId !== beforeRowId) handleReorderRow(fromRowId, beforeRowId)
    setReorderDragActive(false); setDropIndicatorRowId(null)
  }, [handleReorderRow])

  const toggleCollapse = (positionCode: string) =>
    setCollapsedPositions(prev => {
      const next = new Set(prev)
      next.has(positionCode) ? next.delete(positionCode) : next.add(positionCode)
      return next
    })

  // 子を持つポジションコードのセット
  const parentPosCodes = useMemo(() => {
    const set = new Set<string>()
    for (const { row } of entries) {
      if (row.managerPositionCode) set.add(row.managerPositionCode)
    }
    return set
  }, [entries])

  // 折りたたまれたサブツリーを除外したエントリ列（DFS順・skipDepth方式）
  const visibleEntries = useMemo((): PositionEntry[] => {
    const result: PositionEntry[] = []
    let skipDepth: number | null = null
    for (const entry of entries) {
      if (skipDepth !== null) {
        if (entry.depth > skipDepth) continue
        else skipDepth = null
      }
      result.push(entry)
      if (entry.row.positionCode && collapsedPositions.has(entry.row.positionCode)) {
        skipDepth = entry.depth
      }
    }
    return result
  }, [entries, collapsedPositions])

  // 折りたたみ時に隠れているポジション数・人数を集計
  const subtreeStats = useMemo(() => {
    const map = new Map<string, { positions: number; persons: number }>()
    for (const posCode of collapsedPositions) {
      let counting = false
      let parentDepth = -1
      let positions = 0
      let persons = 0
      for (const entry of entries) {
        if (!counting) {
          if (entry.row.positionCode === posCode) { counting = true; parentDepth = entry.depth }
        } else {
          if (entry.depth <= parentDepth) break
          if (entry.row.positionCode) positions++
          if (entry.person) persons++
        }
      }
      map.set(posCode, { positions, persons })
    }
    return map
  }, [entries, collapsedPositions])

  // ルートポジションごとにカラーインデックスを割り当て
  const colorByRowId = useMemo(() => {
    const map = new Map<number, number>()
    let idx = -1
    for (const entry of entries) {
      if (entry.depth === 0) idx++
      map.set(entry.row.rowId, Math.max(0, idx) % PALETTE.length)
    }
    return map
  }, [entries])

  if (visibleEntries.length === 0) return null

  return (
    <div className="space-y-0.5 mb-2">
      {visibleEntries.map(({ row, person, depth }) => {
        const isVacant     = !person
        const badges       = detectPositionPatterns(row, positionContext)
        const isSelected   = !isVacant && (
          isSelectMode ? selectedPersonIds.has(person!.id) : selectedPersonId === person!.id
        )
        const isConcurrent = row.concurrentType === '兼務'
        const hasPosition  = !!row.positionCode
        const hasChildren  = hasPosition && parentPosCodes.has(row.positionCode!)
        const isCollapsed  = hasPosition && collapsedPositions.has(row.positionCode!)
        const palette      = PALETTE[colorByRowId.get(row.rowId) ?? 0]
        const posTitle     = getPositionTitle(row)
        const stats        = isCollapsed && row.positionCode ? subtreeStats.get(row.positionCode) : undefined
        const isPosDropTarget = dragOverPositionRowId === row.rowId

        return (
          <div
            key={row.rowId}
            style={{ paddingLeft: `${depth * 16}px` }}
            className="relative flex items-center gap-0.5 group"
            onDragOver={e => onReorderDragOver(e, row.rowId)}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropIndicatorRowId(null) }}
            onDrop={e => onReorderDrop(e, row.rowId)}
          >
            {/* 並べ替えインジケーター（ここに挿入） */}
            {dropIndicatorRowId === row.rowId && (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400 z-10 rounded pointer-events-none" />
            )}

            {/* ── 並べ替えグリップ ──────────────────────────────────────────── */}
            <div
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('application/x-reorder-drag', String(row.rowId))
                e.dataTransfer.effectAllowed = 'move'
                e.stopPropagation()
                setReorderDragActive(true)
              }}
              onDragEnd={() => { setReorderDragActive(false); setDropIndicatorRowId(null) }}
              title="ドラッグして並べ替え"
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing text-[10px] text-gray-300 hover:text-gray-500 w-3 text-center select-none"
            >⠿</div>

            {/* ── 折りたたみトグル ───────────────────────────────────────────── */}
            <button
              onClick={() => hasChildren && row.positionCode && toggleCollapse(row.positionCode)}
              className={`w-4 flex-shrink-0 text-[10px] text-center leading-none transition-colors ${
                hasChildren
                  ? 'text-gray-400 hover:text-gray-600 cursor-pointer'
                  : 'text-gray-200 cursor-default'
              }`}
            >
              {hasChildren ? (isCollapsed ? '▶' : '▼') : '·'}
            </button>

            {/* 折りたたみ時サブツリー統計バッジ */}
            {stats && (
              <span className="text-[9px] text-gray-400 bg-gray-100 rounded px-1 whitespace-nowrap flex-shrink-0">
                {stats.positions}席 {stats.persons}名
              </span>
            )}

            {/* ── カード本体 ─────────────────────────────────────────────────── */}
            <div className="flex items-stretch flex-1 min-w-0 shadow-sm hover:shadow transition-shadow">

              {/* ポジション部（ドラッグで席ごと移動 / 別ポジションにドロップで上司設定） */}
              {hasPosition && (
                <div
                  draggable
                  onDragStart={e => {
                    const data: DragData = {
                      dragType: 'position',
                      personId: person?.id ?? '',
                      fromOrgId: orgId, fromCompanyId: '',
                      affiliationType: 'primary',
                      fromRowId: row.rowId,
                      rowId:     row.rowId,
                    }
                    e.dataTransfer.setData('application/json', JSON.stringify(data))
                    e.dataTransfer.setData('application/x-position-drag', '')
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragOver={e => {
                    if (!e.dataTransfer.types.includes('application/x-position-drag')) return
                    e.preventDefault(); e.stopPropagation()
                    setDragOverPositionRowId(row.rowId)
                  }}
                  onDragLeave={() => setDragOverPositionRowId(null)}
                  onDrop={e => { setDragOverPositionRowId(null); handleDropPositionOnPosition(e, row.rowId) }}
                  onDoubleClick={e => handleRowDoubleClick(e, row.rowId)}
                  onContextMenu={e => handlePositionContextMenu(e, row.rowId)}
                  title="ダブルクリック：変更メニュー / ドラッグ→別組織に移動 / 別ポジションにドロップ→上司設定"
                  className={`
                    relative flex items-center gap-1 px-2 py-1
                    border border-r-0
                    border-l-4 ${palette.border}
                    rounded-l ${palette.posBg}
                    text-xs text-gray-600 font-medium
                    flex-shrink-0 cursor-grab active:cursor-grabbing
                    transition-all
                    ${isPosDropTarget
                      ? 'border-blue-400 ring-2 ring-blue-300 brightness-90'
                      : 'border-gray-200 hover:brightness-95'
                    }
                  `}
                  style={{ minWidth: '72px', maxWidth: '130px' }}
                >
                  <span className="text-gray-400 text-[9px] select-none flex-shrink-0">⠿</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{posTitle}</div>
                    {!isInternalPosCode(row.positionCode) && (
                      <div className="truncate text-[9px] text-gray-400 leading-tight tabular-nums">
                        {row.positionCode}
                      </div>
                    )}
                  </div>
                  {!isSelectMode && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setConfirmDialog({
                          message: `「${posTitle}」を削除しますか？${row.userId ? '\n在席中の人は未アサイン状態になります。' : ''}`,
                          onConfirm: () => appService.removePosition(row.rowId),
                        })
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      draggable={false}
                      title="このポジション（席）を削除"
                      className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-100 transition-all text-[10px]"
                    >✕</button>
                  )}
                </div>
              )}

              {/* 人部 / 空席ドロップゾーン */}
              {isVacant ? (
                <div
                  className={`
                    flex-1 flex items-center px-2 py-1 text-xs transition-colors
                    ${hasPosition ? 'rounded-r border border-l-0' : `rounded border-l-4 ${palette.border}`}
                    border-dashed
                    ${dragOverVacantRowId === row.rowId
                      ? 'border-blue-400 bg-blue-100 text-blue-600'
                      : 'border-gray-300 text-gray-400 hover:border-blue-300 hover:text-blue-400 hover:bg-blue-50/30'
                    }
                  `}
                  onDragOver={e => {
                    if (!e.dataTransfer.types.includes('application/json')) return
                    e.preventDefault(); e.stopPropagation()
                    setDragOverVacantRowId(row.rowId)
                  }}
                  onDragLeave={() => setDragOverVacantRowId(null)}
                  onDrop={e => { setDragOverVacantRowId(null); handleDropOnVacantSlot(e, row.rowId) }}
                  onDoubleClick={e => handleRowDoubleClick(e, row.rowId)}
                  onContextMenu={e => handlePositionContextMenu(e, row.rowId)}
                >
                  {dragOverVacantRowId === row.rowId ? 'ここにドロップ' : '（空席）← drop'}
                </div>
              ) : (
                <div
                  draggable={!isSelectMode}
                  onDragStart={!isSelectMode ? e => {
                    const data: DragData = {
                      dragType: 'person',
                      personId: person!.id, fromOrgId: orgId, fromCompanyId: '',
                      affiliationType: isConcurrent ? 'concurrent' : 'primary',
                      source: 'after', fromRowId: row.rowId,
                      rowId:   row.rowId,
                    }
                    e.dataTransfer.setData('application/json', JSON.stringify(data))
                    e.dataTransfer.effectAllowed = 'move'
                  } : undefined}
                  onClick={() => isSelectMode ? togglePersonSelection(person!.id) : selectPerson(person!.id)}
                  onDoubleClick={e => !isSelectMode && handleRowDoubleClick(e, row.rowId)}
                  onContextMenu={e => !isSelectMode && handlePersonContextMenu(e, person!.id)}
                  className={`
                    flex-1 flex items-center gap-2 px-2 py-1 text-xs select-none
                    transition-all min-w-0
                    ${hasPosition ? 'rounded-r border border-l-0' : `rounded border-l-4 ${palette.border}`}
                    ${isSelectMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}
                    ${isSelected
                      ? 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-300'
                      : isConcurrent
                      ? 'border-dashed border-purple-300 bg-purple-50'
                      : `border-gray-200 ${palette.personBg}`
                    }
                  `}
                >
                  <div className="flex-1 min-w-0">
                    {/* 名前 + バッジ */}
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-semibold text-gray-800 leading-tight truncate">{person!.name}</span>
                      {badges.map(b => (
                        <span key={b.kind} className={`flex-shrink-0 text-[9px] font-medium px-1 py-0.5 rounded ${b.color}`}>{b.label}</span>
                      ))}
                    </div>
                    {/* グループ + ユーザーID（固定） */}
                    {(row.group || row.userId) && (
                      <div className="flex items-center gap-1.5 text-[9px] text-gray-400 leading-tight">
                        {row.group && <span className="truncate">{row.group}</span>}
                        {row.userId && <span className="tabular-nums flex-shrink-0">{row.userId}</span>}
                      </div>
                    )}
                    {/* 選択可能フィールド（変更前後の差分付き） */}
                    <CanvasFieldDiff row={row} displayFields={displayFields} isConcurrent={isConcurrent} />
                  </div>
                  {!isSelectMode && hasPosition && (
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        setConfirmDialog({
                          message: `${person!.name} をポジションから外しますか？\n人は未アサイン状態になります。`,
                          onConfirm: () => appService.unassignPersonFromPosition(row.rowId),
                        })
                      }}
                      className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all text-[10px]"
                      title="この人を席から外す（空席化）"
                    >×</button>
                  )}
                  {isSelectMode && (
                    <span className={`ml-1 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                      isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-400'
                    }`}>{isSelected ? '✓' : ''}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
      {/* 末尾ドロップゾーン：ドラッグ中のみ表示 */}
      {reorderDragActive && (
        <div
          className={`h-5 mx-1 rounded border-2 border-dashed flex items-center justify-center text-[9px] transition-colors ${
            dropIndicatorRowId === null
              ? 'border-blue-400 bg-blue-50 text-blue-400'
              : 'border-gray-200 text-gray-300'
          }`}
          onDragOver={e => onReorderDragOver(e, null)}
          onDragLeave={() => setDropIndicatorRowId(null)}
          onDrop={e => onReorderDrop(e, null)}
        >末尾へ</div>
      )}
    </div>
  )
}
