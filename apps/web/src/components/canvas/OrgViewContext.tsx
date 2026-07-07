import { createContext, useContext } from 'react'
import type { Organization } from '@personnel/domain/schemas'
import type { Person } from '@personnel/domain/schemas'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { ValidationIssue } from '@personnel/domain/rules/validate/validateRow'
import type { DropIntentState, DropOpState } from './hooks/useDropIntent'

export interface DragData {
  dragType?:       'person' | 'position'
  personId?:       string   // position ドラッグ時は空席のため undefined
  fromOrgId:       string
  fromCompanyId:   string
  affiliationType: 'primary' | 'concurrent'
  source?:         'before' | 'after' | 'reportLine' | 'sidebar' | 'excel'
  fromRowId?:      number
  /** キャンバス外のドロップ先（チャット等）向けの統一フィールド */
  rowId?:          number
  /** どのパネルからのドラッグか（'main' | strip panel id）。クロスパネル判定用 */
  fromPanelId?:    string
  /** 旧組織未割当セクションからの一括ドラッグ用（rowIds があれば unmapped-bulk 扱い） */
  rowIds?:         number[]
  prevOrgName?:    string
  /** FloatingAbsencePanel からのドラッグ（org へのドロップで lockCancel + 組織設定） */
  fromAbsence?:    boolean
}

export interface PositionEntry {
  row:                 AllocationRow
  person:              Person | null
  depth:               number
  activePatterns:      Set<EditPattern>
  /** 単行バリデーション結果（行間チェックなし）。RowCard・SummaryView のチップ表示用 */
  validationIssues:    ValidationIssue[]
  /**
   * managerPositionCode が存在するが org 内に対応行がない場合のみ設定される。
   * 'cross-org': 別 org の行が持つ positionCode と一致（別ファイルの上司）
   * 'missing':   全 allocationList に存在しない（廃止・未インポート等）
   */
  externalManagerKind?: 'cross-org' | 'missing'
}

export interface MemberEntry {
  row:    AllocationRow
  person: Person
}

export interface OrgViewContextValue {
  organizations:            Organization[]
  /** organizations の id → Organization Map（TreeWindow 共有用） */
  orgById:                  Map<string, Organization>
  /** organizations の parentId → 子 Organization[] Map（TreeWindow 共有用） */
  childrenByOrgId:          Map<string, Organization[]>
  positionTreeByOrgId:      Map<string, PositionEntry[]>
  /** orgId → サブツリー全体のアイテム数。O(N) で1回構築し全 TreeWindow が O(1) で参照 */
  subtreeCountByOrgId:      Map<string, number>
  afterMembersByOrgId:      Map<string, MemberEntry[]>
  /** externalCode/id → Organization（after 側）。RowCard 等の名前解決を O(1) にするための共有 Map */
  afterOrgByCode:           Map<string, Organization>
  /** externalCode/id → Organization（before 側）。RowCard 等の名前解決を O(1) にするための共有 Map */
  beforeOrgByCode:          Map<string, Organization>
  dragOverOrgId:            string | null
  setDragOverOrgId:         (id: string | null) => void
  highlightedOrgId:         string | null
  dragOverVacantRowId:      number | null
  setDragOverVacantRowId:   (id: number | null) => void
  /** 人物カードの上にドラッグ中の rowId */
  dropPersonRowId:          number | null
  setDropPersonRowId:       (v: number | null) => void
  /** カード間ギャップにドラッグ中: ギャップの直上カードの rowId */
  dropGapBelowRowId:        number | null
  setDropGapBelowRowId:     (v: number | null) => void
  openDropIntent:           (state: DropIntentState) => void
  /** バンド間ドラッグ: 昇格/降格 quickInputs フォームを直接開く */
  openBandDrop:             (state: DropOpState) => void
  /** グループ間ドラッグ（form 種別）: フル inputs フォームを DropOperationModal で開く */
  openGroupFormDrop:        (state: DropOpState) => void
  handleDragOver:           (e: React.DragEvent, orgId: string) => void
  handleDragLeave:          () => void
  handleDrop:               (e: React.DragEvent, orgId: string) => void
  handleDropOnVacantSlot:   (e: React.DragEvent, rowId: number) => void
  handleAddPosition:        (orgId: string, orgCode: string) => void
  handleSecondmentIn:       (orgId: string, orgCode: string, sfIntegrated: boolean, concurrent: boolean) => void
  topPositionCodeOfOrg:     (orgId: string) => string | undefined
  setBulkMoveSourceId:      (id: string | null) => void
  setConfirmDialog:         (d: { message: string; onConfirm: () => void } | null) => void
  isSelectMode:             boolean
  selectedPersonIds:        Set<string>
  handlePersonClick:        (personId: string, panelId: string, mods: { ctrl: boolean; shift: boolean }, rowId?: number) => void
  addPersonsToSelection:    (ids: Set<string>) => void
  clearSelection:           () => void
  selectCard:               (rowId: number | null) => void
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
