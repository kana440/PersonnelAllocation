import { useState, useEffect, useRef } from 'react'
import { normalizeSearch } from '../../utils/normalizeSearch'
import { useScopedStore } from '../../store/useScopedStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { useOrgTreeState } from './hooks/useOrgTreeState'
import { useCanvasPanelNav } from './hooks/useCanvasPanelNav'
import { useSidebarMemberData } from './hooks/useSidebarMemberData'
import { VirtualOrgTree, type VirtualOrgTreeHandle } from './VirtualOrgTree'
import { UnmappedOrgSection } from './UnmappedOrgSection'

export function OrgSearchSidebar() {
  const { selectPerson, selectedCardRowId, selectCard, enterOperationPanel } = useScopedStore()

  const {
    viewOrgs, afterOrgByCode, afterMembersByOrgId,
    subtreeCountByOrgId, persons, allocationList,
  } = useSidebarMemberData()

  const { closedCompanies, toggleCompany, expandedOrgIds, toggleOrg, expandToOrg } = useOrgTreeState(viewOrgs)
  const { handlePersonClick, handleOrgClick, openCanvasPanel } = useCanvasPanelNav(viewOrgs, selectPerson)
  const { requestScrollToRow, showVacantPositions, toggleShowVacantPositions } = useCanvasLayoutStore()

  const treeRef = useRef<VirtualOrgTreeHandle>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; personId: string } | null>(null)
  const [orgSearch, setOrgSearch] = useState('')

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

  useEffect(() => {
    if (!selectedCardRowId) return
    const t0 = performance.now()
    console.log('[perf] OrgSearchSidebar effect start (selectedCardRowId changed)', selectedCardRowId)
    const row = allocationList.find(r => r.rowId === selectedCardRowId)
    if (!row?.departmentCode) return
    const personOrg = afterOrgByCode.get(row.departmentCode)
      ?? viewOrgs.find(o => o.id === row.departmentCode)
    if (!personOrg) return
    expandToOrg(personOrg.id)
    console.log('[perf] after expandToOrg', performance.now() - t0, 'ms')
    openCanvasPanel(personOrg.id)
    console.log('[perf] after openCanvasPanel', performance.now() - t0, 'ms')
    requestScrollToRow(selectedCardRowId)
    const id = selectedCardRowId
    // 展開反映後にスクロール
    setTimeout(() => treeRef.current?.scrollToRowId(id), 0)
    console.log('[perf] OrgSearchSidebar effect done', performance.now() - t0, 'ms')
  }, [selectedCardRowId]) // eslint-disable-line react-hooks/exhaustive-deps

  const orgSearchLower = normalizeSearch(orgSearch.trim())
  const searchResults = orgSearchLower ? [
    ...viewOrgs
      .filter(o => normalizeSearch(o.name).includes(orgSearchLower))
      .map(o => ({
        type: 'org' as const, id: o.id, label: o.name,
        sub: o.companyId ?? '',
        orgId: o.id, rowId: undefined as number | undefined,
      })),
    ...persons
      .filter(p => normalizeSearch(p.name).includes(orgSearchLower))
      .map(p => {
        const row = allocationList.find(r => r.userId === p.sfPersonId && r.concurrentType !== '兼務')
        const org = row?.departmentCode ? afterOrgByCode.get(row.departmentCode) : null
        return {
          type: 'person' as const, id: p.id, label: p.name,
          sub: org?.name ?? '所属なし',
          orgId: org?.id, rowId: row?.rowId,
        }
      }),
  ] : []

  const treeFooter = (
    <div className="flex flex-wrap gap-x-3 text-[10px] text-gray-400 pt-1 border-t border-gray-100 px-2 pb-1 mt-1">
      <span><span className="text-blue-400 mr-0.5">↑</span>役職変更</span>
      <span><span className="text-orange-500 font-bold mr-0.5">!</span>異動事由未入力</span>
    </div>
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* 検索 */}
      <div className="flex-shrink-0 px-2 pt-2 pb-1.5">
        <div className="flex gap-1 items-center">
          <input
            type="text"
            value={orgSearch}
            onChange={e => setOrgSearch(e.target.value)}
            placeholder="🔍 組織・人名"
            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={toggleShowVacantPositions}
            className={`flex-shrink-0 px-1.5 py-1 rounded text-[10px] font-medium transition-colors border ${
              showVacantPositions
                ? 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100'
                : 'text-gray-400 border-gray-200 hover:bg-gray-50 hover:text-gray-600'
            }`}
            title={showVacantPositions ? '空席ポジションを非表示' : '空席ポジションを表示'}
          >空席</button>
        </div>
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
                if (r.rowId != null && r.orgId) {
                  handlePersonClick(r.rowId, r.orgId)
                } else if (r.rowId != null) {
                  selectCard(r.rowId, 'after')
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
        <VirtualOrgTree
          ref={treeRef}
          className="flex-1 px-1 pb-1"
          viewOrgs={viewOrgs}
          membersByOrgId={afterMembersByOrgId}
          subtreeCountByOrgId={subtreeCountByOrgId}
          showVacantPositions={showVacantPositions}
          expandedOrgIds={expandedOrgIds}
          closedCompanies={closedCompanies}
          selectedCardRowId={selectedCardRowId}
          toggleCompany={toggleCompany}
          toggleOrg={toggleOrg}
          onOrgClick={handleOrgClick}
          onPersonClick={handlePersonClick}
          onPersonDoubleClick={enterEditForPerson}
          onPersonContextMenu={handlePersonContextMenu}
          onPersonDragStart={handlePersonDragStart}
          footer={treeFooter}
        />
      )}

      {/* 旧組織（未割当）: 検索モード切り替えに関わらず常時同一インスタンスで表示。
          max-h-[45%] でサイドバー高さの上限を設け、ツリー検索エリアが潰れないようにする。 */}
      <div className="flex-shrink-0 px-1 overflow-hidden" style={{ maxHeight: '45%' }}>
        <UnmappedOrgSection />
      </div>

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
