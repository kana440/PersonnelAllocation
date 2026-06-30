import { useState } from 'react'
import type { Organization } from '@personnel/domain/schemas'
import type { Person } from '@personnel/domain/schemas'
import type { AfterValues } from '@personnel/domain/allocationRow'
import type { DragData } from '../OrgViewContext'

interface UseOrgDragDeps {
  organizations:                Organization[]
  persons:                      Person[]
  saveRow:                      (rowId: number, changes: AfterValues) => void
  assignPersonToVacantPosition: (rowId: number, sfId: string, opts?: { leaveSourceVacant?: boolean; overrideBand?: boolean }) => void
  openPersonMoveDialog:         (fromRowId: number | null, personId: string, toOrgId: string) => void
  /** 旧組織未割当セクションから複数行を一括ドロップしたとき呼ばれる */
  onUnmappedBulkDrop?:          (rowIds: number[], toOrg: Organization) => void
  /** ドラッグによる空席アサイン時にバンドが変わるかチェックする（未指定時はチェックしない） */
  checkBandChange?:             (vacantRowId: number, sfId: string) => { from: string; to: string } | null
  /** バンド変更確認が必要なとき呼ばれる。呼び出し側でダイアログを表示し onOverride/onKeep を呼ぶ */
  onBandChangeRequest?:         (info: { from: string; to: string; onOverride: () => void; onKeep: () => void }) => void
  /** FloatingAbsencePanel からドラッグされた行を org に復帰させる（lockCancel + 組織設定） */
  onAbsenceReturn?:             (fromRowId: number, toOrg: Organization) => void
}

export function useOrgDrag({
  organizations, persons, saveRow, assignPersonToVacantPosition, openPersonMoveDialog,
  onUnmappedBulkDrop, checkBandChange, onBandChangeRequest, onAbsenceReturn,
}: UseOrgDragDeps) {
  const [dragOverOrgId,       setDragOverOrgId]       = useState<string | null>(null)
  const [highlightedOrgId,    setHighlightedOrgId]    = useState<string | null>(null)
  const [dragOverVacantRowId, setDragOverVacantRowId] = useState<number | null>(null)
  const [dropPersonRowId,     setDropPersonRowId]     = useState<number | null>(null)
  const [dropGapBelowRowId,   setDropGapBelowRowId]   = useState<number | null>(null)

  const clearAllDropTargets = () => {
    setDragOverOrgId(null)
    setDropPersonRowId(null)
    setDropGapBelowRowId(null)
  }

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

    const toOrg = organizations.find(o => o.id === toOrgId)
    if (!toOrg) return

    // 旧組織未割当セクションからの一括ドロップ
    if (data.rowIds && data.rowIds.length > 0) {
      onUnmappedBulkDrop?.(data.rowIds, toOrg)
      setHighlightedOrgId(toOrgId); setTimeout(() => setHighlightedOrgId(null), 800)
      return
    }

    const { dragType, fromOrgId, fromRowId } = data

    // 不在ボックスからの復帰ドラッグ
    if (data.fromAbsence && fromRowId) {
      onAbsenceReturn?.(fromRowId, toOrg)
      setHighlightedOrgId(toOrgId); setTimeout(() => setHighlightedOrgId(null), 800)
      return
    }

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

    const sfId = person.sfPersonId

    // バンド変更チェック
    const bandChange = checkBandChange?.(vacantRowId, sfId)
    if (bandChange && onBandChangeRequest) {
      onBandChangeRequest({
        from:       bandChange.from,
        to:         bandChange.to,
        onOverride: () => assignPersonToVacantPosition(vacantRowId, sfId, { overrideBand: true }),
        onKeep:     () => assignPersonToVacantPosition(vacantRowId, sfId, { overrideBand: false }),
      })
    } else {
      assignPersonToVacantPosition(vacantRowId, sfId)
    }
  }

  return {
    dragOverOrgId, setDragOverOrgId,
    highlightedOrgId,
    dragOverVacantRowId, setDragOverVacantRowId,
    dropPersonRowId, setDropPersonRowId,
    dropGapBelowRowId, setDropGapBelowRowId,
    handleDragOver, handleDragLeave, handleDrop, handleDropOnVacantSlot,
    clearAllDropTargets,
  }
}
