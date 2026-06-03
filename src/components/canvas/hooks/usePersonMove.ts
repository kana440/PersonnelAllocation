import { useState } from 'react'
import { appService } from '../../../application/HRApplicationService'
import { TransferPersonOperation } from '../../../domain/commands/handlers/transferPerson'

interface PersonMoveDialog {
  fromRowId: number | null
  personId:  string
  toOrgId:   string
}

interface UsePersonMoveDeps {
  allocationList: { rowId: number; userId?: string; concurrentType?: string }[]
  persons:        { id: string; sfPersonId?: string }[]
}

export function usePersonMove({ allocationList, persons }: UsePersonMoveDeps) {
  const [personMoveDialog, setPersonMoveDialog] = useState<PersonMoveDialog | null>(null)

  const handlePersonMoveConfirm = (retireOriginal: boolean) => {
    if (!personMoveDialog) return
    const { fromRowId, personId, toOrgId } = personMoveDialog

    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) { setPersonMoveDialog(null); return }

    const sourceRow = fromRowId
      ? allocationList.find(r => r.rowId === fromRowId)
      : (allocationList.find(r => r.userId === person.sfPersonId && !r.concurrentType)
        ?? allocationList.find(r => r.userId === person.sfPersonId))
    if (!sourceRow) { setPersonMoveDialog(null); return }

    appService.executeOperation(
      new TransferPersonOperation(sourceRow.rowId, toOrgId, retireOriginal)
    )
    setPersonMoveDialog(null)
  }

  return { personMoveDialog, setPersonMoveDialog, handlePersonMoveConfirm }
}
