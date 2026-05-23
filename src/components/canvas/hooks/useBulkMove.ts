import { useState } from 'react'
import type { Organization } from '../../../domain/schemas'
import type { AllocationRow, AfterValues } from '../../../domain/allocationRow'
import { appService } from '../../../application/HRApplicationService'
import { MoveRowsToOrgOperation } from '../../../domain/operation/handlers/moveRowsToOrg'
import type { BulkMoveConfirmParams } from '../modals/BulkMoveModal'

interface UseBulkMoveDeps {
  allocationList:       AllocationRow[]
  afterOrgByCode:       Map<string, Organization>
  allAfterOrgsUnscoped: Organization[]
}

export function useBulkMove({ allocationList, afterOrgByCode, allAfterOrgsUnscoped }: UseBulkMoveDeps) {
  const [bulkMoveSourceId, setBulkMoveSourceId] = useState<string | null>(null)

  const handleBulkMoveConfirm = ({ mode, selectedIds: selectedIdSet, targetId, retireOriginal }: BulkMoveConfirmParams) => {
    const selectedIds = [...selectedIdSet]
    const targetOrg  = allAfterOrgsUnscoped.find(o => o.id === targetId)
    const targetCode = targetOrg?.externalCode ?? targetOrg?.id ?? targetId

    if (mode === 'positions') {
      const op     = new MoveRowsToOrgOperation(selectedIds, targetId, `${selectedIds.length}ポジション → ${targetOrg?.name ?? ''}`)
      const result = appService.executeOperation(op)
      if (!result.ok) return
    } else {
      const selectedRowInfos = selectedIds.map(rowId => {
        const row = allocationList.find(r => r.rowId === rowId)
        return row ? {
          rowId, userId: row.userId,
          posCode:      row.positionCode,
          mgrCode:      row.managerPositionCode,
          title:        row.localJobTitle || row.officialPositionCode || '',
          officialCode: row.officialPositionCode,
          band:         row.positionBand,
        } : null
      }).filter((x): x is NonNullable<typeof x> => x !== null)

      const targetRows     = allocationList.filter(r => afterOrgByCode.get(r.departmentCode ?? '')?.id === targetId && !!r.positionCode)
      const targetPosSet   = new Set(targetRows.map(r => r.positionCode).filter(Boolean))
      const topTargetRow   = targetRows.find(r => !r.managerPositionCode || !targetPosSet.has(r.managerPositionCode))
      const defaultMgrCode = topTargetRow?.positionCode
      const oldToNewPosCode = new Map<string, string>()
      const oldRowToNewRow  = new Map<number, number>()

      for (const info of selectedRowInfos) {
        if (!info.userId) continue
        const currentRow = allocationList.find(r => r.rowId === info.rowId)
        if (currentRow?.positionCode) appService.unassignPersonFromPosition(info.rowId)
        appService.createVacantPosition(targetCode, info.title)
        const snap1     = appService.getSnapshot()
        const newVacant = [...snap1.allocationList].reverse().find(r => !r.userId && r.departmentCode === targetCode)
        if (!newVacant) continue
        if (info.posCode) oldToNewPosCode.set(info.posCode, newVacant.positionCode ?? `_pos_${newVacant.rowId}`)
        oldRowToNewRow.set(info.rowId, newVacant.rowId)
        const updates: AfterValues = {}
        if (info.officialCode) updates.officialPositionCode = info.officialCode
        if (info.band)         updates.positionBand = info.band
        if (Object.keys(updates).length > 0) appService.saveRow(newVacant.rowId, updates)
        appService.assignPersonToVacantPosition(newVacant.rowId, info.userId)
      }

      for (const info of selectedRowInfos) {
        const newRowId   = oldRowToNewRow.get(info.rowId)
        if (!newRowId) continue
        const newMgrCode = info.mgrCode ? (oldToNewPosCode.get(info.mgrCode) ?? defaultMgrCode) : defaultMgrCode
        if (newMgrCode) appService.saveRow(newRowId, { managerPositionCode: newMgrCode })
      }

      if (retireOriginal) {
        for (const info of selectedRowInfos) {
          const snap      = appService.getSnapshot()
          const vacantRow = snap.allocationList.find(r => r.rowId === info.rowId && !r.userId)
          if (vacantRow) appService.removePosition(info.rowId)
        }
      }
    }

    setBulkMoveSourceId(null)
  }

  return { bulkMoveSourceId, setBulkMoveSourceId, handleBulkMoveConfirm }
}
