import { useState } from 'react'
import { useStore } from '../store/useStore'

const BAND_ORDER  = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']
const TITLE_ORDER = [
  '代表取締役社長', '代表取締役', '取締役', '社長', '副社長', '専務取締役', '専務', '常務取締役', '常務',
  '本部長', '副本部長', '部長', '副部長', '課長', '副課長', '係長', '主任', '担当', '',
]

type SortMode     = 'band' | 'title' | 'manual'
type CanvasMode   = '組織図' | 'レポートライン'
type ViewState    = 'after' | 'after-diff' | 'before'

interface DragData {
  personId: string
  fromOrgId: string
  fromCompanyId: string
  affiliationType: 'primary' | 'concurrent'
  source?: 'before' | 'after'
}

interface OrgBoxProps        { orgId: string; depth?: number }
interface CollapsedOrgChipProps { orgId: string }

const ORG_PALETTE = [
  { card: 'bg-blue-50 border-blue-200',     tag: 'bg-blue-100 text-blue-700',     text: 'text-blue-800' },
  { card: 'bg-green-50 border-green-200',   tag: 'bg-green-100 text-green-700',   text: 'text-green-800' },
  { card: 'bg-purple-50 border-purple-200', tag: 'bg-purple-100 text-purple-700', text: 'text-purple-800' },
  { card: 'bg-amber-50 border-amber-200',   tag: 'bg-amber-100 text-amber-700',   text: 'text-amber-800' },
  { card: 'bg-cyan-50 border-cyan-200',     tag: 'bg-cyan-100 text-cyan-700',     text: 'text-cyan-800' },
  { card: 'bg-rose-50 border-rose-200',     tag: 'bg-rose-100 text-rose-700',     text: 'text-rose-800' },
  { card: 'bg-teal-50 border-teal-200',     tag: 'bg-teal-100 text-teal-700',     text: 'text-teal-800' },
  { card: 'bg-orange-50 border-orange-200', tag: 'bg-orange-100 text-orange-700', text: 'text-orange-800' },
]

export function OrgOperationView() {
  const store = useStore()
  const {
    focusedOrgId, focusOrg,
    afterOrganizations: allAfterOrgs, organizations: staticOrgs, persons,
    afterPositions, afterAffiliations,
    beforePositions, beforeAffiliations,
    operations, confirmedNoChangeKeys,
    effectiveDate, addOperation, confirmNoChange,
    selectedPersonId, selectPerson,
  } = store

  const [dragOverOrgId, setDragOverOrgId]       = useState<string | null>(null)
  const [highlightedOrgId, setHighlightedOrgId] = useState<string | null>(null)
  const [expandedChipIds, setExpandedChipIds]   = useState<Set<string>>(new Set())
  const [canvasMode, setCanvasMode]             = useState<CanvasMode>('組織図')
  const [viewState, setViewState]               = useState<ViewState>('after')
  const [orgSortModes, setOrgSortModes]         = useState<Record<string, SortMode>>({})
  const [orgManualOrders, setOrgManualOrders]   = useState<Record<string, string[]>>({})
  const [reorderDropTarget, setReorderDropTarget] = useState<{ orgId: string; beforePersonId: string | null } | null>(null)
  const [openSortDropdown, setOpenSortDropdown] = useState<string | null>(null)

  // Derive data based on viewState
  const isBefore  = viewState === 'before'
  const isAfterDiff = viewState === 'after-diff'
  const viewAffs  = isBefore ? beforeAffiliations : afterAffiliations
  const viewPos   = isBefore ? beforePositions    : afterPositions
  // Navigation orgs: before uses static (includes soon-abolished), after uses derived (excludes abandoned)
  const organizations = isBefore ? staticOrgs : allAfterOrgs.filter(o => !o.isAbandoned)

  if (!focusedOrgId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        ← 左の組織ツリーから組織を選択してください
      </div>
    )
  }

  const focusedOrg = organizations.find(o => o.id === focusedOrgId)

  // Handle case: focused on a new org that doesn't exist in before state
  if (!focusedOrg && isBefore) {
    const afterOrg = allAfterOrgs.find(o => o.id === focusedOrgId)
    const parentId = afterOrg?.parentId
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
        <div className="text-4xl">🆕</div>
        <div className="text-sm font-medium">「{afterOrg?.name ?? focusedOrgId}」は発令後に新設された組織です</div>
        <div className="text-xs text-gray-400">発令前の状態では存在しません</div>
        {parentId && (
          <button onClick={() => focusOrg(parentId)} className="text-xs text-blue-600 hover:underline">← 上の組織へ移動</button>
        )}
      </div>
    )
  }

  if (!focusedOrg) return null

  const buildBreadcrumb = (orgId: string): Array<{ id: string; name: string }> => {
    const path: Array<{ id: string; name: string }> = []
    let current = organizations.find(o => o.id === orgId)
    while (current) {
      path.unshift({ id: current.id, name: current.name })
      current = current.parentId ? organizations.find(o => o.id === current!.parentId) : undefined
    }
    return path
  }

  const breadcrumb = buildBreadcrumb(focusedOrgId)
  const parentOrg  = focusedOrg.parentId ? organizations.find(o => o.id === focusedOrg.parentId) : null
  const childOrgs  = organizations.filter(o => o.parentId === focusedOrgId)

  const getPersonsInOrg = (orgId: string) =>
    viewAffs
      .filter(a => a.status === 'active' && viewPos.find(p => p.id === a.positionId)?.orgId === orgId)
      .map(a => ({
        aff:    a,
        person: persons.find(p => p.id === a.personId),
        pos:    viewPos.find(p => p.id === a.positionId),
      }))
      .filter((x): x is { aff: typeof x.aff; person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos> } =>
        x.person != null && x.pos != null
      )

  // Origin org name (shown in after view to indicate where person came from)
  const getBeforeOrgName = (personId: string, currentOrgId: string): string | null => {
    if (isBefore) return null
    const bAff = beforeAffiliations.find(a => {
      if (a.personId !== personId || a.status !== 'active') return false
      const pos = beforePositions.find(p => p.id === a.positionId)
      return pos != null && pos.orgId !== currentOrgId
    })
    if (!bAff) return null
    const bPos = beforePositions.find(p => p.id === bAff.positionId)
    return bPos ? (staticOrgs.find(o => o.id === bPos.orgId)?.name ?? null) : null
  }

  // Departed persons (for diff view)
  const getDepartedPersons = (orgId: string) => {
    if (!isAfterDiff) return []
    return beforeAffiliations
      .filter(a => a.status === 'active' && beforePositions.find(p => p.id === a.positionId)?.orgId === orgId)
      .filter(a => !afterAffiliations.some(aa =>
        aa.personId === a.personId && aa.status === 'active' &&
        afterPositions.find(p => p.id === aa.positionId)?.orgId === orgId
      ))
      .map(a => {
        const person   = persons.find(p => p.id === a.personId)
        const pos      = beforePositions.find(p => p.id === a.positionId)
        const afterAff = afterAffiliations.find(aa => aa.personId === a.personId && aa.status === 'active')
        const afterPos = afterAff ? afterPositions.find(p => p.id === afterAff.positionId) : null
        const afterOrg = afterPos ? allAfterOrgs.find(o => o.id === afterPos.orgId) : null
        return { person, pos, afterOrg }
      })
      .filter((x): x is { person: NonNullable<typeof x.person>; pos: NonNullable<typeof x.pos>; afterOrg: typeof x.afterOrg } =>
        x.person != null && x.pos != null
      )
  }

  // Confirmation status (for before view)
  const getConfirmStatus = (personId: string, companyId: string): 'changed' | 'no-change' | 'unconfirmed' => {
    const hasOp = operations.some(o =>
      o.params.personId === personId && (
        (o.kind === 'MoveToOrg'            && o.params.companyId === companyId) ||
        (o.kind === 'Promote'              && o.params.companyId === companyId) ||
        (o.kind === 'RecallFromSecondment' && o.params.companyId === companyId) ||
         o.kind === 'SendOnSecondment'
      )
    )
    if (hasOp) return 'changed'
    if (confirmedNoChangeKeys.has(`${personId}_${companyId}`)) return 'no-change'
    return 'unconfirmed'
  }

  // ── Sort helpers ───────────────────────────────────────────────
  const getSortedPersons = (orgId: string, list: ReturnType<typeof getPersonsInOrg>, overrideOrders?: Record<string, string[]>) => {
    const mode = orgSortModes[orgId] ?? 'band'
    if (mode === 'band') return [...list].sort((a, b) => BAND_ORDER.indexOf(b.pos.band ?? 'B4') - BAND_ORDER.indexOf(a.pos.band ?? 'B4'))
    if (mode === 'title') {
      return [...list].sort((a, b) => {
        const ai = TITLE_ORDER.indexOf(a.pos.title ?? ''); const bi = TITLE_ORDER.indexOf(b.pos.title ?? '')
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    }
    const orders = overrideOrders ?? orgManualOrders
    const order  = orders[orgId]
    if (!order) return list
    const byId   = new Map(list.map(p => [p.person.id, p]))
    return [...order.map(id => byId.get(id)).filter((x): x is NonNullable<typeof x> => x != null), ...list.filter(p => !order.includes(p.person.id))]
  }

  const setSortMode = (orgId: string, mode: SortMode) => {
    if (mode === 'manual') {
      const sorted = getSortedPersons(orgId, getPersonsInOrg(orgId))
      setOrgManualOrders(prev => ({ ...prev, [orgId]: sorted.map(p => p.person.id) }))
    }
    setOrgSortModes(prev => ({ ...prev, [orgId]: mode }))
    setOpenSortDropdown(null)
  }

  const doReorder = (orgId: string, beforePersonId: string | null, draggedPersonId: string) => {
    setOrgManualOrders(prev => {
      const sorted   = getSortedPersons(orgId, getPersonsInOrg(orgId), prev)
      const order    = sorted.map(p => p.person.id)
      const filtered = order.filter(id => id !== draggedPersonId)
      const idx      = beforePersonId !== null ? filtered.indexOf(beforePersonId) : filtered.length
      filtered.splice(idx >= 0 ? idx : filtered.length, 0, draggedPersonId)
      return { ...prev, [orgId]: filtered }
    })
  }

  // ── Drag handlers ──────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, personId: string, fromOrgId: string, fromCompanyId: string, affiliationType: 'primary' | 'concurrent') => {
    const data: DragData = { personId, fromOrgId, fromCompanyId, affiliationType, source: 'after' }
    e.dataTransfer.setData('application/json', JSON.stringify(data))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragOver = (e: React.DragEvent, orgId: string) => {
    if (isBefore || !e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
    setDragOverOrgId(orgId)
  }

  const handleDragLeave = () => setDragOverOrgId(null)

  const handleDrop = (e: React.DragEvent, toOrgId: string) => {
    if (isBefore) return
    e.preventDefault(); setDragOverOrgId(null)
    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
    const { personId, fromOrgId, fromCompanyId, affiliationType, source } = data

    if (affiliationType === 'concurrent' && !e.altKey && fromOrgId !== toOrgId) {
      const toOrg = organizations.find(o => o.id === toOrgId); if (!toOrg) return
      const ca = afterAffiliations.find(a => a.personId === personId && a.status === 'active' && a.type === 'concurrent' && afterPositions.find(p => p.id === a.positionId)?.orgId === fromOrgId)
      const cp = ca ? afterPositions.find(p => p.id === ca.positionId) : null
      const pn = persons.find(p => p.id === personId)?.name ?? personId
      addOperation({ kind: 'RemoveConcurrent', label: `兼務解除：${pn}`, params: { personId, orgId: fromOrgId }, effectiveDate })
      addOperation({ kind: 'AddConcurrent', label: `兼務先変更：${toOrg.name} (${pn})`, params: { personId, orgId: toOrgId, companyId: toOrg.companyId, band: cp?.band ?? 'B4', title: cp?.title ?? '兼務' }, effectiveDate })
      setHighlightedOrgId(toOrgId); setTimeout(() => setHighlightedOrgId(null), 800); return
    }
    if (fromOrgId === toOrgId && !e.altKey) {
      if (source === 'before') confirmNoChange(personId, fromCompanyId)
      return
    }
    const toOrg = organizations.find(o => o.id === toOrgId); if (!toOrg) return
    const toCompanyId = toOrg.companyId
    const currentAff = affiliationType === 'concurrent'
      ? afterAffiliations.find(a => a.personId === personId && a.status === 'active' && a.type === 'concurrent' && afterPositions.find(p => p.id === a.positionId)?.orgId === fromOrgId)
      : afterAffiliations.find(a => a.personId === personId && a.status === 'active' && a.type === 'primary' && afterPositions.find(p => p.id === a.positionId)?.companyId === fromCompanyId)
    const currentPos = currentAff ? afterPositions.find(p => p.id === currentAff.positionId) : null
    const band   = currentPos?.band ?? 'B4'
    const title  = currentPos?.title ?? '担当'
    const pn     = persons.find(p => p.id === personId)?.name ?? personId
    if (e.altKey) {
      addOperation({ kind: 'AddConcurrent', label: `兼務追加：${toOrg.name} (${pn})`, params: { personId, orgId: toOrgId, companyId: toCompanyId, band, title }, effectiveDate })
    } else if (fromCompanyId !== toCompanyId) {
      addOperation({ kind: 'SendOnSecondment', label: `出向：${toOrg.name} (${pn})`, params: { personId, toCompanyId, orgId: toOrgId, band, title }, effectiveDate })
    } else {
      addOperation({ kind: 'MoveToOrg', label: `組織異動：${toOrg.name} (${pn})`, params: { personId, toOrgId, companyId: fromCompanyId, band, title }, effectiveDate })
    }
    setHighlightedOrgId(toOrgId); setTimeout(() => setHighlightedOrgId(null), 800)
  }

  // ── Sort button ────────────────────────────────────────────────
  const renderSortButton = (orgId: string) => {
    if (isBefore) return null
    const mode  = orgSortModes[orgId] ?? 'band'
    const label = mode === 'band' ? 'B↓' : mode === 'title' ? '役↓' : '⠿'
    return (
      <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={e => { e.stopPropagation(); setOpenSortDropdown(prev => prev === orgId ? null : orgId) }}
          className={`text-xs px-1 rounded ${mode === 'manual' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}>
          {label}
        </button>
        {openSortDropdown === orgId && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpenSortDropdown(null)} />
            <div className="absolute right-0 top-full mt-0.5 z-20 bg-white border border-gray-200 rounded shadow-lg min-w-20 py-0.5">
              {(['band', 'title', 'manual'] as SortMode[]).map(m => (
                <button key={m} onClick={() => setSortMode(orgId, m)}
                  className={`w-full text-left px-2 py-1 text-xs hover:bg-gray-50 ${mode === m ? 'font-semibold text-blue-600' : 'text-gray-700'}`}>
                  {m === 'band' ? 'バンド順' : m === 'title' ? '役職順' : '手動'}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Person cards ───────────────────────────────────────────────
  const renderPersonCards = (orgId: string, companyId: string) => {
    const list     = getPersonsInOrg(orgId)
    if (list.length === 0) return null
    const sortMode = orgSortModes[orgId] ?? 'band'
    const sorted   = getSortedPersons(orgId, list)

    const cardBg = (isConcurrent: boolean, isSelected: boolean, status?: 'changed' | 'no-change' | 'unconfirmed') => {
      if (isBefore && status) {
        const statusBg = { unconfirmed: 'bg-amber-50 border-amber-300', 'no-change': 'bg-gray-100 border-gray-300', changed: 'bg-blue-50 border-blue-300' }
        return `${statusBg[status]} ${isConcurrent ? 'border-dashed' : ''} ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`
      }
      return `${isConcurrent ? 'border-dashed border-purple-400 bg-purple-50' : 'border-blue-300 bg-blue-50'} ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`
    }

    const cardInner = (person: { name: string }, pos: { title?: string; band?: string }, isConcurrent: boolean, fromOrgName: string | null, status?: 'changed' | 'no-change' | 'unconfirmed') => (
      <>
        {isBefore && status && (
          <span className={`absolute -top-1 -right-1 text-xs leading-none ${
            status === 'unconfirmed' ? 'text-amber-500' : status === 'no-change' ? 'text-green-500' : 'text-blue-500'
          }`}>
            {status === 'unconfirmed' ? '⚠' : status === 'no-change' ? '✓' : '→'}
          </span>
        )}
        {fromOrgName && <div className="text-gray-400 text-xs leading-tight mb-0.5">← {fromOrgName}</div>}
        <div className="font-semibold text-gray-800 leading-tight">{person.name}</div>
        <div className="text-gray-500 leading-tight">
          {pos.title}
          {pos.band && <span className={`ml-1 font-medium ${isBefore ? 'text-gray-600' : isConcurrent ? 'text-purple-600' : 'text-blue-600'}`}>{pos.band}</span>}
        </div>
        {isConcurrent && <div className="text-purple-600 text-xs leading-tight">兼務</div>}
      </>
    )

    if (!isBefore && sortMode === 'manual') {
      return (
        <div className="flex flex-col gap-1 mb-2">
          {sorted.map(({ aff, person, pos }) => {
            const isConcurrent = aff.type === 'concurrent'
            const isSelected   = selectedPersonId === person.id
            const fromOrgName  = getBeforeOrgName(person.id, orgId)
            const isDropBefore = reorderDropTarget?.orgId === orgId && reorderDropTarget.beforePersonId === person.id
            return (
              <div key={aff.id}>
                {isDropBefore && <div className="h-0.5 bg-blue-400 rounded mb-0.5 mx-1" />}
                <div
                  draggable
                  onDragStart={e => handleDragStart(e, person.id, orgId, companyId, aff.type)}
                  onDragOver={e => { if (!e.dataTransfer.types.includes('application/json')) return; e.preventDefault(); e.stopPropagation(); setReorderDropTarget({ orgId, beforePersonId: person.id }) }}
                  onDrop={e => { e.stopPropagation(); setReorderDropTarget(null); let d: DragData; try { d = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }; if (d.fromOrgId === orgId && !e.altKey) { e.preventDefault(); doReorder(orgId, person.id, d.personId) } else { handleDrop(e, orgId) } }}
                  onClick={() => selectPerson(person.id)}
                  className={`relative px-2.5 py-1.5 rounded text-xs select-none cursor-grab active:cursor-grabbing transition-all hover:shadow-md border-2 ${cardBg(isConcurrent, isSelected)}`}
                >
                  {cardInner(person, pos, isConcurrent, fromOrgName)}
                </div>
              </div>
            )
          })}
          <div
            className={`h-1 rounded mx-1 transition-colors ${reorderDropTarget?.orgId === orgId && reorderDropTarget.beforePersonId === null ? 'bg-blue-400' : ''}`}
            onDragOver={e => { if (!e.dataTransfer.types.includes('application/json')) return; e.preventDefault(); e.stopPropagation(); setReorderDropTarget({ orgId, beforePersonId: null }) }}
            onDrop={e => { e.stopPropagation(); setReorderDropTarget(null); let d: DragData; try { d = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }; if (d.fromOrgId === orgId && !e.altKey) { e.preventDefault(); doReorder(orgId, null, d.personId) } else { handleDrop(e, orgId) } }}
          />
        </div>
      )
    }

    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {sorted.map(({ aff, person, pos }) => {
          const isConcurrent = aff.type === 'concurrent'
          const isSelected   = selectedPersonId === person.id
          const fromOrgName  = getBeforeOrgName(person.id, orgId)
          const status       = isBefore ? getConfirmStatus(person.id, companyId) : undefined
          return (
            <div
              key={aff.id}
              draggable={!isBefore}
              onDragStart={!isBefore ? e => handleDragStart(e, person.id, orgId, companyId, aff.type) : undefined}
              onClick={() => selectPerson(person.id)}
              className={`relative px-2.5 py-1.5 rounded text-xs select-none transition-all hover:shadow-md border-2 ${
                !isBefore ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
              } ${cardBg(isConcurrent, isSelected, status)}`}
            >
              {cardInner(person, pos, isConcurrent, fromOrgName, status)}
            </div>
          )
        })}
      </div>
    )
  }

  const renderDepartedCards = (orgId: string) => {
    const departed = getDepartedPersons(orgId)
    if (departed.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {departed.map(({ person, pos, afterOrg }) => (
          <div key={person.id} className="px-2.5 py-1.5 rounded text-xs border-2 border-dashed border-red-300 bg-red-50 opacity-70 select-none">
            <div className="font-semibold text-gray-400 line-through leading-tight">{person.name}</div>
            <div className="text-gray-400 leading-tight">{pos.title}{pos.band && <span className="ml-1">{pos.band}</span>}</div>
            {afterOrg && <div className="text-red-500 text-xs leading-tight">→ {afterOrg.name}</div>}
          </div>
        ))}
      </div>
    )
  }

  const renderDropZone = (orgId: string, compact = false) => {
    if (isBefore) return null
    return (
      <div className={`${compact ? 'min-h-6 py-1' : 'min-h-8 py-1.5'} rounded border border-dashed text-xs text-center transition-colors ${
        dragOverOrgId === orgId ? 'border-blue-400 bg-blue-100 text-blue-600' : 'border-gray-300 text-gray-300'
      }`}>
        {dragOverOrgId === orgId ? 'ここにドロップ' : getPersonsInOrg(orgId).length === 0 && !compact ? 'ドロップで異動' : ''}
      </div>
    )
  }

  // ── CollapsedOrgChip ───────────────────────────────────────────
  const CollapsedOrgChip = ({ orgId }: CollapsedOrgChipProps) => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return null
    const personsInOrg = getPersonsInOrg(orgId)
    const childOrgIds  = organizations.filter(o => o.parentId === orgId).map(o => o.id)
    const isDragOver   = dragOverOrgId === orgId
    const isHighlighted = highlightedOrgId === orgId
    const isExpanded   = expandedChipIds.has(orgId)
    const toggle = () => setExpandedChipIds(prev => { const s = new Set(prev); s.has(orgId) ? s.delete(orgId) : s.add(orgId); return s })

    if (!isExpanded) {
      return (
        <div
          className={`flex items-center gap-1.5 border rounded px-2 py-1 text-xs cursor-pointer select-none transition-all ${
            isHighlighted ? 'border-green-400 bg-green-50' : isDragOver && !isBefore ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
          onClick={toggle}
          onDragOver={e => { e.stopPropagation(); handleDragOver(e, orgId) }}
          onDragLeave={e => { e.stopPropagation(); handleDragLeave() }}
          onDrop={e => { e.stopPropagation(); handleDrop(e, orgId) }}
        >
          <span className="text-gray-400">▸</span>
          <span className="font-medium text-gray-700 truncate flex-1">{org.name}</span>
          {personsInOrg.length > 0 && <span className="text-gray-400">{personsInOrg.length}名</span>}
          {childOrgIds.length > 0 && <span className="text-gray-400">{childOrgIds.length}組織</span>}
          {isDragOver && !isBefore && <span className="text-blue-500">← ドロップ</span>}
        </div>
      )
    }

    return (
      <div
        className={`border-2 rounded-lg transition-all ${
          isHighlighted ? 'border-green-400 bg-green-50' : isDragOver && !isBefore ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
        }`}
        onDragOver={e => { e.stopPropagation(); handleDragOver(e, orgId) }}
        onDragLeave={e => { e.stopPropagation(); handleDragLeave() }}
        onDrop={e => { e.stopPropagation(); handleDrop(e, orgId) }}
      >
        <div className="px-2 py-1 border-b border-gray-200 bg-gray-50 rounded-t-lg text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 flex items-center gap-1" onClick={toggle}>
          <span className="text-gray-400">▾</span>
          <span className="flex-1">{org.name}</span>
          {renderSortButton(orgId)}
        </div>
        <div className="p-2">
          {renderDepartedCards(orgId)}
          {renderPersonCards(orgId, org.companyId)}
          {renderDropZone(orgId)}
          {childOrgIds.length > 0 && <div className="mt-2 space-y-1">{childOrgIds.map(id => <CollapsedOrgChip key={id} orgId={id} />)}</div>}
        </div>
      </div>
    )
  }

  // ── OrgBox ─────────────────────────────────────────────────────
  const OrgBox = ({ orgId, depth = 0 }: OrgBoxProps) => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return null
    const childOrgIds   = organizations.filter(o => o.parentId === orgId).map(o => o.id)
    const isDragOver    = dragOverOrgId === orgId
    const isHighlighted = highlightedOrgId === orgId

    return (
      <div
        className={`border-2 rounded-lg transition-all ${
          isHighlighted ? 'border-green-400 bg-green-50' : isDragOver && !isBefore ? 'border-blue-400 bg-blue-50' :
          depth === 0 ? 'border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
        }`}
        onDragOver={e => handleDragOver(e, orgId)}
        onDragLeave={handleDragLeave}
        onDrop={e => handleDrop(e, orgId)}
      >
        <div className={`px-3 py-1.5 border-b text-xs font-semibold flex items-center ${
          depth === 0 ? 'border-gray-300 text-gray-600 bg-gray-100 rounded-t-lg' : 'border-gray-200 text-gray-500 bg-gray-50 rounded-t-lg'
        }`}>
          <span className="flex-1">{org.name}</span>
          {renderSortButton(orgId)}
        </div>
        <div className="p-2">
          {renderDepartedCards(orgId)}
          {renderPersonCards(orgId, org.companyId)}
          {renderDropZone(orgId)}
          {childOrgIds.length > 0 && <div className="mt-2 space-y-1">{childOrgIds.map(id => <CollapsedOrgChip key={id} orgId={id} />)}</div>}
        </div>
      </div>
    )
  }

  // ── Report line view ───────────────────────────────────────────
  const ReportLineView = () => {
    const getAllOrgsInTree = (rootId: string): string[] => {
      const result = [rootId]
      organizations.filter(o => o.parentId === rootId).forEach(c => result.push(...getAllOrgsInTree(c.id)))
      return result
    }
    const orgsInScope  = getAllOrgsInTree(focusedOrgId)
    const orgColorMap  = Object.fromEntries(orgsInScope.map((id, i) => [id, ORG_PALETTE[i % ORG_PALETTE.length]]))

    const getPersonScopeAff = (personId: string) => {
      const aff = viewAffs.find(a => {
        if (a.personId !== personId || a.status !== 'active') return false
        const pos = viewPos.find(p => p.id === a.positionId)
        return pos != null && orgsInScope.includes(pos.orgId)
      })
      if (!aff) return null
      const pos = viewPos.find(p => p.id === aff.positionId)!
      return { aff, pos, orgId: pos.orgId }
    }

    const personsInScope = [...new Set(
      viewAffs.filter(a => {
        if (a.status !== 'active') return false
        const pos = viewPos.find(p => p.id === a.positionId)
        return pos != null && orgsInScope.includes(pos.orgId)
      }).map(a => a.personId)
    )]

    const getDirectReports = (managerId: string) => personsInScope.filter(pid => getPersonScopeAff(pid)?.aff.managerId === managerId)
    const roots = personsInScope.filter(pid => {
      const sa = getPersonScopeAff(pid)
      if (!sa) return false
      return !sa.aff.managerId || !personsInScope.includes(sa.aff.managerId)
    })

    const ReportNode = ({ personId, depth = 0 }: { personId: string; depth?: number }) => {
      const person = persons.find(p => p.id === personId)
      const sa     = getPersonScopeAff(personId)
      if (!person || !sa) return null
      const color = orgColorMap[sa.orgId]
      const org   = organizations.find(o => o.id === sa.orgId)
      return (
        <div className={depth > 0 ? 'ml-6 border-l-2 border-gray-200 pl-3 mt-1.5' : 'mt-1.5'}>
          <button
            onClick={() => selectPerson(personId)}
            className={`text-left inline-block px-2.5 py-1.5 rounded border text-xs transition-all hover:shadow-sm ${color.card} ${selectedPersonId === personId ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`}
          >
            <div className={`font-semibold leading-tight ${color.text}`}>{person.name}</div>
            <div className="text-gray-500 leading-tight">{sa.pos.title}{sa.pos.band && <span className={`ml-1 font-medium ${color.text}`}>{sa.pos.band}</span>}</div>
            {org && <span className={`inline-block text-xs px-1 rounded mt-0.5 leading-tight ${color.tag}`}>{org.name}</span>}
          </button>
          {getDirectReports(personId).map(id => <ReportNode key={id} personId={id} depth={depth + 1} />)}
        </div>
      )
    }

    return (
      <div className="p-4">
        {roots.length === 0
          ? <div className="text-gray-400 text-sm text-center py-12">上司情報が設定されていません</div>
          : roots.map(pid => <ReportNode key={pid} personId={pid} />)
        }
      </div>
    )
  }

  const VIEW_STATE_LABELS: Record<ViewState, string> = { after: '発令後', 'after-diff': '差分ON', before: '発令前' }

  return (
    <div className="flex flex-col h-full overflow-hidden" onDragEnd={() => { setReorderDropTarget(null); setDragOverOrgId(null) }}>
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        {parentOrg && (
          <>
            <button onClick={() => focusOrg(parentOrg.id)} className="text-xs text-gray-500 hover:text-blue-600 flex-shrink-0">← 上へ</button>
            <span className="text-gray-300 flex-shrink-0">|</span>
          </>
        )}
        <div className="flex items-center gap-0.5 text-xs flex-1 min-w-0 overflow-hidden">
          {breadcrumb.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-0.5 flex-shrink-0">
              {i > 0 && <span className="text-gray-400">›</span>}
              <button onClick={() => focusOrg(crumb.id)} className={`hover:text-blue-600 truncate max-w-24 ${i === breadcrumb.length - 1 ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Canvas mode */}
          <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
            {(['組織図', 'レポートライン'] as CanvasMode[]).map(mode => (
              <button key={mode} onClick={() => setCanvasMode(mode)}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${canvasMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {mode}
              </button>
            ))}
          </div>
          {/* View state */}
          <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
            {(['after', 'after-diff', 'before'] as ViewState[]).map(vs => (
              <button key={vs} onClick={() => setViewState(vs)}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${viewState === vs
                  ? vs === 'before' ? 'bg-amber-100 text-amber-800 shadow-sm'
                  : vs === 'after-diff' ? 'bg-red-100 text-red-800 shadow-sm'
                  : 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'}`}>
                {VIEW_STATE_LABELS[vs]}
              </button>
            ))}
          </div>
          {!isBefore && canvasMode === '組織図' && <span className="text-xs text-gray-400">Alt+ドロップ=兼務</span>}
        </div>
      </div>

      {/* Before view legend */}
      {isBefore && (
        <div className="flex-shrink-0 px-3 py-1 bg-amber-50 border-b border-amber-200 flex items-center gap-3 text-xs">
          <span className="text-amber-700 font-medium">発令前の状態（参照）</span>
          <span className="text-amber-500">⚠ 未確認</span>
          <span className="text-green-600">✓ 変更なし確認済</span>
          <span className="text-blue-500">→ 異動あり</span>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto p-3">
        {canvasMode === 'レポートライン' ? (
          <ReportLineView />
        ) : childOrgs.length === 0 ? (
          <OrgBox orgId={focusedOrgId} depth={0} />
        ) : (
          <div className={`border-2 rounded-lg transition-all ${!isBefore && dragOverOrgId === focusedOrgId ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="px-3 py-2 border-b border-gray-300 bg-gray-100 rounded-t-lg flex items-center">
              <span className="text-sm font-semibold text-gray-700 flex-1">{focusedOrg.name}</span>
              {renderSortButton(focusedOrgId)}
            </div>
            <div className="px-3 py-2" onDragOver={e => handleDragOver(e, focusedOrgId)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, focusedOrgId)}>
              {renderDepartedCards(focusedOrgId)}
              {renderPersonCards(focusedOrgId, focusedOrg.companyId)}
              {renderDropZone(focusedOrgId, true)}
            </div>
            <div className="px-3 pb-3 grid grid-cols-2 gap-3">
              {childOrgs.map(c => <OrgBox key={c.id} orgId={c.id} depth={0} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
