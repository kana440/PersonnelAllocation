import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }  from '@personnel/domain/schemas'
import type { AllMasters }    from '@personnel/domain/masters/aggregate'
import type { StepMode }      from '../BandStepFilter'

/** FieldInput コンポーネントが必要とするコンテキストをまとめた型 */
export interface FieldCtx {
  row:                AllocationRow
  values:             Partial<AllocationRow>
  draftRow:           AllocationRow
  /** validateRow の結果（フィールドキー・メッセージ・レベル） */
  issues:             Array<{ field: string; message: string; level: 'error' | 'warning' }>
  allocationList:     AllocationRow[]
  afterOrganizations: Organization[]
  masters:            AllMasters
  stepMode:           StepMode
  currentJobFamily:   string | undefined
  fieldsWithPrev:     Set<string>
  // コールバック群
  onChange:           (field: keyof AllocationRow, value: string) => void
  onCommit:           (field: keyof AllocationRow, value: string) => void
  onStepModeChange:   (m: StepMode) => void
  openOrgPicker:      (field: string) => void
  openPosPicker:      (
    field: keyof AllocationRow,
    opts?: { filter?: (r: AllocationRow) => boolean; initOrg?: string }
  ) => void
  openMgrPicker:      (
    field: keyof AllocationRow,
    opts?: { exclude?: ReadonlySet<string>; orgCode?: string }
  ) => void
  openPersonPicker:   () => void
  openNewPosDlg:      () => void
}
