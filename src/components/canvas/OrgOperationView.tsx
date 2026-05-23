import { useState, useMemo, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { rowDiff } from '../../domain/allocationRow'
import { buildOrgMap } from '../../domain/projection/rows'
import { BulkMoveToOrgOperation } from '../../domain/operation/handlers/bulkMoveToOrg'
import { MoveRowsToOrgOperation } from '../../domain/operation/handlers/moveRowsToOrg'
import { appService } from '../../application/HRApplicationService'
import { useScopedStore } from '../../store/useScopedStore'
import { OrgCombobox } from '../common/OrgCombobox'
import type { AllocationRow } from '../../domain/allocationRow'
import type { Person } from '../../domain/schemas'

const BAND_ORDER  = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']
const TITLE_ORDER = [
  '代表取締役社長', '代表取締役', '取締役', '社長', '副社長', '専務取締役', '専務', '常務取締役', '常務',
  '本部長', '副本部長', '部長', '副部長', '課長', '副課長', '係長', '主任', '担当', '',
]

type SortMode   = 'band' | 'title' | 'manual'
type CanvasMode = '組織図' | 'レポートライン'
type ViewState  = 'after' | 'after-diff' | 'before'

interface DragData {
  personId: string
  fromOrgId: string
  fromCompanyId: string
  affiliationType: 'primary' | 'concurrent'
  source?: 'before' | 'after' | 'reportLine' | 'sidebar'
}

interface MemberEntry {
  row:    AllocationRow
  person: Person
}

interface OrgBoxProps           { orgId: string; depth?: number }
interface CollapsedOrgChipProps { orgId: string }

const ORG_PALETTE = [
  { card: 'bg-blue-50 border-blue-200',     tag: 'bg-blue-100 text-blue-700',     text: 'text-blue-800',   line: 'border-l-blue-400' },
  { card: 'bg-green-50 border-green-200',   tag: 'bg-green-100 text-green-700',   text: 'text-green-800',  line: 'border-l-green-400' },
  { card: 'bg-purple-50 border-purple-200', tag: 'bg-purple-100 text-purple-700', text: 'text-purple-800', line: 'border-l-purple-400' },
  { card: 'bg-amber-50 border-amber-200',   tag: 'bg-amber-100 text-amber-700',   text: 'text-amber-800',  line: 'border-l-amber-400' },
  { card: 'bg-cyan-50 border-cyan-200',     tag: 'bg-cyan-100 text-cyan-700',     text: 'text-cyan-800',   line: 'border-l-cyan-400' },
  { card: 'bg-rose-50 border-rose-200',     tag: 'bg-rose-100 text-rose-700',     text: 'text-rose-800',   line: 'border-l-rose-400' },
  { card: 'bg-teal-50 border-teal-200',     tag: 'bg-teal-100 text-teal-700',     text: 'text-teal-800',   line: 'border-l-teal-400' },
  { card: 'bg-orange-50 border-orange-200', tag: 'bg-orange-100 text-orange-700', text: 'text-orange-800', line: 'border-l-orange-400' },
]

export function OrgOperationView() {
  const store = useScopedStore()
  const { afterOrganizations: allAfterOrgsUnscoped } = useStore()  // full list for move target picker
  const {
    focusedOrgId, focusOrg,
    afterOrganizations: allAfterOrgs, organizations: staticOrgs, persons,
    allocationList,
    selectedPersonId, selectPerson, enterEditMode, saveRow,
    mainCanvasMode, setMainCanvasMode,
    expandedChipIds, toggleChip,
  } = store

  const handlePersonDoubleClick = (personId: string) => {
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) return
    const firstRow = allocationList.find(r => r.userId === person.sfPersonId)
    if (!firstRow) return
    enterEditMode(firstRow.rowId)
  }

  const [dragOverOrgId,    setDragOverOrgId]    = useState<string | null>(null)
  const [highlightedOrgId, setHighlightedOrgId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; personId: string } | null>(null)
  const canvasMode    = mainCanvasMode
  const setCanvasMode = (mode: CanvasMode) => setMainCanvasMode(mode)
  const [viewState,         setViewState]         = useState<ViewState>('after')
  const [orgSortModes,      setOrgSortModes]      = useState<Record<string, SortMode>>({})
  const [orgManualOrders,   setOrgManualOrders]   = useState<Record<string, string[]>>({})
  const [reorderDropTarget, setReorderDropTarget] = useState<{ orgId: string; beforePersonId: string | null } | null>(null)
  const [openSortDropdown,  setOpenSortDropdown]  = useState<string | null>(null)
  const [bulkMoveSourceId,  setBulkMoveSourceId]  = useState<string | null>(null)
  const [bulkMoveTargetId,  setBulkMoveTargetId]  = useState<string>('')
  const [bulkMoveError,     setBulkMoveError]     = useState<string | null>(null)

  // 選択モード
  const [isSelectMode,       setIsSelectMode]       = useState(false)
  const [selectedPersonIds,  setSelectedPersonIds]  = useState<Set<string>>(new Set())
  const [moveTargetOrgId,    setMoveTargetOrgId]    = useState<string | null>(null)
  const [moveModalOpen,      setMoveModalOpen]      = useState(false)
  const [moveError,          setMoveError]          = useState<string | null>(null)

  const togglePersonSelection = (personId: string) => {
    setSelectedPersonIds(prev => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  const exitSelectMode = () => {
    setIsSelectMode(false)
    setSelectedPersonIds(new Set())
  }
  const [expandedNodes,       setExpandedNodes]       = useState<Set<string>>(new Set())
  const [reportLineRootId,    setReportLineRootId]    = useState<string | null>(null)

  // レポートライン内クリックと外部選択を区別するフラグ (宣言はhookルール上ここに置く)
  const isReportLineInternalSelect = useRef(false)
  const rlManagerMapRef    = useRef(new Map<string, string>())
  const reportLineRootIdRef = useRef<string | null>(null)

  const handlePersonContextMenu = (e: React.MouseEvent, personId: string) => {
    e.preventDefault()
    e.stopPropagation()
    selectPerson(personId)
    setContextMenu({ x: e.clientX, y: e.clientY, personId })
  }
  const closeContextMenu     = () => setContextMenu(null)
  const contextMenuEditClick = () => { if (!contextMenu) return; closeContextMenu(); handlePersonDoubleClick(contextMenu.personId) }

  const isBefore    = viewState === 'before'
  const isAfterDiff = viewState === 'after-diff'
  const organizations = isBefore ? staticOrgs : allAfterOrgs.filter(o => !o.isAbandoned)

  // ── Maps (before any early returns — hooks must not be conditional) ──
  const afterOrgByCode  = useMemo(() => buildOrgMap(allAfterOrgs), [allAfterOrgs])
  const beforeOrgByCode = useMemo(() => buildOrgMap(staticOrgs),   [staticOrgs])
  const personBySfId    = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons]
  )

  const afterMembersByOrgId = useMemo(() => {
    const map = new Map<string, MemberEntry[]>()
    for (const row of allocationList) {
      if (!row.departmentCode) continue
      const org = afterOrgByCode.get(row.departmentCode)
      if (!org) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const arr = map.get(org.id)
      if (arr) arr.push({ row, person })
      else map.set(org.id, [{ row, person }])
    }
    return map
  }, [allocationList, afterOrgByCode, personBySfId])

  const beforeMembersByOrgId = useMemo(() => {
    const map = new Map<string, MemberEntry[]>()
    for (const row of allocationList) {
      if (!row.prevDepartmentCode) continue
      const org = beforeOrgByCode.get(row.prevDepartmentCode)
      if (!org) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const arr = map.get(org.id)
      if (arr) arr.push({ row, person })
      else map.set(org.id, [{ row, person }])
    }
    return map
  }, [allocationList, beforeOrgByCode, personBySfId])

  // ── レポートライン用マップ (org フィルタなし) ──────────────────
  const rlPosCodeToPersonId = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of allocationList) {
      if (row.concurrentType) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const posCode = isBefore ? row.prevPositionCode : row.positionCode
      if (posCode) map.set(posCode, person.id)
    }
    return map
  }, [allocationList, isBefore, personBySfId])

  const rlManagerMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of allocationList) {
      if (row.concurrentType) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const mgrCode = isBefore ? row.prevManagerPositionCode : row.managerPositionCode
      if (!mgrCode) continue
      const mgrId = rlPosCodeToPersonId.get(mgrCode)
      if (mgrId && mgrId !== person.id) map.set(person.id, mgrId)
    }
    return map
  }, [allocationList, isBefore, personBySfId, rlPosCodeToPersonId])

  rlManagerMapRef.current     = rlManagerMap
  reportLineRootIdRef.current = reportLineRootId

  // ヘッダー表示用: 描写起点（reportLineRootId）の人名と組織名
  const rlRootPersonInfo = useMemo(() => {
    if (!reportLineRootId) return null
    const person = persons.find(p => p.id === reportLineRootId)
    if (!person?.sfPersonId) return null
    const row = allocationList.find(r => r.userId === person.sfPersonId && !r.concurrentType)
              ?? allocationList.find(r => r.userId === person.sfPersonId)
    const deptCode = row ? (isBefore ? row.prevDepartmentCode : row.departmentCode) : null
    const org = deptCode ? (isBefore ? beforeOrgByCode : afterOrgByCode).get(deptCode) : null
    return { name: person.name, orgName: org?.name ?? null }
  }, [reportLineRootId, persons, allocationList, isBefore, beforeOrgByCode, afterOrgByCode])

  // 「↑ 上へ」で移動できる先 (現在ルートの親)
  const rlRootManagerId = reportLineRootId != null ? rlManagerMap.get(reportLineRootId) : undefined

  // 外部（サイドバー/組織図/Excel）で人が選択された時: 祖先を展開して見えるようにする
  // 現在のツリー外にいる場合はルートをその人の親に変更
  useEffect(() => {
    if (canvasMode !== 'レポートライン' || !selectedPersonId) return
    if (isReportLineInternalSelect.current) {
      isReportLineInternalSelect.current = false
      return
    }
    const mgr = rlManagerMapRef.current
    // 祖先チェーンを構築
    const ancestors: string[] = []
    let cur = mgr.get(selectedPersonId)
    while (cur) {
      ancestors.push(cur)
      cur = mgr.get(cur)
    }
    const rootId = reportLineRootIdRef.current
    // ツリー内かどうか判定: root=null(全体) または 祖先に root が含まれる または 選択者自身がroot
    const inTree = rootId == null || rootId === selectedPersonId || ancestors.includes(rootId)
    if (!inTree) {
      // ツリー外 → 親をルートにしてから展開
      const parentId = mgr.get(selectedPersonId)
      setReportLineRootId(parentId ?? selectedPersonId)
      setExpandedNodes(prev => new Set([...prev, ...(parentId ? [parentId] : []), ...ancestors]))
    } else {
      // ツリー内 → 祖先を全て展開して対象を表示
      setExpandedNodes(prev => new Set([...prev, ...ancestors]))
    }
  }, [selectedPersonId, canvasMode])

  // ── Early returns ─────────────────────────────────────────────
  if (!focusedOrgId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        ← 左の組織ツリーから組織を選択してください
      </div>
    )
  }

  const focusedOrg = organizations.find(o => o.id === focusedOrgId)

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

  // ── Row field helpers (view-state-aware) ─────────────────────
  const rowBand  = (row: AllocationRow) =>
    isBefore ? (row.prevPositionBand ?? row.prevBand ?? '') : (row.positionBand ?? row.band ?? '')
  const rowTitle = (row: AllocationRow) =>
    isBefore ? (row.prevOfficialPositionCode ?? '') : (row.officialPositionCode ?? '')

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

  const getPersonsInOrg = (orgId: string): MemberEntry[] =>
    (isBefore ? beforeMembersByOrgId : afterMembersByOrgId).get(orgId) ?? []

  const getBeforeOrgName = (person: Person, currentOrgId: string): string | null => {
    if (isBefore) return null
    const sfId = person.sfPersonId ?? ''
    const row  = allocationList.find(r => r.userId === sfId && r.concurrentType !== '兼務')
              ?? allocationList.find(r => r.userId === sfId)
    if (!row?.prevDepartmentCode) return null
    const beforeOrg = beforeOrgByCode.get(row.prevDepartmentCode)
    if (!beforeOrg || beforeOrg.id === currentOrgId) return null
    return beforeOrg.name
  }

  const getDepartedPersons = (orgId: string) => {
    if (!isAfterDiff) return []
    const afterPersonIds = new Set((afterMembersByOrgId.get(orgId) ?? []).map(m => m.person.id))
    return (beforeMembersByOrgId.get(orgId) ?? [])
      .filter(({ person }) => !afterPersonIds.has(person.id))
      .map(({ row, person }) => {
        const userId   = row.userId ?? ''
        const afterRow = allocationList.find(r => r.userId === userId && r.concurrentType !== '兼務')
                      ?? allocationList.find(r => r.userId === userId)
        const afterOrg = afterRow?.departmentCode
          ? (afterOrgByCode.get(afterRow.departmentCode) ?? null)
          : null
        return { person, row, afterOrg }
      })
  }

  const getConfirmStatus = (personId: string): 'changed' | 'unchanged' => {
    const sfId = persons.find(p => p.id === personId)?.sfPersonId ?? ''
    return allocationList.filter(r => r.userId === sfId).some(r => rowDiff(r).length > 0)
      ? 'changed' : 'unchanged'
  }

  // ── Sort helpers ──────────────────────────────────────────────
  const getSortedPersons = (orgId: string, list: MemberEntry[], overrideOrders?: Record<string, string[]>) => {
    const mode = orgSortModes[orgId] ?? 'band'
    if (mode === 'band')
      return [...list].sort((a, b) =>
        BAND_ORDER.indexOf(rowBand(b.row) || 'B4') - BAND_ORDER.indexOf(rowBand(a.row) || 'B4')
      )
    if (mode === 'title') {
      return [...list].sort((a, b) => {
        const ai = TITLE_ORDER.indexOf(rowTitle(a.row)); const bi = TITLE_ORDER.indexOf(rowTitle(b.row))
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    }
    const orders = overrideOrders ?? orgManualOrders
    const order  = orders[orgId]
    if (!order) return list
    const byId   = new Map(list.map(p => [p.person.id, p]))
    return [
      ...order.map(id => byId.get(id)).filter((x): x is NonNullable<typeof x> => x != null),
      ...list.filter(p => !order.includes(p.person.id)),
    ]
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

  // ── Drag handlers ─────────────────────────────────────────────
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
    const { personId, fromOrgId } = data
    if (fromOrgId && fromOrgId === toOrgId) return

    const toOrg = organizations.find(o => o.id === toOrgId)
    if (!toOrg) return
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) return

    const primaryRow = allocationList.find(r => r.userId === person.sfPersonId && !r.concurrentType)
                    ?? allocationList.find(r => r.userId === person.sfPersonId)
    if (primaryRow) {
      saveRow(primaryRow.rowId, { departmentCode: toOrg.externalCode ?? toOrg.id })
    }
    setHighlightedOrgId(toOrgId); setTimeout(() => setHighlightedOrgId(null), 800)
  }

  // ── Sort button ───────────────────────────────────────────────
  const renderSortButton = (orgId: string) => {
    if (isBefore) return null
    const mode  = orgSortModes[orgId] ?? 'band'
    const label = mode === 'band' ? 'B↓' : mode === 'title' ? '役↓' : '⠿'
    return (
      <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button
          onClick={e => { e.stopPropagation(); setOpenSortDropdown(prev => prev === orgId ? null : orgId) }}
          className={`text-xs px-1 rounded ${mode === 'manual' ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'}`}
        >
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

  // ── Person cards ──────────────────────────────────────────────
  const renderPersonCards = (orgId: string, companyId: string) => {
    const list     = getPersonsInOrg(orgId)
    if (list.length === 0) return null
    const sortMode = orgSortModes[orgId] ?? 'band'
    const sorted   = getSortedPersons(orgId, list)

    const cardBg = (isConcurrent: boolean, isSelected: boolean, status?: 'changed' | 'unchanged') => {
      if (isBefore && status) {
        const statusBg = { unchanged: 'bg-gray-100 border-gray-300', changed: 'bg-blue-50 border-blue-300' }
        return `${statusBg[status]} ${isConcurrent ? 'border-dashed' : ''} ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`
      }
      return `${isConcurrent ? 'border-dashed border-purple-400 bg-purple-50' : 'border-blue-300 bg-blue-50'} ${isSelected ? 'ring-2 ring-yellow-400 ring-offset-1' : ''}`
    }

    const cardInner = (row: AllocationRow, person: { name: string }, isConcurrent: boolean, fromOrgName: string | null, status?: 'changed' | 'unchanged') => {
      const title = rowTitle(row)
      const band  = rowBand(row)
      return (
        <>
          {isBefore && status && (
            <span className={`absolute -top-1 -right-1 text-xs leading-none ${status === 'unchanged' ? 'text-gray-400' : 'text-blue-500'}`}>
              {status === 'unchanged' ? '−' : '→'}
            </span>
          )}
          {fromOrgName && <div className="text-gray-400 text-xs leading-tight mb-0.5">← {fromOrgName}</div>}
          <div className="font-semibold text-gray-800 leading-tight">{person.name}</div>
          <div className="text-gray-500 leading-tight">
            {title}
            {band && <span className={`ml-1 font-medium ${isBefore ? 'text-gray-600' : isConcurrent ? 'text-purple-600' : 'text-blue-600'}`}>{band}</span>}
          </div>
          {isConcurrent && <div className="text-purple-600 text-xs leading-tight">兼務</div>}
        </>
      )
    }

    if (!isBefore && sortMode === 'manual') {
      return (
        <div className="flex flex-col gap-1 mb-2">
          {sorted.map(({ row, person }) => {
            const isConcurrent = row.concurrentType === '兼務'
            const isSelected   = selectedPersonId === person.id
            const fromOrgName  = getBeforeOrgName(person, orgId)
            const isDropBefore = reorderDropTarget?.orgId === orgId && reorderDropTarget.beforePersonId === person.id
            return (
              <div key={row.rowId}>
                {isDropBefore && <div className="h-0.5 bg-blue-400 rounded mb-0.5 mx-1" />}
                <div
                  draggable
                  onDragStart={e => handleDragStart(e, person.id, orgId, companyId, isConcurrent ? 'concurrent' : 'primary')}
                  onDragOver={e => { if (!e.dataTransfer.types.includes('application/json')) return; e.preventDefault(); e.stopPropagation(); setReorderDropTarget({ orgId, beforePersonId: person.id }) }}
                  onDrop={e => {
                    e.stopPropagation(); setReorderDropTarget(null)
                    let d: DragData; try { d = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
                    if (d.fromOrgId === orgId && !e.altKey) { e.preventDefault(); doReorder(orgId, person.id, d.personId) }
                    else { handleDrop(e, orgId) }
                  }}
                  onClick={() => selectPerson(person.id)}
                  onDoubleClick={() => handlePersonDoubleClick(person.id)}
                  onContextMenu={e => handlePersonContextMenu(e, person.id)}
                  className={`relative px-2.5 py-1.5 rounded text-xs select-none cursor-grab active:cursor-grabbing transition-all hover:shadow-md border-2 ${cardBg(isConcurrent, isSelected)}`}
                >
                  {cardInner(row, person, isConcurrent, fromOrgName)}
                </div>
              </div>
            )
          })}
          <div
            className={`h-1 rounded mx-1 transition-colors ${reorderDropTarget?.orgId === orgId && reorderDropTarget.beforePersonId === null ? 'bg-blue-400' : ''}`}
            onDragOver={e => { if (!e.dataTransfer.types.includes('application/json')) return; e.preventDefault(); e.stopPropagation(); setReorderDropTarget({ orgId, beforePersonId: null }) }}
            onDrop={e => {
              e.stopPropagation(); setReorderDropTarget(null)
              let d: DragData; try { d = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
              if (d.fromOrgId === orgId && !e.altKey) { e.preventDefault(); doReorder(orgId, null, d.personId) }
              else { handleDrop(e, orgId) }
            }}
          />
        </div>
      )
    }

    return (
      <div className="flex flex-wrap gap-1.5 mb-2">
        {sorted.map(({ row, person }) => {
          const isConcurrent  = row.concurrentType === '兼務'
          const isSelected    = isSelectMode ? selectedPersonIds.has(person.id) : selectedPersonId === person.id
          const fromOrgName   = getBeforeOrgName(person, orgId)
          const status        = isBefore ? getConfirmStatus(person.id) : undefined
          return (
            <div
              key={row.rowId}
              draggable={!isBefore && !isSelectMode}
              onDragStart={!isBefore && !isSelectMode ? e => handleDragStart(e, person.id, orgId, companyId, isConcurrent ? 'concurrent' : 'primary') : undefined}
              onClick={() => isSelectMode ? togglePersonSelection(person.id) : selectPerson(person.id)}
              onDoubleClick={() => !isSelectMode && handlePersonDoubleClick(person.id)}
              onContextMenu={e => !isSelectMode && handlePersonContextMenu(e, person.id)}
              className={`relative px-2.5 py-1.5 rounded text-xs select-none transition-all hover:shadow-md border-2 ${
                isSelectMode ? 'cursor-pointer' : !isBefore ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
              } ${cardBg(isConcurrent, isSelected, status)}`}
            >
              {isSelectMode && (
                <span className={`absolute top-1 right-1 w-3.5 h-3.5 rounded border flex items-center justify-center text-xs font-bold ${
                  isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-400'
                }`}>
                  {isSelected ? '✓' : ''}
                </span>
              )}
              {cardInner(row, person, isConcurrent, fromOrgName, status)}
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
        {departed.map(({ person, row, afterOrg }) => {
          const prevBand  = row.prevPositionBand ?? row.prevBand ?? ''
          const prevTitle = row.prevOfficialPositionCode ?? ''
          return (
            <div key={person.id} className="px-2.5 py-1.5 rounded text-xs border-2 border-dashed border-red-300 bg-red-50 opacity-70 select-none">
              <div className="font-semibold text-gray-400 line-through leading-tight">{person.name}</div>
              <div className="text-gray-400 leading-tight">{prevTitle}{prevBand && <span className="ml-1">{prevBand}</span>}</div>
              {afterOrg && <div className="text-red-500 text-xs leading-tight">→ {afterOrg.name}</div>}
            </div>
          )
        })}
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

  // ── CollapsedOrgChip ──────────────────────────────────────────
  const CollapsedOrgChip = ({ orgId }: CollapsedOrgChipProps) => {
    const org = organizations.find(o => o.id === orgId)
    if (!org) return null
    const personsInOrg  = getPersonsInOrg(orgId)
    const childOrgIds   = organizations.filter(o => o.parentId === orgId).map(o => o.id)
    const isDragOver    = dragOverOrgId === orgId
    const isHighlighted = highlightedOrgId === orgId
    const isExpanded    = expandedChipIds.has(orgId)
    const toggle = () => toggleChip(orgId)

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
          {!isBefore && (
            <button
              onClick={e => { e.stopPropagation(); setBulkMoveSourceId(orgId); setBulkMoveTargetId(''); setBulkMoveError(null) }}
              className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              title="このボックスのメンバを別組織に一括移動"
            >
              ⇄ 移動
            </button>
          )}
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

  // ── OrgBox ────────────────────────────────────────────────────
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
        <div className={`px-3 py-1.5 border-b text-xs font-semibold flex items-center gap-1 ${
          depth === 0 ? 'border-gray-300 text-gray-600 bg-gray-100 rounded-t-lg' : 'border-gray-200 text-gray-500 bg-gray-50 rounded-t-lg'
        }`}>
          <span className="flex-1">{org.name}</span>
          {!isBefore && (
            <button
              onClick={e => { e.stopPropagation(); setBulkMoveSourceId(orgId); setBulkMoveTargetId(''); setBulkMoveError(null) }}
              className="px-1.5 py-0.5 rounded text-xs font-medium text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              title="このボックスのメンバを別組織に一括移動"
            >
              ⇄ 移動
            </button>
          )}
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

  // ── Report line view ──────────────────────────────────────────
  const ReportLineView = () => {
    const [dragOverPersonId, setDragOverPersonId] = useState<string | null>(null)

    // All people regardless of org — primary row preferred, concurrent as fallback
    const scopeRowMap = useMemo(() => {
      const orgMap = isBefore ? beforeOrgByCode : afterOrgByCode
      const map = new Map<string, { row: AllocationRow; orgId: string }>()
      for (const row of allocationList) {
        if (row.concurrentType) continue
        const person = personBySfId.get(row.userId ?? '')
        if (!person) continue
        const deptCode = isBefore ? row.prevDepartmentCode : row.departmentCode
        const org = deptCode ? orgMap.get(deptCode) : undefined
        map.set(person.id, { row, orgId: org?.id ?? '' })
      }
      for (const row of allocationList) {
        if (!row.concurrentType) continue
        const person = personBySfId.get(row.userId ?? '')
        if (!person || map.has(person.id)) continue
        const deptCode = isBefore ? row.prevDepartmentCode : row.departmentCode
        const org = deptCode ? orgMap.get(deptCode) : undefined
        map.set(person.id, { row, orgId: org?.id ?? '' })
      }
      return map
    }, [allocationList, isBefore, beforeOrgByCode, afterOrgByCode, personBySfId])

    const orgColorMap = useMemo(() => {
      const seen = new Map<string, number>()
      let i = 0
      for (const sr of scopeRowMap.values()) {
        if (!seen.has(sr.orgId)) seen.set(sr.orgId, i++)
      }
      return Object.fromEntries([...seen.entries()].map(([id, idx]) => [id, ORG_PALETTE[idx % ORG_PALETTE.length]]))
    }, [scopeRowMap])

    // positionCode → personId
    const posCodeToPersonId = useMemo(() => {
      const map = new Map<string, string>()
      for (const [pid, sr] of scopeRowMap) {
        const posCode = isBefore ? sr.row.prevPositionCode : sr.row.positionCode
        if (posCode) map.set(posCode, pid)
      }
      return map
    }, [scopeRowMap, isBefore])

    // personId → manager personId
    const managerMap = useMemo(() => {
      const map = new Map<string, string>()
      for (const [pid, sr] of scopeRowMap) {
        const mgrCode = isBefore ? sr.row.prevManagerPositionCode : sr.row.managerPositionCode
        if (!mgrCode) continue
        const mgrId = posCodeToPersonId.get(mgrCode)
        if (mgrId && mgrId !== pid) map.set(pid, mgrId)
      }
      return map
    }, [scopeRowMap, posCodeToPersonId, isBefore])

    // personId → direct report personIds
    const directReportsMap = useMemo(() => {
      const map = new Map<string, string[]>()
      for (const pid of scopeRowMap.keys()) map.set(pid, [])
      for (const [pid, mgrId] of managerMap) {
        map.get(mgrId)?.push(pid)
      }
      return map
    }, [scopeRowMap, managerMap])

    const globalRoots = useMemo(() =>
      [...scopeRowMap.keys()].filter(pid => !managerMap.has(pid)),
      [scopeRowMap, managerMap]
    )

    const displayRoots = reportLineRootId && scopeRowMap.has(reportLineRootId)
      ? [reportLineRootId]
      : globalRoots

    const wouldCycle = (targetId: string, sourceId: string, visited = new Set<string>()): boolean => {
      if (visited.has(sourceId)) return false
      visited.add(sourceId)
      return (directReportsMap.get(sourceId) ?? []).some(childId =>
        childId === targetId || wouldCycle(targetId, childId, new Set(visited))
      )
    }

    const handleManagerDrop = (targetPersonId: string, sourcePersonId: string) => {
      if (sourcePersonId === targetPersonId) return
      if (wouldCycle(targetPersonId, sourcePersonId)) return
      const targetPerson = persons.find(p => p.id === targetPersonId)
      if (!targetPerson?.sfPersonId) return
      const targetRow =
        allocationList.find(r => r.userId === targetPerson.sfPersonId && !r.concurrentType) ??
        allocationList.find(r => r.userId === targetPerson.sfPersonId)
      if (!targetRow) return
      const sourcePerson = persons.find(p => p.id === sourcePersonId)
      if (!sourcePerson?.sfPersonId) return
      const sourceRow =
        allocationList.find(r => r.userId === sourcePerson.sfPersonId && !r.concurrentType) ??
        allocationList.find(r => r.userId === sourcePerson.sfPersonId)
      if (!sourceRow) return
      const managerName = [targetRow.lastName, targetRow.firstName].filter(Boolean).join('')
      saveRow(sourceRow.rowId, { managerPositionCode: targetRow.positionCode ?? '', managerName })
    }

    const toggleExpand = (personId: string) => {
      setExpandedNodes(prev => {
        const next = new Set(prev)
        next.has(personId) ? next.delete(personId) : next.add(personId)
        return next
      })
    }

    const ReportNode = ({ personId, depth = 0 }: { personId: string; depth?: number }) => {
      if (depth > 20) return <div className="text-xs text-red-400 ml-5">⚠ 循環参照</div>
      const person = persons.find(p => p.id === personId)
      const sr     = scopeRowMap.get(personId)
      if (!person || !sr) return null
      const color         = orgColorMap[sr.orgId] ?? ORG_PALETTE[0]
      const org           = organizations.find(o => o.id === sr.orgId)
      const title         = isBefore ? sr.row.prevOfficialPositionCode : sr.row.officialPositionCode
      const band          = isBefore ? (sr.row.prevPositionBand ?? sr.row.prevBand) : (sr.row.positionBand ?? sr.row.band)
      const directReports = directReportsMap.get(personId) ?? []
      const isExpanded    = expandedNodes.has(personId)
      const hasReports    = directReports.length > 0
      return (
        <div className="mt-1">
          <div className="flex items-center gap-1">
            <button
              onClick={() => hasReports && toggleExpand(personId)}
              className={`w-4 flex-shrink-0 text-xs text-center leading-none ${hasReports ? 'text-gray-400 hover:text-gray-600 cursor-pointer' : 'text-gray-300 cursor-default'}`}
            >
              {hasReports ? (isExpanded ? '▼' : '▶') : '·'}
            </button>
            <button
              draggable
              onDragStart={e => {
                e.stopPropagation()
                e.dataTransfer.setData('application/json', JSON.stringify({
                  personId, fromOrgId: '', fromCompanyId: '', affiliationType: 'primary', source: 'reportLine',
                }))
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverPersonId(personId) }}
              onDragLeave={e => {
                if (!(e.currentTarget as Element).contains(e.relatedTarget as Node))
                  setDragOverPersonId(null)
              }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation(); setDragOverPersonId(null)
                let data: { personId: string }
                try { data = JSON.parse(e.dataTransfer.getData('application/json')) as { personId: string } } catch { return }
                handleManagerDrop(personId, data.personId)
              }}
              onClick={() => {
                isReportLineInternalSelect.current = true
                selectPerson(personId)
                // ルートカードをクリックしたら親へ移動
                if (personId === reportLineRootId && rlRootManagerId) {
                  setReportLineRootId(rlRootManagerId)
                  setExpandedNodes(prev => new Set([...prev, rlRootManagerId]))
                }
              }}
              onDoubleClick={() => handlePersonDoubleClick(personId)}
              onContextMenu={e => handlePersonContextMenu(e, personId)}
              className={`flex items-center gap-2 pl-3 pr-2.5 py-1 rounded-r border-l-4 bg-white text-xs transition-all hover:shadow-sm cursor-grab active:cursor-grabbing whitespace-nowrap ${color.line} ${
                dragOverPersonId === personId
                  ? 'shadow-md outline outline-2 outline-green-400'
                  : selectedPersonId === personId
                  ? 'outline outline-2 outline-yellow-400'
                  : 'shadow-sm'
              }`}
            >
              {dragOverPersonId === personId && <span className="text-green-600 font-semibold">→</span>}
              <span className={`font-semibold ${color.text}`}>{person.name}</span>
              {title && <><span className="text-gray-300">·</span><span className="text-gray-500">{title}</span></>}
              {band && <span className={`font-medium ${color.text}`}>{band}</span>}
              {org && <span className={`px-1.5 py-0.5 rounded text-xs ${color.tag}`}>{org.name}</span>}
              {hasReports && <span className="text-gray-400">{directReports.length}名</span>}
            </button>
          </div>
          {isExpanded && hasReports && (
            <div className="ml-5 pl-3 border-l-2 border-gray-100 mt-0.5">
              {directReports.map(id => <ReportNode key={id} personId={id} depth={depth + 1} />)}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="p-4">
        {displayRoots.length === 0
          ? <div className="text-gray-400 text-sm text-center py-12">上司情報（上司ポジションコード）が設定されていません</div>
          : <div>{displayRoots.map(pid => <ReportNode key={pid} personId={pid} />)}</div>
        }
      </div>
    )
  }

  const VIEW_STATE_LABELS: Record<ViewState, string> = { after: '発令後', 'after-diff': '差分ON', before: '発令前' }

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      onDragEnd={() => { setReorderDropTarget(null); setDragOverOrgId(null) }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
        {canvasMode === 'レポートライン' ? (
          <>
            <button
              onClick={() => { if (rlRootManagerId) setReportLineRootId(rlRootManagerId) }}
              className={`text-xs flex-shrink-0 ${rlRootManagerId ? 'text-gray-500 hover:text-blue-600' : 'text-gray-300 cursor-default'}`}
            >
              ↑ 上へ
            </button>
            <span className="text-gray-300 flex-shrink-0">|</span>
            <div className="text-xs flex-1 min-w-0 truncate text-gray-700">
              {rlRootPersonInfo
                ? `${rlRootPersonInfo.name}${rlRootPersonInfo.orgName ? ` (${rlRootPersonInfo.orgName})` : ''}`
                : <span className="text-gray-400">全体</span>
              }
            </div>
            {reportLineRootId && (
              <button onClick={() => setReportLineRootId(null)} className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">全体</button>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex gap-0.5 p-0.5 bg-gray-100 rounded-lg">
            {(['組織図', 'レポートライン'] as CanvasMode[]).map(mode => (
              <button key={mode} onClick={() => setCanvasMode(mode)}
                className={`px-2 py-0.5 text-xs font-medium rounded transition-colors ${canvasMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {mode}
              </button>
            ))}
          </div>
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
          {!isBefore && canvasMode === '組織図' && (
            <span className="text-xs text-gray-400">Alt+ドロップ=兼務</span>
          )}
          {!isBefore && canvasMode === '組織図' && (
            <button
              onClick={() => { setIsSelectMode(m => !m); setSelectedPersonIds(new Set()) }}
              className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
                isSelectMode
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {isSelectMode ? '✓ 選択中' : '複数選択'}
            </button>
          )}
        </div>
      </div>

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

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} onContextMenu={e => { e.preventDefault(); closeContextMenu() }} />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-36"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {(() => {
              const p = persons.find(pp => pp.id === contextMenu.personId)
              return p ? <div className="px-3 py-1.5 border-b border-gray-100 text-xs font-semibold text-gray-500 truncate">{p.name}</div> : null
            })()}
            <button
              onClick={contextMenuEditClick}
              className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
            >
              <span>✏️</span> 編集画面を開く
            </button>
            {canvasMode === 'レポートライン' && (
              <button
                onClick={() => {
                  if (!contextMenu) return
                  setReportLineRootId(contextMenu.personId)
                  setExpandedNodes(prev => new Set([...prev, contextMenu.personId]))
                  closeContextMenu()
                }}
                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
              >
                <span>📍</span> この人を起点に表示
              </button>
            )}
          </div>
        </>
      )}

      {/* ── 選択モード アクションバー ───────────────────────────────── */}
      {isSelectMode && selectedPersonIds.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-gray-900 text-white rounded-full px-4 py-2 shadow-2xl text-xs">
          <span className="font-semibold">{selectedPersonIds.size}名選択中</span>
          <div className="w-px h-4 bg-gray-600" />
          <button
            onClick={() => { setMoveTargetOrgId(null); setMoveError(null); setMoveModalOpen(true) }}
            className="px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-500 font-medium transition-colors"
          >
            組織を移動
          </button>
          <button
            onClick={exitSelectMode}
            className="px-2.5 py-1 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            解除
          </button>
        </div>
      )}

      {/* ── 選択した人を組織に移動モーダル ──────────────────────────── */}
      {moveModalOpen && (() => {
        const handleMoveConfirm = () => {
          if (!moveTargetOrgId) { setMoveError('移動先を選択してください'); return }
          // Collect primary row IDs for selected persons
          const rowIds: number[] = []
          for (const personId of selectedPersonIds) {
            const person = persons.find(p => p.id === personId)
            if (!person?.sfPersonId) continue
            const primary = allocationList.find(r => r.userId === person.sfPersonId && r.concurrentType !== '兼務')
                         ?? allocationList.find(r => r.userId === person.sfPersonId)
            if (primary) rowIds.push(primary.rowId)
          }
          const targetOrg = allAfterOrgsUnscoped.find(o => o.id === moveTargetOrgId)
          const op     = new MoveRowsToOrgOperation(rowIds, moveTargetOrgId, `${rowIds.length}名 → ${targetOrg?.name ?? ''}`)
          const result = appService.executeOperation(op)
          if (!result.ok) { setMoveError(result.errors.map(e => e.message).join('、')); return }
          setMoveModalOpen(false)
          exitSelectMode()
        }
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMoveModalOpen(false)}>
            <div className="bg-white rounded-xl shadow-2xl w-96 p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
              <div className="text-sm font-bold text-gray-800">組織を移動</div>
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-800">{selectedPersonIds.size}名</span> を移動先組織に移動します。
                <br />レポートラインは変更されません。
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">移動先組織</label>
                <OrgCombobox
                  allOrgs={allAfterOrgsUnscoped}
                  value={moveTargetOrgId}
                  onChange={id => { setMoveTargetOrgId(id); setMoveError(null) }}
                  placeholder="組織を選択…"
                  variant="light"
                  className="w-full"
                />
              </div>
              {moveError && <div className="text-xs text-red-600">{moveError}</div>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setMoveModalOpen(false)}
                  className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleMoveConfirm}
                  disabled={!moveTargetOrgId}
                  className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  移動する（{selectedPersonIds.size}名）
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── 一括メンバ移動モーダル ──────────────────────────────────── */}
      {bulkMoveSourceId && (() => {
        const sourceOrg   = allAfterOrgsUnscoped.find(o => o.id === bulkMoveSourceId)
        const sourceCode  = sourceOrg?.externalCode
        const memberCount = sourceCode ? allocationList.filter(r => r.departmentCode === sourceCode).length : 0
        const moveableOrgs = allAfterOrgsUnscoped.filter(o => o.id !== bulkMoveSourceId)

        const handleConfirm = () => {
          if (!bulkMoveTargetId) { setBulkMoveError('移動先を選択してください'); return }
          const op     = new BulkMoveToOrgOperation(bulkMoveSourceId, bulkMoveTargetId, `${sourceOrg?.name ?? ''} メンバ一括移動`)
          const result = appService.executeOperation(op as Parameters<typeof appService.executeOperation>[0])
          if (!result.ok) { setBulkMoveError(result.errors.map(e => e.message).join('、')); return }
          setBulkMoveSourceId(null)
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setBulkMoveSourceId(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-96 p-5 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
              <div className="text-sm font-bold text-gray-800">メンバを別組織に一括移動</div>
              <div className="text-xs text-gray-600">
                <span className="font-semibold text-gray-800">{sourceOrg?.name}</span> の
                <span className="font-semibold text-gray-800"> {memberCount}名</span> を移動先組織に一括移動します。
                <br />レポートラインは変更されません。
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">移動先組織</label>
                <OrgCombobox
                  allOrgs={moveableOrgs}
                  value={bulkMoveTargetId || null}
                  onChange={id => { setBulkMoveTargetId(id ?? ''); setBulkMoveError(null) }}
                  placeholder="組織を選択…"
                  variant="light"
                  className="w-full"
                />
              </div>
              {bulkMoveError && <div className="text-xs text-red-600">{bulkMoveError}</div>}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setBulkMoveSourceId(null)}
                  className="px-3 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!bulkMoveTargetId}
                  className="px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  移動する（{memberCount}名）
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
