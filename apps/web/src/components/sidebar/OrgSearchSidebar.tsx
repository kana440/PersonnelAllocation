import { useState, useMemo, useEffect, useRef } from 'react'
import { useScopedStore } from '../../store/useScopedStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { rowDiff } from '@personnel/domain/allocationRow'
import { buildOrgMap } from '@personnel/domain/choices/rows'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Person } from '@personnel/domain/schemas'
import type { Organization } from '@personnel/domain/schemas'

const CHANGE_DOT: Record<string, string> = {
  changed: 'bg-yellow-400',
  new:     'bg-green-500',
  removed: 'bg-red-500',
}

export function OrgSearchSidebar() {
  const {
    afterOrganizations, organizations: beforeOrgs,
    persons, allocationList,
    selectedPersonId, selectPerson, enterOperationPanel,
  } = useScopedStore()

  const {
    requestScrollToPerson, panels, setOrgOpen, addPanel: addCanvasPanel,
    selectOrg,
  } = useCanvasLayoutStore()
  const treeScrollRef = useRef<HTMLDivElement>(null)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; personId: string } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const t = setTimeout(() => document.addEventListener('pointerdown', close), 0)
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', close) }
  }, [contextMenu !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  const enterEditForPerson = (personId: string) => {
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) return
    const firstRow = allocationList.find(r => r.userId === person.sfPersonId)
    if (!firstRow) return
    enterOperationPanel(firstRow.rowId, 'directEdit')
  }

  const handlePersonContextMenu = (e: React.MouseEvent, personId: string) => {
    e.preventDefault()
    e.stopPropagation()
    selectPerson(personId)
    setContextMenu({ x: e.clientX, y: e.clientY, personId })
  }

  const viewOrgs = useMemo(
    () => afterOrganizations.filter(o => !o.isAbandoned),
    [afterOrganizations]
  )
  const viewOrgIds = useMemo(() => new Set(viewOrgs.map(o => o.id)), [viewOrgs])

  // ── ツリー展開状態（ローカル state のみ）──────────────────────────
  const [closedCompanies, setClosedCompanies] = useState<Set<string>>(new Set())
  const [expandedOrgIds, setExpandedOrgIds]   = useState<Set<string>>(new Set())

  const toggleCompany = (id: string) =>
    setClosedCompanies(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const toggleOrg = (id: string) =>
    setExpandedOrgIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  // org とその祖先を展開し、会社も開く
  const expandToOrg = (orgId: string) => {
    const org = viewOrgs.find(o => o.id === orgId)
    if (!org) return
    if (org.companyId)
      setClosedCompanies(prev => { const s = new Set(prev); s.delete(org.companyId!); return s })
    setExpandedOrgIds(prev => {
      const s = new Set(prev)
      s.add(orgId)
      let cur: Organization | undefined = org
      while (cur?.parentId) {
        cur = viewOrgs.find(o => o.id === cur!.parentId)
        if (cur) s.add(cur.id)
      }
      return s
    })
  }

  // ── キャンバスパネルを開く ──────────────────────────────────────
  // orgId から祖先をたどって最初に見つかったパネルを開く。
  // 祖先パネルが windowed モードの場合、その子孫の人物はインライン表示されないため、
  // orgId 専用パネルを作成（チップクリックと同等の操作）する。
  const openCanvasPanel = (orgId: string) => {
    const orgMap = new Map(viewOrgs.map(o => [o.id, o]))

    // 対象 org 自身にパネルがあるか確認
    const exactPanel = panels.find(pp => pp.orgId === orgId)
    if (exactPanel) {
      if (!exactPanel.open) setOrgOpen(orgId, true)
      return
    }

    // 祖先チェーンを上る
    let cur: Organization | undefined = orgMap.get(orgId)?.parentId
      ? orgMap.get(orgMap.get(orgId)!.parentId!)
      : undefined
    while (cur) {
      const p = panels.find(pp => pp.orgId === cur!.id)
      if (p) {
        if (!p.open) setOrgOpen(cur.id, true)
        if (p.childrenMode === 'windowed') {
          // windowed モード: 人物が祖先パネルにインライン表示されないため、
          // orgId のパネルを作成してスタンドアロンウィンドウとして表示する
          addCanvasPanel(orgId)
        }
        // inline モードなら人物は祖先パネル内に表示されているので追加不要
        return
      }
      cur = cur.parentId ? orgMap.get(cur.parentId) : undefined
    }
  }

  // ── 人物クリック（サイドバーから）──────────────────────────────
  // selectPerson が canvasLayoutStore.clearOrgSelection() を自動呼出し（useStore.ts）
  const handlePersonClick = (personId: string, orgId: string) => {
    selectPerson(personId)
    openCanvasPanel(orgId)
    requestScrollToPerson(personId)
  }

  // ── 組織クリック（サイドバーから）──────────────────────────────
  // キャンバスパネルにフォーカス + 組織選択。サイドバーツリー展開は別途 ▸ ボタンで行う。
  const handleOrgClick = (orgId: string) => {
    openCanvasPanel(orgId)
    selectOrg(orgId)
  }

  // ── キャンバス等の外部から人物が選択されたらサイドバーを展開 ──
  const afterOrgByCode = useMemo(() => buildOrgMap(afterOrganizations), [afterOrganizations])

  useEffect(() => {
    if (!selectedPersonId) return
    const person = persons.find(p => p.id === selectedPersonId)
    if (!person?.sfPersonId) return
    const row = allocationList.find(r => r.userId === person.sfPersonId && r.concurrentType !== '兼務')
             ?? allocationList.find(r => r.userId === person.sfPersonId)
    if (!row?.departmentCode) return
    const personOrg = afterOrgByCode.get(row.departmentCode)
      ?? viewOrgs.find(o => o.id === row.departmentCode)
    if (!personOrg) return

    expandToOrg(personOrg.id)

    // expandToOrg は setState なのでレンダー後に実行（setTimeout(0) = 次の macrotask = React 再描画後）
    const id = selectedPersonId
    setTimeout(() => {
      treeScrollRef.current
        ?.querySelector(`[data-sidebar-personid="${id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 0)
  }, [selectedPersonId]) // eslint-disable-line react-hooks/exhaustive-deps

  const beforeOrgByCode = useMemo(() => buildOrgMap(beforeOrgs), [beforeOrgs])
  const personBySfId    = useMemo(() => new Map(persons.map(p => [p.sfPersonId ?? '', p])), [persons])

  const afterMembersByOrgId = useMemo(() => {
    const map = new Map<string, Array<{ row: AllocationRow; person: Person }>>()
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
    const map = new Map<string, Set<string>>()
    for (const row of allocationList) {
      if (!row.prevDepartmentCode) continue
      const org = beforeOrgByCode.get(row.prevDepartmentCode)
      if (!org) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const set = map.get(org.id)
      if (set) set.add(person.id)
      else map.set(org.id, new Set([person.id]))
    }
    return map
  }, [allocationList, beforeOrgByCode, personBySfId])

  const assignedPersonIds = useMemo(() => {
    const ids = new Set<string>()
    for (const members of afterMembersByOrgId.values())
      for (const { person } of members) ids.add(person.id)
    return ids
  }, [afterMembersByOrgId])

  const handlePersonDragStart = (e: React.DragEvent, personId: string, orgId: string) => {
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) return
    const row = allocationList.find(r => r.userId === person.sfPersonId && r.concurrentType !== '兼務')
    const org = viewOrgs.find(o => o.id === orgId)
    e.dataTransfer.setData('application/json', JSON.stringify({
      personId,
      fromOrgId:       org?.id ?? '',
      fromCompanyId:   org?.companyId ?? '',
      affiliationType: 'primary',
      source:          'sidebar',
    }))
    e.dataTransfer.effectAllowed = 'move'
    void row
  }

  const [orgSearch, setOrgSearch] = useState('')
  const orgSearchLower = orgSearch.toLowerCase().trim()

  const hasPersonChanges = (personId: string) => {
    const sfId = persons.find(p => p.id === personId)?.sfPersonId ?? ''
    return allocationList.filter(r => r.userId === sfId).some(r => rowDiff(r).length > 0)
  }

  const getOrgChangeStatus = (orgId: string): 'changed' | 'new' | 'removed' | null => {
    const beforeIds = beforeMembersByOrgId.get(orgId) ?? new Set<string>()
    const afterIds  = new Set((afterMembersByOrgId.get(orgId) ?? []).map(m => m.person.id))
    if (beforeIds.size === 0 && afterIds.size > 0) return 'new'
    if (beforeIds.size > 0 && afterIds.size === 0) return 'removed'
    for (const pid of [...beforeIds, ...afterIds])
      if (!beforeIds.has(pid) || !afterIds.has(pid)) return 'changed'
    return null
  }

  const renderOrgNode = (org: Organization, depth: number): React.ReactNode => {
    const children     = viewOrgs.filter(o => o.parentId === org.id)
    const directPeople = afterMembersByOrgId.get(org.id) ?? []
    const isExpanded   = expandedOrgIds.has(org.id)
    const changeStatus = getOrgChangeStatus(org.id)
    const isNewOrg     = !beforeOrgs.find(o => o.id === org.id)
    const hasContent   = children.length > 0 || directPeople.length > 0

    // インデントは 1 階層あたり 8px、最大 40px（5 階層相当）で上限止め
    const indent       = Math.min(depth * 8, 40)
    const personIndent = Math.min(depth * 8 + 14, 54)

    return (
      <div key={org.id}>
        <div
          data-org-id={org.id}
          style={{ paddingLeft: indent }}
          className="flex items-center gap-0.5 rounded py-0.5 px-1 transition-colors hover:bg-gray-50"
        >
          <button
            onClick={() => hasContent && toggleOrg(org.id)}
            className="w-3.5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 text-[10px]"
          >
            {hasContent ? (isExpanded ? '▾' : '▸') : <span className="w-3.5" />}
          </button>
          <button
            onClick={() => handleOrgClick(org.id)}
            onDoubleClick={() => hasContent && toggleOrg(org.id)}
            className="flex-1 text-left text-xs py-0.5 truncate font-medium text-gray-700 hover:text-blue-600"
          >
            {org.name}
          </button>
          {isNewOrg && <span className="text-[10px] text-green-600 font-bold flex-shrink-0">新</span>}
          {directPeople.length > 0 && <span className="text-[10px] text-gray-400 flex-shrink-0">{directPeople.length}</span>}
          {changeStatus && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${CHANGE_DOT[changeStatus]}`} />}
        </div>

        {isExpanded && directPeople.map(({ row, person }) => {
          const isPersonSelected = selectedPersonId === person.id
          const isConcurrent     = row.concurrentType === '兼務'
          const hasChange        = hasPersonChanges(person.id)
          const band             = row.positionBand ?? row.band ?? ''
          return (
            <div
              key={row.rowId}
              data-sidebar-personid={person.id}
              draggable
              style={{ paddingLeft: personIndent }}
              className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-grab active:cursor-grabbing ${
                isPersonSelected ? 'bg-yellow-50' : 'hover:bg-gray-50'
              }`}
              onClick={() => handlePersonClick(person.id, org.id)}
              onDoubleClick={() => enterEditForPerson(person.id)}
              onContextMenu={e => handlePersonContextMenu(e, person.id)}
              onDragStart={e => handlePersonDragStart(e, person.id, org.id)}
            >
              <span className={`text-xs flex-shrink-0 leading-none ${isConcurrent ? 'text-purple-400' : 'text-blue-300'}`}>
                {isConcurrent ? '兼' : '—'}
              </span>
              <span className={`text-xs flex-1 truncate ${
                isPersonSelected ? 'font-semibold text-gray-800' : 'text-gray-600 hover:text-blue-600'
              }`}>
                {person.name}
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0">{band}</span>
              {hasChange && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
              {isPersonSelected && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />}
            </div>
          )
        })}

        {isExpanded && children.map(c => renderOrgNode(c, depth + 1))}
      </div>
    )
  }

  const searchResults = orgSearchLower ? [
    ...viewOrgs
      .filter(o => o.name.toLowerCase().includes(orgSearchLower))
      .map(o => ({
        type: 'org' as const, id: o.id, label: o.name,
        sub: o.companyId ?? '',
        orgId: o.id, personId: undefined as string | undefined,
      })),
    ...persons
      .filter(p => p.name.toLowerCase().includes(orgSearchLower))
      .map(p => {
        const row = allocationList.find(r => r.userId === p.sfPersonId && r.concurrentType !== '兼務')
        const org = row?.departmentCode ? afterOrgByCode.get(row.departmentCode) : null
        return {
          type: 'person' as const, id: p.id, label: p.name,
          sub: org?.name ?? '所属なし',
          orgId: org?.id, personId: p.id,
        }
      }),
  ] : []

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* 検索 */}
      <div className="flex-shrink-0 px-2 pt-2 pb-1.5">
        <input
          type="text"
          value={orgSearch}
          onChange={e => setOrgSearch(e.target.value)}
          placeholder="🔍 組織・人名"
          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
        />
      </div>

      {orgSearchLower ? (
        <div className="flex-1 overflow-y-auto min-h-0 px-1">
          {searchResults.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-3">該当なし</div>
          )}
          {searchResults.map(r => (
            <button
              key={`${r.type}-${r.id}`}
              onClick={() => {
                if (r.personId && r.orgId) {
                  handlePersonClick(r.personId, r.orgId)
                } else if (r.personId) {
                  selectPerson(r.personId)
                } else if (r.orgId) {
                  handleOrgClick(r.orgId)
                }
                if (r.orgId) expandToOrg(r.orgId)
                setOrgSearch('')
              }}
              className="w-full text-left flex items-center gap-1.5 px-1 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              <span className="text-gray-400 text-xs flex-shrink-0">
                {r.type === 'org' ? '🏢' : '👤'}
              </span>
              <span className="text-xs font-medium text-gray-700 truncate flex-1">{r.label}</span>
              <span className="text-xs text-gray-400 truncate flex-shrink-0 max-w-[60px]">{r.sub}</span>
            </button>
          ))}
        </div>
      ) : (
        <div ref={treeScrollRef} className="flex-1 overflow-y-auto min-h-0 px-1 space-y-1 pb-1">
          {(() => {
            const allCompanies = [...new Set(viewOrgs.map(o => o.companyId))]
              .filter(Boolean)
              .map(id => ({ id: id!, name: id! }))
            return allCompanies.map(company => {
              const rootOrgs = viewOrgs.filter(
                o => o.companyId === company.id && (!o.parentId || !viewOrgIds.has(o.parentId))
              )
              if (rootOrgs.length === 0) return null
              const isOpen = !closedCompanies.has(company.id)
              return (
                <div key={company.id} className="border border-gray-200 rounded">
                  <button
                    onClick={() => toggleCompany(company.id)}
                    className="w-full flex items-center justify-between px-2 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-bold text-gray-700 rounded transition-colors"
                  >
                    <span className="truncate">{company.name}</span>
                    <span className="text-gray-400 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
                  </button>
                  {isOpen && (
                    <div className="px-1 py-1">
                      {rootOrgs.map(org => renderOrgNode(org, 0))}
                    </div>
                  )}
                </div>
              )
            })
          })()}

          {/* 所属なし */}
          {(() => {
            const unassigned = persons.filter(p => !assignedPersonIds.has(p.id))
            if (unassigned.length === 0) return null
            return (
              <div className="border border-dashed border-gray-200 rounded">
                <div className="px-2 py-1 text-xs font-semibold text-gray-400 bg-gray-50 rounded-t">
                  所属なし ({unassigned.length})
                </div>
                <div className="px-1 py-0.5">
                  {unassigned.map(p => (
                    <button
                      key={p.id}
                      draggable
                      onClick={() => selectPerson(p.id)}
                      onDoubleClick={() => enterEditForPerson(p.id)}
                      onContextMenu={e => handlePersonContextMenu(e, p.id)}
                      className={`w-full text-left flex items-center gap-1 py-0.5 px-1 rounded text-xs transition-colors cursor-grab active:cursor-grabbing ${
                        selectedPersonId === p.id ? 'bg-yellow-50 text-gray-800 font-semibold' : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-gray-300 flex-shrink-0">—</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* 凡例 */}
          <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 pt-1 border-t border-gray-100 px-1 pb-1">
            <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-0.5 align-middle" />組織変更</span>
            <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-0.5 align-middle" />行変更</span>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-36"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={e => e.stopPropagation()}
        >
          {(() => {
            const p = persons.find(pp => pp.id === contextMenu.personId)
            return p
              ? <div className="px-3 py-1.5 border-b border-gray-100 text-xs font-semibold text-gray-500 truncate">{p.name}</div>
              : null
          })()}
          <button
            onClick={() => { enterEditForPerson(contextMenu.personId); setContextMenu(null) }}
            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
          >
            <span>✏️</span> 編集画面を開く
          </button>
        </div>
      )}
    </div>
  )
}
