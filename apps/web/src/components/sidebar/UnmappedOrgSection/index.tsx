import { useState, useMemo }  from 'react'
import type { Organization }  from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { useScopedStore }     from '../../../store/useScopedStore'
import { bindOperation }      from '@personnel/domain/commands/defs'
import { orgRestructureDef }  from '@personnel/domain/commands/defs/orgTransferDefs'
import { TR }                 from '@personnel/domain/transferReasonLabels'
import { appService }         from '../../../application/HRApplicationService'
import { OrgPickerModal }     from '../../common/OrgPickerModal'
import { OrgTreeNode }        from './OrgTreeNode'
import type { TreeNode }      from './OrgTreeNode'

interface PickerTarget { label: string; rowIds: number[] }

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

  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set())
  const [pickerFor,      setPickerFor]      = useState<PickerTarget | null>(null)
  const [collapsed,      setCollapsed]      = useState(false)

  const afterOrgCodes = useMemo(
    () => new Set(afterOrganizations.filter(o => o.externalCode).map(o => o.externalCode!)),
    [afterOrganizations],
  )

  const personBySfId = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons],
  )

  // 未解決行（departmentCode が新組織に存在しない行）
  const unresolvedRows = useMemo(
    () => allocationList.filter(row => {
      const code = row.departmentCode as string | undefined
      return !code || !afterOrgCodes.has(code)
    }),
    [allocationList, afterOrgCodes],
  )

  // prevDepartmentCode → 行リスト
  const prevCodeToRows = useMemo(() => {
    const map = new Map<string, AllocationRow[]>()
    for (const row of unresolvedRows) {
      const code = (row.prevDepartmentCode as string | undefined) ?? ''
      if (!code) continue
      const arr = map.get(code) ?? []; arr.push(row); map.set(code, arr)
    }
    return map
  }, [unresolvedRows])

  // 旧組織ツリー（未割当がいる枝のみ）
  const treeRoots = useMemo(() => {
    const orgIds = new Set(beforeOrganizations.map(o => o.id))
    return buildTree(beforeOrganizations, prevCodeToRows, null, orgIds)
  }, [beforeOrganizations, prevCodeToRows])

  // prevDepartmentCode が beforeOrganizations に存在しない孤立行
  const orphanRows = useMemo(() => {
    const knownCodes = new Set(
      beforeOrganizations.map(o => o.externalCode).filter(Boolean),
    )
    return unresolvedRows.filter(row => {
      const code = (row.prevDepartmentCode as string | undefined) ?? ''
      return !code || !knownCodes.has(code)
    })
  }, [unresolvedRows, beforeOrganizations])

  const totalCount = unresolvedRows.length
  if (totalCount === 0) return null

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
            <span className="text-orange-400">{collapsed ? '▸' : '▾'}</span>
          </span>
        </button>

        {!collapsed && (
          <div className="px-1 py-0.5 space-y-0.5 max-h-56 overflow-y-auto">
            {treeRoots.map(node => (
              <OrgTreeNode
                key={node.orgId}
                node={node}
                depth={0}
                selectedRowIds={selectedRowIds}
                personBySfId={personBySfId}
                onToggleRow={handleToggleRow}
                onToggleAll={handleToggleAll}
                onAssign={(ids, label) => setPickerFor({ rowIds: ids, label })}
              />
            ))}

            {/* beforeOrganizations に存在しない孤立行（旧組織コード不明）*/}
            {orphanRows.length > 0 && (
              <OrgTreeNode
                key="__orphan__"
                node={{
                  orgId:        '__orphan__',
                  orgName:      'その他',
                  directRows:   orphanRows,
                  subtreeRowIds: orphanRows.map(r => r.rowId),
                  subtreeCount: orphanRows.length,
                  children:     [],
                }}
                depth={0}
                selectedRowIds={selectedRowIds}
                personBySfId={personBySfId}
                onToggleRow={handleToggleRow}
                onToggleAll={handleToggleAll}
                onAssign={(ids, label) => setPickerFor({ rowIds: ids, label })}
              />
            )}
          </div>
        )}
      </div>

      {pickerFor && (
        <OrgPickerModal
          open
          alreadyAddedIds={new Set()}
          title={`「${pickerFor.label}」の移動先を選択`}
          confirmLabel="この組織に移動"
          onClose={() => setPickerFor(null)}
          onSelect={orgId => handleAssign(pickerFor.rowIds, pickerFor.label, orgId)}
        />
      )}
    </>
  )
}
