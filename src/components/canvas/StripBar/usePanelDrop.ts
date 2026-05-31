import { useState }        from 'react'
import { useStore }        from '../../../store/useStore'
import { appService }      from '../../../application/HRApplicationService'
import type { DragData }   from '../OrgViewContext'
import type { Organization } from '../../../domain/schemas'

/**
 * パネルカードへの人物・ポジションドロップ処理。
 * パネル並び替え用の 'application/x-panel-reorder' は呼び出し元で先に処理すること。
 */
export function usePanelDrop(currentOrg: Organization | undefined) {
  const [personDragOver, setPersonDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setPersonDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setPersonDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    setPersonDragOver(false)
    e.preventDefault()
    if (!currentOrg) return
    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
    if (data.fromOrgId === currentOrg.id) return
    const extCode = currentOrg.externalCode ?? currentOrg.id
    if (data.fromRowId) {
      appService.saveRow(data.fromRowId, { departmentCode: extCode })
      return
    }
    if (data.personId) {
      const { allocationList, persons } = useStore.getState()
      const person = persons.find(p => p.id === data.personId)
      if (!person?.sfPersonId) return
      const row = allocationList.find(r => r.userId === person.sfPersonId && r.concurrentType !== '兼務')
        ?? allocationList.find(r => r.userId === person.sfPersonId)
      if (row) appService.saveRow(row.rowId, { departmentCode: extCode })
    }
  }

  return { personDragOver, handleDragOver, handleDragLeave, handleDrop }
}
