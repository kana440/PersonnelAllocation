import { createContext, useContext } from 'react'
import type { Organization } from '../../domain/schemas'
import type { Person } from '../../domain/schemas'
import type { AllocationRow } from '../../domain/allocationRow'
import type { PositionContext } from '../../application/positionPatterns'

export interface DragData {
  dragType?:       'person' | 'position'
  personId:        string
  fromOrgId:       string
  fromCompanyId:   string
  affiliationType: 'primary' | 'concurrent'
  source?:         'before' | 'after' | 'reportLine' | 'sidebar' | 'excel'
  fromRowId?:      number
}

export interface PositionEntry {
  row:    AllocationRow
  person: Person | null
  depth:  number
}

export interface MemberEntry {
  row:    AllocationRow
  person: Person
}

export interface OrgViewContextValue {
  organizations:            Organization[]
  positionContext:          PositionContext
  positionTreeByOrgId:      Map<string, PositionEntry[]>
  afterMembersByOrgId:      Map<string, MemberEntry[]>
  dragOverOrgId:            string | null
  setDragOverOrgId:         (id: string | null) => void
  highlightedOrgId:         string | null
  dragOverVacantRowId:      number | null
  setDragOverVacantRowId:   (id: number | null) => void
  handleDragOver:           (e: React.DragEvent, orgId: string) => void
  handleDragLeave:          () => void
  handleDrop:               (e: React.DragEvent, orgId: string) => void
  handleDropOnVacantSlot:   (e: React.DragEvent, rowId: number) => void
  addPositionOrgId:         string | null
  setAddPositionOrgId:      (id: string | null) => void
  addPositionTitle:         string
  setAddPositionTitle:      (t: string) => void
  topPositionCodeOfOrg:     (orgId: string) => string | undefined
  setBulkMoveSourceId:      (id: string | null) => void
  setConfirmDialog:         (d: { message: string; onConfirm: () => void } | null) => void
  isSelectMode:             boolean
  selectedPersonIds:        Set<string>
  togglePersonSelection:    (id: string) => void
  selectedPersonId:         string | null
  selectPerson:             (id: string) => void
  isHistoryPreviewMode:         boolean
  handlePersonDoubleClick:      (id: string) => void
  handlePersonContextMenu:      (e: React.MouseEvent, id: string) => void
  handlePositionContextMenu:    (e: React.MouseEvent, rowId: number) => void
  handleDropPositionOnPosition: (e: React.DragEvent, targetRowId: number) => void
  expandedChipIds:              Set<string>
  toggleChip:                   (id: string) => void
}

export const OrgViewContext = createContext<OrgViewContextValue | null>(null)

export function useOrgView(): OrgViewContextValue {
  const ctx = useContext(OrgViewContext)
  if (!ctx) throw new Error('useOrgView must be used within OrgViewContext.Provider')
  return ctx
}
