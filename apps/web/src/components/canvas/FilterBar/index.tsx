import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { Organization }   from '@personnel/domain/schemas'
import type { OrgMasterEntry } from '@personnel/domain/masters/orgMaster'
import { findSecondmentOrgCode } from '@personnel/domain/commands/helpers'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import { useOrgView }           from '../OrgViewContext'
import { FilterCardEditor }     from './FilterCardEditor'
import { computeLca, buildSubtreeMap } from './filterLogic'
import {
  cardIsEmpty, makeFilterCard, makeFilterRule,
  type FilterCard,
} from './types'

// ── チップラベル ──────────────────────────────────────────────────────────

function cardSummary(card: FilterCard, afterOrgs: Organization[]): string {
  const active = card.rules.filter(r => r.values.length > 0 || r.subtree)

  if (active.length === 0) return '空フィルタ'

  // 単一ルールで配下フラグあり → 組織名を強調表示
  if (active.length === 1) {
    const r = active[0]
    const suffix = r.subtree ? '以下' : ''
    if (r.values.length === 1) {
      // orgName/in で組織名が1件 → そのまま表示
      if (r.field === 'orgName' && (r.operator === 'in' || r.operator === 'contains')) {
        const name = r.values[0]
        const short = name.length > 10 ? name.slice(0, 10) + '…' : name
        return suffix ? `${short}${suffix}` : `含む "${short}"`
      }
      const v  = r.values[0].length > 8 ? r.values[0].slice(0, 8) + '…' : r.values[0]
      const op = (r.operator === 'contains' || r.operator === 'in') ? '含む' : '除く'
      return `${op} "${v}"${suffix}`
    }
    if (r.values.length > 1) {
      const op = (r.operator === 'not-in' || r.operator === 'not-contains') ? '除く' : ''
      return `${op}${r.values.length}件${suffix}`.trim()
    }
    // values 空で subtree のみ
    if (r.subtree) {
      const org = afterOrgs.find(o => o.name === r.values[0])
      return org ? `${org.name}以下` : '配下'
    }
  }

  return `${active.length}条件`
}

// ── 各チップ ──────────────────────────────────────────────────────────────

interface ChipProps {
  card:             FilterCard
  orgMasterEntries: OrgMasterEntry[]
  afterOrgs:        Organization[]
  onUpdate:         (c: FilterCard) => void
  onRemove:         () => void
  autoOpen?:        boolean
  onAutoOpenDone?:  () => void
}

function FilterChip({
  card, orgMasterEntries, afterOrgs, onUpdate, onRemove, autoOpen, onAutoOpenDone,
}: ChipProps) {
  const [open,  setOpen]  = useState(false)
  const [pos,   setPos]   = useState<{ top: number; left: number } | null>(null)
  const [draft, setDraft] = useState<FilterCard>(card)
  const chipRef    = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (chipRef.current?.contains(e.target as Node))    return
      if (popoverRef.current?.contains(e.target as Node)) return
      setDraft(card)
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, card])

  useLayoutEffect(() => {
    if (!autoOpen) return
    const rect = chipRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
    setDraft(card)
    setOpen(true)
    onAutoOpenDone?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openEditor = () => {
    const rect = chipRef.current?.getBoundingClientRect()
    if (rect) setPos({ top: rect.bottom + 4, left: rect.left })
    setDraft(card)
    setOpen(true)
  }

  const handleToggle = () => { if (open) { setDraft(card); setOpen(false) } else openEditor() }
  const handleSave   = () => { onUpdate(draft); setOpen(false) }
  const handleCancel = () => { setDraft(card); setOpen(false) }

  const label   = cardSummary(card, afterOrgs)
  const isEmpty = cardIsEmpty(card)

  return (
    <div ref={chipRef} className="flex-shrink-0">
      <span
        onDoubleClick={handleToggle}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] leading-5 cursor-default select-none ${
          isEmpty
            ? 'bg-gray-100 text-gray-400 border border-dashed border-gray-300'
            : 'bg-blue-100 text-blue-700 border border-blue-200'
        }`}
        title="ダブルクリックで編集"
      >
        {label}
        <button onMouseDown={e => e.stopPropagation()} onClick={handleToggle}
          className="text-blue-400 hover:text-blue-700 px-0.5 leading-none" title="編集">✎</button>
        <button onMouseDown={e => e.stopPropagation()} onClick={onRemove}
          className="text-blue-400 hover:text-red-500 font-bold leading-none">×</button>
      </span>

      {open && pos && createPortal(
        <div ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl z-[9999]"
        >
          <FilterCardEditor
            card={draft}
            orgMasterEntries={orgMasterEntries}
            afterOrgs={afterOrgs}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={handleCancel}
            onRemove={() => { onRemove(); setOpen(false) }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
}

// ── FilterBar 本体 ────────────────────────────────────────────────────────

export function FilterBar() {
  const {
    panels, filterCards,
    addFilterCard, updateFilterCard, removeFilterCard, resetFilters,
  } = useCanvasLayoutStore()

  const { masters, afterOrganizations } = useStore()
  const { positionTreeByOrgId, afterMembersByOrgId } = useOrgView()
  const orgMasterEntries = masters.orgMasterEntries

  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null)
  const [warnMsg,       setWarnMsg]       = useState<string | null>(null)

  const showWarn = (msg: string) => {
    setWarnMsg(msg)
    setTimeout(() => setWarnMsg(null), 4000)
  }

  const memberOrgIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [orgId, pos] of positionTreeByOrgId) {
      if (pos.length > 0) ids.add(orgId)
    }
    for (const [orgId, members] of afterMembersByOrgId) {
      if (members.length > 0) ids.add(orgId)
    }
    return ids
  }, [positionTreeByOrgId, afterMembersByOrgId])

  const subtreeMap = useMemo(
    () => buildSubtreeMap(afterOrganizations),
    [afterOrganizations],
  )

  // ── 自動設定 ─────────────────────────────────────────────────────────────
  const handleAutoSetup = () => {
    const memberPanelOrgIds = panels.map(p => p.orgId).filter(id => memberOrgIds.has(id))

    if (memberPanelOrgIds.length === 0) {
      showWarn('キャンバス上に人・ポジションが割り当てられた組織がありません。フィルタをクリアしました。')
      resetFilters()
      return
    }

    const orgById = new Map(afterOrganizations.map(o => [o.id, o]))
    const lcaId   = computeLca(memberPanelOrgIds, orgById)
    if (!lcaId) { resetFilters(); return }

    const lcaOrg = afterOrganizations.find(o => o.id === lcaId)
    if (!lcaOrg?.name) { resetFilters(); return }

    // メインカード: LCA 以下
    const lcaCard = makeFilterCard({
      rules: [makeFilterRule({ field: 'orgName', operator: 'in', values: [lcaOrg.name], subtree: true })],
    })

    // LCA サブツリーに含まれない出向者用組織を探す
    const lcaSubtree = subtreeMap.get(lcaId) ?? new Set<string>()
    const extraSecondmentNames = new Set<string>()

    for (const orgId of memberPanelOrgIds) {
      const org = afterOrganizations.find(o => o.id === orgId)
      if (!org?.externalCode) continue
      const sCode = findSecondmentOrgCode(org.externalCode, afterOrganizations, masters)
      if (!sCode) continue
      const sOrg = afterOrganizations.find(o => o.externalCode === sCode)
      if (sOrg?.name && !lcaSubtree.has(sOrg.id)) extraSecondmentNames.add(sOrg.name)
    }

    resetFilters()
    addFilterCard(lcaCard)
    if (extraSecondmentNames.size > 0) {
      addFilterCard(makeFilterCard({
        rules: [makeFilterRule({ field: 'orgName', operator: 'in', values: [...extraSecondmentNames], subtree: true })],
      }))
    }
  }

  const activeCards = filterCards.filter(c => !cardIsEmpty(c))
  const badgeCount  = activeCards.length

  const handleAddCard = () => {
    const card = makeFilterCard()
    addFilterCard(card)
    setPendingOpenId(card.id)
  }

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 select-none">
      <div className="flex items-center gap-2 px-3 h-9 overflow-x-auto">

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

        <button
          onClick={handleAutoSetup}
          className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="人・ポジションがある組織の最小範囲を自動計算してフィルタをセット"
        >
          自動設定
        </button>

        {badgeCount > 0 && (
          <button
            onClick={resetFilters}
            className="flex-shrink-0 px-2 py-0.5 rounded text-[11px] border border-gray-200 text-gray-400 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            全クリア
          </button>
        )}

        <div className="w-px h-4 bg-gray-300 flex-shrink-0" />

        {filterCards.map(card => (
          <FilterChip
            key={card.id}
            card={card}
            orgMasterEntries={orgMasterEntries}
            afterOrgs={afterOrganizations}
            onUpdate={updated => updateFilterCard(card.id, updated)}
            onRemove={() => removeFilterCard(card.id)}
            autoOpen={card.id === pendingOpenId}
            onAutoOpenDone={() => setPendingOpenId(null)}
          />
        ))}

        <button
          onClick={handleAddCard}
          className="text-[11px] text-blue-500 hover:text-blue-700 flex-shrink-0 transition-colors px-1"
        >＋ カード追加</button>

      </div>

      {warnMsg && (
        <div className="px-3 py-1 text-[11px] text-amber-700 bg-amber-50 border-t border-amber-100">
          {warnMsg}
        </div>
      )}
    </div>
  )
}
