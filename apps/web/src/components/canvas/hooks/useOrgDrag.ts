import { useState } from 'react'
import type { Organization } from '@personnel/domain/schemas'
import type { Person } from '@personnel/domain/schemas'
import type { AfterValues } from '@personnel/domain/allocationRow'
import type { DragData } from '../OrgViewContext'

interface UseOrgDragDeps {
  organizations:                Organization[]
  persons:                      Person[]
  saveRow:                      (rowId: number, changes: AfterValues) => void
  assignPersonToVacantPosition: (rowId: number, sfId: string) => void
  openPersonMoveDialog:         (fromRowId: number | null, personId: string, toOrgId: string) => void
}

export function useOrgDrag({
  organizations, persons, saveRow, assignPersonToVacantPosition, openPersonMoveDialog,
}: UseOrgDragDeps) {
  const [dragOverOrgId,       setDragOverOrgId]       = useState<string | null>(null)
  const [highlightedOrgId,    setHighlightedOrgId]    = useState<string | null>(null)
  const [dragOverVacantRowId, setDragOverVacantRowId] = useState<number | null>(null)

  const handleDragOver = (e: React.DragEvent, orgId: string) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
    setDragOverOrgId(orgId)
  }

  const handleDragLeave = () => setDragOverOrgId(null)

  const handleDrop = (e: React.DragEvent, toOrgId: string) => {
    e.preventDefault(); setDragOverOrgId(null)
    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
    const { dragType, fromOrgId, fromRowId } = data

    const toOrg = organizations.find(o => o.id === toOrgId)
    if (!toOrg) return

    if (dragType === 'position' && fromRowId) {
      if (fromOrgId === toOrgId) return
      saveRow(fromRowId, { departmentCode: toOrg.externalCode ?? toOrg.id })
      setHighlightedOrgId(toOrgId); setTimeout(() => setHighlightedOrgId(null), 800)
      return
    }

    if (data.personId && fromOrgId !== toOrgId) {
      openPersonMoveDialog(fromRowId ?? null, data.personId, toOrgId)
    }
  }

  const handleDropOnVacantSlot = (e: React.DragEvent, vacantRowId: number) => {
    e.preventDefault(); e.stopPropagation()
    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
    const person = persons.find(p => p.id === data.personId)
    if (!person?.sfPersonId) return
    assignPersonToVacantPosition(vacantRowId, person.sfPersonId)
  }

  return {
    dragOverOrgId, setDragOverOrgId,
    highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
  }
}
