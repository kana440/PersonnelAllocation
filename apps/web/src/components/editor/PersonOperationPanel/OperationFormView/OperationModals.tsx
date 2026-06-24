import { nextRowId } from '@personnel/domain/allocationRow'
import { OrgSearchDialog }          from '../../OrgSearchDialog'
import { PersonPickerDialog }       from '../PersonPickerDialog'
import { TitleSuggestionModal }     from '../../../common/TitleSuggestionModal'
import { NewPositionConfirmModal }  from '../../../common/NewPositionConfirmModal'
import { NewPositionDialog }        from '../../../common/NewPositionDialog'
import { ClearFieldsConfirmModal }  from '../../../common/ClearFieldsConfirmModal'
import { PositionPickerModal }      from '../../../common/PositionPickerModal'
import type { AllocationRow }       from '@personnel/domain/allocationRow'
import type { Organization }        from '@personnel/domain/schemas'
import type { AllMasters }          from '@personnel/domain/masters/aggregate'
import type { SideEffectSummary }   from '../operationPreview'

interface Props {
  row:                 AllocationRow
  values:              Partial<AllocationRow>
  allocationList:      AllocationRow[]
  afterOrganizations:  Organization[]
  masters:             AllMasters
  // person picker (userId)
  showPersonPicker:    boolean
  setShowPersonPicker: (v: boolean) => void
  // manager picker
  mgrPickerField:      keyof AllocationRow | null
  mgrPickerExclude:    ReadonlySet<string> | undefined
  mgrPickerOrgCode:    string | undefined
  setMgrPickerField:   (f: keyof AllocationRow | null) => void
  setMgrPickerExclude: (s: ReadonlySet<string> | undefined) => void
  setMgrPickerOrgCode: (c: string | undefined) => void
  // org picker
  orgPickerField:      string | null
  setOrgPickerField:   (f: string | null) => void
  // position picker
  posPickerField:      keyof AllocationRow | null
  posPickerFilter:     ((r: AllocationRow) => boolean) | undefined
  posPickerInitialOrg: string | undefined
  setPosPickerField:   (f: keyof AllocationRow | null) => void
  setPosPickerFilter:  (fn: ((r: AllocationRow) => boolean) | undefined) => void
  setPosPickerInitialOrg: (id: string | undefined) => void
  // side effect confirm
  showSideEffectModal:  boolean
  sideEffectSummary:    SideEffectSummary
  setShowSideEffectModal: (v: boolean) => void
  // title suggest
  titleSuggest:         { field: keyof AllocationRow; fieldLabel: string; value: string } | null
  setTitleSuggest:      (v: { field: keyof AllocationRow; fieldLabel: string; value: string } | null) => void
  // new position dialog
  newPosDlgOpen:        boolean
  setNewPosDlgOpen:     (v: boolean) => void
  // position confirm modal
  showPosModal:         boolean
  pendingPosCode:       string | null
  setShowPosModal:      (v: boolean) => void
  setPendingPosCode:    (c: string | null) => void
  // shared callbacks
  setValues:            React.Dispatch<React.SetStateAction<Partial<AllocationRow>>>
  handleChange:         (field: keyof AllocationRow, value: string) => void
  doExecute:            (vals: Partial<AllocationRow>) => void
}

export function OperationModals({
  row, values, allocationList, afterOrganizations, masters,
  showPersonPicker, setShowPersonPicker,
  mgrPickerField, mgrPickerExclude, mgrPickerOrgCode,
  setMgrPickerField, setMgrPickerExclude, setMgrPickerOrgCode,
  orgPickerField, setOrgPickerField,
  posPickerField, posPickerFilter, posPickerInitialOrg,
  setPosPickerField, setPosPickerFilter, setPosPickerInitialOrg,
  showSideEffectModal, sideEffectSummary, setShowSideEffectModal,
  titleSuggest, setTitleSuggest,
  newPosDlgOpen, setNewPosDlgOpen,
  showPosModal, pendingPosCode, setShowPosModal, setPendingPosCode,
  setValues, handleChange, doExecute,
}: Props) {
  const closeMgrPicker = () => {
    setMgrPickerField(null)
    setMgrPickerExclude(undefined)
    setMgrPickerOrgCode(undefined)
  }

  // 新規ポジションコード候補: 既存 _pos_ 番号と重複しない番号を返す
  const suggestedPosCode = (() => {
    const cur = values.positionCode as string | undefined
    if (cur?.startsWith('_pos_')) return cur
    const usedNums = new Set(
      allocationList
        .flatMap(r => [r.positionCode, r.prevPositionCode])
        .filter((c): c is string => typeof c === 'string' && c.startsWith('_pos_'))
        .map(c => parseInt(c.slice(5), 10))
        .filter(n => !isNaN(n))
    )
    let n = nextRowId(allocationList)
    while (usedNums.has(n)) n++
    return `_pos_${n}`
  })()

  return (
    <>
      {showPersonPicker && (
        <PersonPickerDialog
          defaultOrgCode={(values.departmentCode ?? row.departmentCode) as string | undefined}
          allocationList={allocationList}
          afterOrganizations={afterOrganizations}
          onSelect={(p) => {
            setValues(prev => ({
              ...prev,
              userId:          p.userId,
              lastName:        p.lastName        ?? prev.lastName,
              firstName:       p.firstName       ?? prev.firstName,
              groupEmployeeId: p.groupEmployeeId ?? prev.groupEmployeeId,
              employeeNumber:  p.employeeNumber  ?? prev.employeeNumber,
              employmentType:  p.employmentType  ?? prev.employmentType,
            }))
            setShowPersonPicker(false)
          }}
          onClose={() => setShowPersonPicker(false)}
        />
      )}

      {mgrPickerField && (
        <PersonPickerDialog
          defaultOrgCode={mgrPickerOrgCode}
          allocationList={allocationList}
          afterOrganizations={afterOrganizations}
          excludeUserIds={mgrPickerExclude}
          onSelect={(p) => {
            if (p.positionCode) {
              const name = [p.lastName, p.firstName].filter(Boolean).join(' ')
              setValues(prev => ({
                ...prev,
                [mgrPickerField as string]: p.positionCode,
                managerName: name || prev.managerName,
              }))
            }
            closeMgrPicker()
          }}
          onClose={closeMgrPicker}
        />
      )}

      {orgPickerField && (
        <OrgSearchDialog
          afterOrganizations={afterOrganizations}
          orgMasterEntries={masters.orgMasterEntries}
          onSelect={(code) => { handleChange(orgPickerField as keyof AllocationRow, code); setOrgPickerField(null) }}
          onClose={() => setOrgPickerField(null)}
        />
      )}

      {posPickerField && (
        <PositionPickerModal
          allocationList={allocationList}
          afterOrganizations={afterOrganizations}
          initialOrgId={posPickerInitialOrg}
          filter={posPickerFilter}
          onSelect={(code) => {
            handleChange(posPickerField, code)
            setPosPickerField(null); setPosPickerFilter(undefined); setPosPickerInitialOrg(undefined)
          }}
          onClose={() => { setPosPickerField(null); setPosPickerFilter(undefined); setPosPickerInitialOrg(undefined) }}
        />
      )}

      {showSideEffectModal && (
        <ClearFieldsConfirmModal
          cleared={sideEffectSummary.cleared}
          changed={sideEffectSummary.changed}
          onConfirm={() => { setShowSideEffectModal(false); doExecute(values) }}
          onCancel={() => setShowSideEffectModal(false)}
        />
      )}

      {titleSuggest && (
        <TitleSuggestionModal
          fieldLabel={titleSuggest.fieldLabel}
          suggestedValue={titleSuggest.value}
          onConfirm={() => {
            setValues(prev => ({ ...prev, [titleSuggest!.field]: titleSuggest!.value }))
            setTitleSuggest(null)
          }}
          onSkip={() => setTitleSuggest(null)}
        />
      )}

      {newPosDlgOpen && (
        <NewPositionDialog
          suggestedCode={suggestedPosCode}
          onConfirm={(code) => { handleChange('positionCode', code); setNewPosDlgOpen(false) }}
          onCancel={() => setNewPosDlgOpen(false)}
        />
      )}

      {showPosModal && pendingPosCode && (
        <NewPositionConfirmModal
          newPosCode={pendingPosCode}
          onCreateNew={() => {
            setShowPosModal(false)
            doExecute({ ...values, positionCode: pendingPosCode ?? undefined })
            setPendingPosCode(null)
          }}
          onKeepCurrent={() => {
            setShowPosModal(false)
            doExecute(values)
            setPendingPosCode(null)
          }}
        />
      )}
    </>
  )
}
