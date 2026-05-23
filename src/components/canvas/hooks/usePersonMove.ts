import { useState } from 'react'
import type { Organization } from '../../../domain/schemas'
import type { Person } from '../../../domain/schemas'
import type { AllocationRow, AfterValues } from '../../../domain/allocationRow'
import { appService } from '../../../application/HRApplicationService'

interface PersonMoveDialog {
  fromRowId: number | null
  personId:  string
  toOrgId:   string
}

interface UsePersonMoveDeps {
  persons:              Person[]
  allocationList:       AllocationRow[]
  afterOrgByCode:       Map<string, Organization>
  allAfterOrgsUnscoped: Organization[]
}

export function usePersonMove({ persons, allocationList, afterOrgByCode, allAfterOrgsUnscoped }: UsePersonMoveDeps) {
  const [personMoveDialog, setPersonMoveDialog] = useState<PersonMoveDialog | null>(null)

  const handlePersonMoveConfirm = (retireOriginal: boolean) => {
    if (!personMoveDialog) return
    const { fromRowId, personId, toOrgId } = personMoveDialog
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) { setPersonMoveDialog(null); return }

    const toOrg     = allAfterOrgsUnscoped.find(o => o.id === toOrgId)
    const toOrgCode = toOrg?.externalCode ?? toOrg?.id ?? toOrgId

    const fromRow = fromRowId
      ? allocationList.find(r => r.rowId === fromRowId)
      : (allocationList.find(r => r.userId === person.sfPersonId && !r.concurrentType)
        ?? allocationList.find(r => r.userId === person.sfPersonId))
    if (!fromRow) { setPersonMoveDialog(null); return }

    const actualFromRowId = fromRow.rowId
    const hasPosition     = !!fromRow.positionCode
    const posTitle        = fromRow.localJobTitle || fromRow.officialPositionCode || ''
    const posOfficialCode = fromRow.officialPositionCode
    const posBand         = fromRow.positionBand

    const targetRows     = allocationList.filter(r => afterOrgByCode.get(r.departmentCode ?? '')?.id === toOrgId && !!r.positionCode)
    const targetPosSet   = new Set(targetRows.map(r => r.positionCode).filter(Boolean))
    const topRow         = targetRows.find(r => !r.managerPositionCode || !targetPosSet.has(r.managerPositionCode))
    const defaultMgrCode = topRow?.positionCode

    if (hasPosition) appService.unassignPersonFromPosition(actualFromRowId)

    appService.createVacantPosition(toOrgCode, posTitle)
    const snap1     = appService.getSnapshot()
    const newVacant = [...snap1.allocationList].reverse().find(r => !r.userId && r.departmentCode === toOrgCode)

    if (newVacant) {
      const updates: AfterValues = {}
      if (posOfficialCode) updates.officialPositionCode = posOfficialCode
      if (posBand)         updates.positionBand = posBand
      if (defaultMgrCode)  updates.managerPositionCode = defaultMgrCode
      if (Object.keys(updates).length > 0) appService.saveRow(newVacant.rowId, updates)
      appService.assignPersonToVacantPosition(newVacant.rowId, person.sfPersonId)
    }

    if (retireOriginal && hasPosition) {
      const snap2     = appService.getSnapshot()
      const vacantRow = snap2.allocationList.find(r => r.rowId === actualFromRowId && !r.userId)
      if (vacantRow) appService.removePosition(actualFromRowId)
    }

    setPersonMoveDialog(null)
  }

  return { personMoveDialog, setPersonMoveDialog, handlePersonMoveConfirm }
}
