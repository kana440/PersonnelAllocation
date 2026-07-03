import { useState, useMemo, useEffect, useRef } from 'react'
import type { Organization }  from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { useScopedStore }     from '../../../store/useScopedStore'
import { bindOperation }      from '@personnel/domain/commands/defs'
import { orgRestructureDef }  from '@personnel/domain/commands/defs/orgTransferDefs'
import { TR }                 from '@personnel/domain/transferReasonLabels'
import { appService }         from '../../../application/HRApplicationService'
import { AssignOrgModal }    from './AssignOrgModal'
import { AfterInitWizard }   from '../../setup/AfterInitWizard'
import { VirtualUnmappedList } from './VirtualUnmappedList'
import type { TreeNode }      from './OrgTreeNode'
import type { OrgMappingGroup } from '../../../application/setup/afterInit'

interface PickerTarget { label: string; rowIds: number[]; orgName: string }

// ── ツリー構築 ──────────────────────────────────────────────────────────────

function buildTree(
  beforeOrgs:      Organization[],
  prevCodeToRows:  Map<string, AllocationRow[]>,
  parentId:        string | null,
  orgIds:          Set<string>,
): TreeNode[] {
  const children = beforeOrgs.filter(o => (o.parentId ?? null) === parentId)
  return children
    .flatMap(org => {
      if (!orgIds.has(org.id)) return []
      const directRows = org.externalCode ? (prevCodeToRows.get(org.externalCode) ?? []) : []
      const childNodes = buildTree(beforeOrgs, prevCodeToRows, org.id, orgIds)
      const subtreeRowIds = [
        ...directRows.map(r => r.rowId),
        ...childNodes.flatMap(n => n.subtreeRowIds),
      ]
      if (subtreeRowIds.length === 0) return []
      return [{
        orgId:        org.id,
        orgName:      org.name,
        directRows,
        subtreeRowIds,
        subtreeCount: subtreeRowIds.length,
        children:     childNodes,
      }]
    })
    .sort((a, b) => a.orgName.localeCompare(b.orgName, 'ja'))
}

// ── コンポーネント ──────────────────────────────────────────────────────────

export function UnmappedOrgSection() {
  const { allocationList, afterOrganizations, beforeOrganizations, persons } = useScopedStore()

  const [selectedRowIds,   setSelectedRowIds]   = useState<Set<number>>(new Set())
  const [pickerFor,        setPickerFor]        = useState<PickerTarget | null>(null)
  const [bulkMapOpen,      setBulkMapOpen]      = useState(false)
  const [collapsed,        setCollapsed]        = useState(false)
  const [expandedOrgIds, setExpandedOrgIds] = useState<Set<string>>(new Set())
  const initializedRef = useRef(false)

  const afterOrgCodes = useMemo(
    () => new Set(afterOrganizations.filter(o => o.externalCode).map(o => o.externalCode!)),
    [afterOrganizations],
  )

  const personBySfId = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons],
  )

  const unresolvedRows = useMemo(
    () => allocationList.filter(row => {
      const code = row.departmentCode as string | undefined
      return !code || !afterOrgCodes.has(code)
    }),
    [allocationList, afterOrgCodes],
  )

  const prevCodeToRows = useMemo(() => {
    const map = new Map<string, AllocationRow[]>()
    for (const row of unresolvedRows) {
      const code = (row.prevDepartmentCode as string | undefined) ?? ''
      if (!code) continue
      const arr = map.get(code) ?? []; arr.push(row); map.set(code, arr)
    }
    return map
  }, [unresolvedRows])

  const treeRoots = useMemo(() => {
    const orgIds = new Set(beforeOrganizations.map(o => o.id))
    return buildTree(beforeOrganizations, prevCodeToRows, null, orgIds)
  }, [beforeOrganizations, prevCodeToRows])

  const orphanRows = useMemo(() => {
    const knownCodes = new Set(
      beforeOrganizations.map(o => o.externalCode).filter(Boolean),
    )
    return unresolvedRows.filter(row => {
      const code = (row.prevDepartmentCode as string | undefined) ?? ''
      return !code || !knownCodes.has(code)
    })
  }, [unresolvedRows, beforeOrganizations])

  // 全階層の組織ノードを初回ロード時に自動展開（ユーザーが一覧を即スクロールできるように）
  useEffect(() => {
    if (!initializedRef.current && treeRoots.length > 0) {
      initializedRef.current = true
      const collectAll = (nodes: TreeNode[]): string[] =>
        nodes.flatMap(n => [n.orgId, ...collectAll(n.children)])
      setExpandedOrgIds(new Set(collectAll(treeRoots)))
    }
  }, [treeRoots])

  const totalCount = unresolvedRows.length
  if (totalCount === 0) return null

  const handleToggleExpand = (orgId: string) => {
    setExpandedOrgIds(prev => {
      const next = new Set(prev)
      next.has(orgId) ? next.delete(orgId) : next.add(orgId)
      return next
    })
  }

  const handleToggleRow = (rowId: number) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return next
    })
  }

  const handleToggleAll = (rowIds: number[], select: boolean) => {
    setSelectedRowIds(prev => {
      const next = new Set(prev)
      if (select) rowIds.forEach(id => next.add(id))
      else        rowIds.forEach(id => next.delete(id))
      return next
    })
  }

  const handleAssign = (rowIds: number[], label: string, targetOrgId: string) => {
    const targetOrg  = afterOrganizations.find(o => o.id === targetOrgId)
    const targetCode = targetOrg?.externalCode
    if (!targetCode) return
    const commands = rowIds.map(rowId =>
      bindOperation(orgRestructureDef, rowId, {
        departmentCode: targetCode,
        transferReason: TR.DIV_TRANSFER_RESTRUCTURE,
      })
    )
    appService.executeBatch(
      `組改一括割当: ${label} → ${targetOrg?.name ?? targetCode}`,
      commands,
    )
    setPickerFor(null)
    setSelectedRowIds(prev => {
      const next = new Set(prev); rowIds.forEach(id => next.delete(id)); return next
    })
  }

  const handleBulkConfirm = (groups: OrgMappingGroup[]) => {
    const commands = groups
      .filter(g => g.newOrgCode)
      .flatMap(g => g.rowIds.map(rowId =>
        bindOperation(orgRestructureDef, rowId, {
          departmentCode: g.newOrgCode!,
          transferReason: TR.DIV_TRANSFER_RESTRUCTURE,
        })
      ))
    if (commands.length > 0) {
      appService.executeBatch('旧組織一括マップ', commands)
    }
    setBulkMapOpen(false)
  }

  return (
    <>
      <div className="border border-dashed border-orange-200 rounded">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-t transition-colors"
        >
          <span>旧組織（未割当）</span>
          <span className="flex items-center gap-1.5">
            <span className="font-normal text-orange-500">{totalCount}名</span>
            <button
              onClick={e => { e.stopPropagation(); setBulkMapOpen(true) }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-orange-300 text-orange-600 hover:bg-orange-100 transition-colors whitespace-nowrap"
            >
              一括マップ
            </button>
            <span className="text-orange-400">{collapsed ? '▸' : '▾'}</span>
          </span>
        </button>

        {!collapsed && (
          <div className="px-1 py-0.5">
            <VirtualUnmappedList
              treeRoots={treeRoots}
              orphanRows={orphanRows}
              expandedOrgIds={expandedOrgIds}
              selectedRowIds={selectedRowIds}
              personBySfId={personBySfId}
              onToggleExpand={handleToggleExpand}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
              onAssign={(ids, label, orgName) => setPickerFor({ rowIds: ids, label, orgName })}
            />
          </div>
        )}
      </div>

      {bulkMapOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-12 pb-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl p-6">
            <AfterInitWizard
              rowsToGroup={unresolvedRows}
              afterOrganizations={afterOrganizations}
              beforeOrganizations={beforeOrganizations}
              onConfirm={handleBulkConfirm}
              onCancel={() => setBulkMapOpen(false)}
            />
          </div>
        </div>
      )}

      {pickerFor && (
        <AssignOrgModal
          orgName={pickerFor.orgName}
          rowCount={pickerFor.rowIds.length}
          afterOrganizations={afterOrganizations}
          onClose={() => setPickerFor(null)}
          onSelect={orgId => handleAssign(pickerFor.rowIds, pickerFor.label, orgId)}
        />
      )}
    </>
  )
}
