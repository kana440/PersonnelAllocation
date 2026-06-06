import { createContext, useContext } from 'react'
import type { Organization } from '@personnel/domain/schemas'
import type { Person } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'

export interface DragData {
  dragType?:       'person' | 'position'
  personId:        string
  fromOrgId:       string
  fromCompanyId:   string
  affiliationType: 'primary' | 'concurrent'
  source?:         'before' | 'after' | 'reportLine' | 'sidebar' | 'excel'
  fromRowId?:      number
  /** キャンバス外のドロップ先（チャット等）向けの統一フィールド */
  rowId?:          number
  /** どのパネルからのドラッグか（'main' | strip panel id）。クロスパネル判定用 */
  fromPanelId?:    string
}

export interface PositionEntry {
  row:            AllocationRow
  person:         Person | null
  depth:          number
  activePatterns: Set<EditPattern>
}

export interface MemberEntry {
  row:    AllocationRow
  person: Person
}

export interface OrgViewContextValue {
  organizations:            Organization[]
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
  handleAddPosition:        (orgId: string, orgCode: string) => void
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
  handleRowDoubleClick:         (e: React.MouseEvent, rowId: number) => void
  handleDropPositionOnPosition: (e: React.DragEvent, targetRowId: number) => void
  handleReorderRow:             (rowId: number, beforeRowId: number | null) => void
  expandedChipIds:              Set<string>
  toggleChip:                   (id: string) => void
}

export const OrgViewContext = createContext<OrgViewContextValue | null>(null)

export function useOrgView(): OrgViewContextValue {
  const ctx = useContext(OrgViewContext)
  if (!ctx) throw new Error('useOrgView must be used within OrgViewContext.Provider')
  return ctx
}
