import { useState, useMemo } from 'react'
import type { AllocationRow, AfterValues } from '../../../domain/allocationRow'
import type { Person, Organization } from '../../../domain/schemas'

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

interface ReportLineViewProps {
  allocationList:              AllocationRow[]
  personBySfId:                Map<string, Person>
  afterOrgByCode:              Map<string, Organization>
  organizations:               Organization[]
  persons:                     Person[]
  selectedPersonId:            string | null
  selectPerson:                (id: string) => void
  saveRow:                     (rowId: number, changes: AfterValues) => void
  handlePersonDoubleClick:     (id: string) => void
  handlePersonContextMenu:     (e: React.MouseEvent, id: string) => void
  reportLineRootId:            string | null
  setReportLineRootId:         (id: string | null) => void
  rlRootManagerId:             string | undefined
  expandedNodes:               Set<string>
  setExpandedNodes:            React.Dispatch<React.SetStateAction<Set<string>>>
  isReportLineInternalSelect:  React.MutableRefObject<boolean>
}

export function ReportLineView({
  allocationList, personBySfId, afterOrgByCode, organizations, persons,
  selectedPersonId, selectPerson, saveRow,
  handlePersonDoubleClick, handlePersonContextMenu,
  reportLineRootId, setReportLineRootId, rlRootManagerId,
  expandedNodes, setExpandedNodes, isReportLineInternalSelect,
}: ReportLineViewProps) {
  const [dragOverPersonId, setDragOverPersonId] = useState<string | null>(null)

  const scopeRowMap = useMemo(() => {
    const map = new Map<string, { row: AllocationRow; orgId: string }>()
    for (const row of allocationList) {
      if (row.concurrentType) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person) continue
      const org = row.departmentCode ? afterOrgByCode.get(row.departmentCode) : undefined
      map.set(person.id, { row, orgId: org?.id ?? '' })
    }
    for (const row of allocationList) {
      if (!row.concurrentType) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person || map.has(person.id)) continue
      const org = row.departmentCode ? afterOrgByCode.get(row.departmentCode) : undefined
      map.set(person.id, { row, orgId: org?.id ?? '' })
    }
    return map
  }, [allocationList, afterOrgByCode, personBySfId])

  const orgColorMap = useMemo(() => {
    const seen = new Map<string, number>()
    let i = 0
    for (const sr of scopeRowMap.values()) {
      if (!seen.has(sr.orgId)) seen.set(sr.orgId, i++)
    }
    return Object.fromEntries([...seen.entries()].map(([id, idx]) => [id, ORG_PALETTE[idx % ORG_PALETTE.length]]))
  }, [scopeRowMap])

  const posCodeToPersonId = useMemo(() => {
    const map = new Map<string, string>()
    for (const [pid, sr] of scopeRowMap) {
      if (sr.row.positionCode) map.set(sr.row.positionCode, pid)
    }
    return map
  }, [scopeRowMap])

  const managerMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const [pid, sr] of scopeRowMap) {
      const mgrCode = sr.row.managerPositionCode
      if (!mgrCode) continue
      const mgrId = posCodeToPersonId.get(mgrCode)
      if (mgrId && mgrId !== pid) map.set(pid, mgrId)
    }
    return map
  }, [scopeRowMap, posCodeToPersonId])

  const directReportsMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const pid of scopeRowMap.keys()) map.set(pid, [])
    for (const [pid, mgrId] of managerMap) {
      map.get(mgrId)?.push(pid)
    }
    return map
  }, [scopeRowMap, managerMap])

  const globalRoots = useMemo(
    () => [...scopeRowMap.keys()].filter(pid => !managerMap.has(pid)),
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
    const title         = sr.row.officialPositionCode
    const band          = sr.row.positionBand ?? sr.row.band
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
