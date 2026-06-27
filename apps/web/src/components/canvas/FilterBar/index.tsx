import { useState, useEffect, useRef } from 'react'
import type { OrgMasterEntry } from '@personnel/domain/masters/orgMaster'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useStore } from '../../../store/useStore'
import { FilterCardEditor } from './FilterCardEditor'
import { PATH_FIELDS, cardIsEmpty, type FilterCard } from './types'

function cardSummary(card: FilterCard, orgById: Map<string, string>): string {
  const pathParts = PATH_FIELDS
    .filter(f => card[f].length > 0)
    .map(f => card[f].join(', '))
  const subtreeParts = card.subtreeOrgIds.map(id => orgById.get(id) ?? id).map(n => `配下:${n}`)
  return [...subtreeParts, ...pathParts].join(' / ') || '空フィルタ'
}

// ── 各チップのポップオーバー ──────────────────────────────────────────────

interface ChipProps {
  card:             FilterCard
  orgById:          Map<string, string>
  orgMasterEntries: OrgMasterEntry[]
  onUpdate:         (c: FilterCard) => void
  onRemove:         () => void
}

function FilterChip({ card, orgById, orgMasterEntries, onUpdate, onRemove }: ChipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const label = cardSummary(card, orgById)
  const isEmpty = cardIsEmpty(card)

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {/* チップ本体: ダブルクリックで編集 */}
      <span
        onDoubleClick={() => setOpen(v => !v)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] leading-5 cursor-default select-none ${
          isEmpty
            ? 'bg-gray-100 text-gray-400 border border-dashed border-gray-300'
            : 'bg-blue-100 text-blue-700 border border-blue-200'
        }`}
        title="ダブルクリックで編集"
      >
        {label}
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setOpen(v => !v)}
          className="text-blue-400 hover:text-blue-700 px-0.5 leading-none"
          title="編集"
        >✎</button>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={onRemove}
          className="text-blue-400 hover:text-red-500 font-bold leading-none"
        >×</button>
      </span>

      {/* ポップオーバー（FilterBar の直下に float） */}
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[280px]">
          <FilterCardEditor
            card={card}
            orgMasterEntries={orgMasterEntries}
            onChange={onUpdate}
            onRemove={() => { onRemove(); setOpen(false) }}
          />
        </div>
      )}
    </div>
  )
}

// ── FilterBar 本体 ────────────────────────────────────────────────────────

export function FilterBar() {
  const {
    filterCards, globalFilters,
    addFilterCard, updateFilterCard, removeFilterCard,
    updateGlobalFilters, resetFilters,
  } = useCanvasLayoutStore()

  const { masters, afterOrganizations } = useStore()
  const orgMasterEntries = masters.orgMasterEntries

  // org ID → name マップ（チップ表示用）
  const orgById = new Map(afterOrganizations.map(o => [o.id, o.name ?? o.id]))

  const activeCards  = filterCards.filter(c => !cardIsEmpty(c))
  const badgeCount   = activeCards.length
    + (globalFilters.includeRelatedSecondmentOrgs ? 1 : 0)
    + (!globalFilters.hasMembers ? 1 : 0)

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 select-none relative">
      <div className="flex items-center gap-2 px-3 h-9 overflow-x-auto">

        {/* フィルタラベル + バッジ */}
        <div className={`flex items-center gap-1 flex-shrink-0 text-[11px] font-medium ${
          badgeCount > 0 ? 'text-blue-600' : 'text-gray-500'
        }`}>
          <span>⊟ フィルタ</span>
          {badgeCount > 0 && (
            <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {badgeCount}
            </span>
          )}
        </div>

        <div className="w-px h-4 bg-gray-300 flex-shrink-0" />

        {/* 人・ポジションあり */}
        <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={globalFilters.hasMembers}
            onChange={e => updateGlobalFilters({ hasMembers: e.target.checked })}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          <span className="text-[11px] text-gray-600">人・ポジションあり</span>
        </label>

        {/* 出向組織含む */}
        <label className="flex items-center gap-1 cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={globalFilters.includeRelatedSecondmentOrgs}
            onChange={e => updateGlobalFilters({ includeRelatedSecondmentOrgs: e.target.checked })}
            className="w-3.5 h-3.5 accent-blue-600"
          />
          <span className="text-[11px] text-gray-600">出向組織含む</span>
        </label>

        <div className="w-px h-4 bg-gray-300 flex-shrink-0" />

        {/* フィルタカード チップ */}
        {filterCards.map(card => (
          <FilterChip
            key={card.id}
            card={card}
            orgById={orgById}
            orgMasterEntries={orgMasterEntries}
            onUpdate={updated => updateFilterCard(card.id, updated)}
            onRemove={() => removeFilterCard(card.id)}
          />
        ))}

        {/* ＋ カード追加 */}
        <button
          onClick={() => addFilterCard()}
          className="text-[11px] text-blue-500 hover:text-blue-700 flex-shrink-0 transition-colors px-1"
        >＋ カード追加</button>

        {badgeCount > 0 && (
          <button
            onClick={resetFilters}
            className="text-[11px] text-gray-400 hover:text-red-500 flex-shrink-0 transition-colors"
          >リセット</button>
        )}
      </div>
    </div>
  )
}
