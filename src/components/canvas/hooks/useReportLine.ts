import { useState, useMemo, useEffect, useRef } from 'react'
import type { Organization, Person } from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'

interface UseReportLineDeps {
  allocationList: AllocationRow[]
  personBySfId:   Map<string, Person>
  afterOrgByCode: Map<string, Organization>
  canvasMode:     string
  selectedPersonId: string | null
}

export function useReportLine({ allocationList, personBySfId, afterOrgByCode, canvasMode, selectedPersonId }: UseReportLineDeps) {
  const [expandedNodes,    setExpandedNodes]    = useState<Set<string>>(new Set())
  const [reportLineRootId, setReportLineRootId] = useState<string | null>(null)

  const isReportLineInternalSelect = useRef(false)
  const rlManagerMapRef            = useRef(new Map<string, string>())
  const reportLineRootIdRef        = useRef<string | null>(null)

  const rlPosCodeToPersonId = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of allocationList) {
      if (row.concurrentType) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person || !row.positionCode) continue
      map.set(row.positionCode, person.id)
    }
    return map
  }, [allocationList, personBySfId])

  const rlManagerMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of allocationList) {
      if (row.concurrentType) continue
      const person = personBySfId.get(row.userId ?? '')
      if (!person || !row.managerPositionCode) continue
      const mgrId = rlPosCodeToPersonId.get(row.managerPositionCode)
      if (mgrId && mgrId !== person.id) map.set(person.id, mgrId)
    }
    return map
  }, [allocationList, personBySfId, rlPosCodeToPersonId])

  rlManagerMapRef.current     = rlManagerMap
  reportLineRootIdRef.current = reportLineRootId

  const rlRootManagerId = reportLineRootId != null ? rlManagerMap.get(reportLineRootId) : undefined

  const rlRootPersonInfo = useMemo(() => {
    if (!reportLineRootId) return null
    const person = [...personBySfId.values()].find(p => p.id === reportLineRootId)
    if (!person?.sfPersonId) return null
    const row = allocationList.find(r => r.userId === person.sfPersonId && !r.concurrentType)
              ?? allocationList.find(r => r.userId === person.sfPersonId)
    const org = row?.departmentCode ? afterOrgByCode.get(row.departmentCode) : null
    return { name: person.name, orgName: org?.name ?? null }
  }, [reportLineRootId, personBySfId, allocationList, afterOrgByCode])

  useEffect(() => {
    if (canvasMode !== 'レポートライン' || !selectedPersonId) return
    if (isReportLineInternalSelect.current) { isReportLineInternalSelect.current = false; return }
    const mgr = rlManagerMapRef.current
    const ancestors: string[] = []
    let cur = mgr.get(selectedPersonId)
    while (cur) { ancestors.push(cur); cur = mgr.get(cur) }
    const rootId = reportLineRootIdRef.current
    const inTree = rootId == null || rootId === selectedPersonId || ancestors.includes(rootId)
    if (!inTree) {
      const parentId = mgr.get(selectedPersonId)
      setReportLineRootId(parentId ?? selectedPersonId)
      setExpandedNodes(prev => new Set([...prev, ...(parentId ? [parentId] : []), ...ancestors]))
    } else {
      setExpandedNodes(prev => new Set([...prev, ...ancestors]))
    }
  }, [selectedPersonId, canvasMode])

  return {
    expandedNodes, setExpandedNodes,
    reportLineRootId, setReportLineRootId,
    isReportLineInternalSelect,
    rlManagerMap, rlRootManagerId, rlRootPersonInfo,
  }
}
