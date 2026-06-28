import { useState, useMemo, useEffect } from 'react'
import { useFormStateStore } from '../../../../store/formStateStore'
import { useStore }          from '../../../../store/useStore'
import { appService }        from '../../../../application/HRApplicationService'
import { deriveFieldUpdates }   from '@personnel/domain/derivation'
import { validateRow }          from '@personnel/domain/validation/validateRow'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { nextRowId }            from '@personnel/domain/allocationRow'
import { FIELD_METADATA }       from '@personnel/domain/allocationRow'
import { computeSideEffects, hasSideEffects } from '../operationPreview'
import type { SideEffectSummary } from '../operationPreview'
import type { EditOperation, OperationInput } from '@personnel/domain/commands/defs/index'
import { bindOperation, isSectionDivider, isInputRow, withLeavePositionVacant, countSubordinates } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { StepMode }      from '../BandStepFilter'
import { FieldInput }          from './FieldInput'
import { OperationModals }     from './OperationModals'
import type { FieldCtx }       from './types'

interface Props {
  def:              EditOperation
  row:              AllocationRow
  onBack:           () => void
  overrideInitial?: Partial<AllocationRow>
}

export function OperationFormView({ def, row, onBack, overrideInitial }: Props) {
  const { allocationList, masters, afterOrganizations } = useStore()
  const ctx = useMemo(
    () => ({ allocationList, afterOrganizations, masters }),
    [allocationList, afterOrganizations, masters]
  )

  const initialValues = useMemo(() => {
    const base     = def.onOpen(row, ctx)
    const override = overrideInitial ?? {}
    const derived  = Object.keys(override).length > 0
      ? deriveFieldUpdates(override, { ...row, ...base } as AllocationRow, masters, allocationList)
      : {}
    return { ...base, ...override, ...derived }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, row, ctx, overrideInitial])

  const [values,              setValues]              = useState<Partial<AllocationRow>>(() => ({ ...initialValues }))
  const [submitError,         setSubmitError]         = useState<string | null>(null)
  const [stepMode,            setStepMode]            = useState<StepMode>('1')
  const [titleSuggest,        setTitleSuggest]        = useState<{ field: keyof AllocationRow; fieldLabel: string; value: string } | null>(null)
  const [showPosModal,        setShowPosModal]        = useState(false)
  const [pendingPosCode,      setPendingPosCode]      = useState<string | null>(null)
  const [showSideEffectModal, setShowSideEffectModal] = useState(false)
  const [sideEffectSummary,   setSideEffectSummary]   = useState<SideEffectSummary>({ cleared: [], changed: [] })
  const [posPickerField,      setPosPickerField]      = useState<keyof AllocationRow | null>(null)
  const [posPickerFilter,     setPosPickerFilter]     = useState<((r: AllocationRow) => boolean) | undefined>(undefined)
  const [posPickerInitialOrg, setPosPickerInitialOrg] = useState<string | undefined>(undefined)
  const [showPersonPicker,    setShowPersonPicker]    = useState(false)
  const [newPosDlgOpen,       setNewPosDlgOpen]       = useState(false)
  const [mgrPickerField,      setMgrPickerField]      = useState<keyof AllocationRow | null>(null)
  const [mgrPickerExclude,    setMgrPickerExclude]    = useState<ReadonlySet<string> | undefined>(undefined)
  const [mgrPickerOrgCode,    setMgrPickerOrgCode]    = useState<string | undefined>(undefined)
  const [orgPickerField,      setOrgPickerField]      = useState<string | null>(null)

  const subordinateCount = useMemo(
    () => (def.supportsLeaveVacant && !!row.positionCode) ? countSubordinates(row, allocationList) : 0,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def.supportsLeaveVacant, row.rowId]
  )
  const [leaveVacant, setLeaveVacant] = useState(() => subordinateCount > 0)
  const effectiveDef  = def.supportsLeaveVacant && leaveVacant && !!row.positionCode
    ? withLeavePositionVacant(def) : def

  const draftRow   = useMemo(() => ({ ...row, ...values } as AllocationRow), [row, values])
  const fieldInputs = useMemo(
    () => def.inputs.filter((i): i is OperationInput => !isSectionDivider(i) && !isInputRow(i))
      .filter(i => !i.visibleWhen || i.visibleWhen(values, masters)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def.inputs, values, masters]
  )

  const handleChange = (field: keyof AllocationRow, value: string) => {
    const changes  = { [field]: value } as Partial<AllocationRow>
    const derived  = deriveFieldUpdates(changes, draftRow, masters, allocationList)
    const effects  = def.onFieldChange?.[field]?.(value, ctx, values)
    const filteredDerived: Record<string, unknown> = { ...derived }
    for (const f of (effects?.excludeDerived ?? [])) delete filteredDerived[f as string]
    setValues(prev => ({ ...prev, ...changes, ...filteredDerived, ...(effects?.setValues ?? {}) }))
    if (effects?.openPickerFor) {
      const targetInput = fieldInputs.find(i => i.field === effects.openPickerFor)
      if (targetInput?.picker === 'position') {
        const predicate = targetInput.positionFilter ? targetInput.positionFilter(row, ctx) : undefined
        setPosPickerFilter(() => predicate)
        setPosPickerInitialOrg(effects.openPickerInitialOrg)
        setPosPickerField(effects.openPickerFor!)
      } else if (targetInput?.picker === 'managerPosition') {
        const predicate = targetInput.positionFilter ? targetInput.positionFilter(row, ctx) : undefined
        const exclude   = predicate
          ? new Set(allocationList.filter(r => r.userId && !predicate(r)).map(r => r.userId!))
          : undefined
        setMgrPickerOrgCode((values.departmentCode ?? row.departmentCode) as string | undefined)
        setMgrPickerExclude(exclude)
        setMgrPickerField(effects.openPickerFor!)
      } else if (targetInput?.picker === 'org') {
        setOrgPickerField(effects.openPickerFor as string)
      }
    }
  }

  const handleCommit = (field: keyof AllocationRow, value: string) => {
    const effects = def.onFieldChange?.[field]?.(value, ctx, values)
    if (!effects?.suggestFieldValue || titleSuggest) return
    const { field: suggestField, value: suggestVal } = effects.suggestFieldValue
    const targetInput    = fieldInputs.find(i => i.field === suggestField)
    const currentTargetVal = (values[suggestField] as string | undefined) ?? ''
    if (targetInput && suggestVal !== currentTargetVal) {
      const fieldLabel = targetInput.label ?? ALLOCATION_LIST_LABEL_MAP[suggestField as string]?.ja ?? suggestField as string
      setTitleSuggest({ field: suggestField, fieldLabel, value: suggestVal })
    }
  }

  useEffect(() => { useFormStateStore.getState().publish({ rowId: row.rowId, operationId: def.id, values }) }, [values, row.rowId, def.id])
  useEffect(() => () => useFormStateStore.getState().clear(), [])

  const pendingSuggestion = useFormStateStore(s => s.pendingSuggestion)
  useEffect(() => {
    if (!pendingSuggestion) return
    handleChange(pendingSuggestion.field, pendingSuggestion.value)
    useFormStateStore.getState().clearSuggestion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSuggestion])

  const issues = useMemo(
    () => validateRow({ row: draftRow, afterOrganizations, masters, allocationList })
      .filter(i => {
        const inp = fieldInputs.find(f => f.field === i.field && !f.readOnly)
        if (!inp) return false
        if (inp.required === false) {
          const val = (values[inp.field] as string | undefined) ?? ''
          if (!val) return false
        }
        return true
      }),
    [draftRow, afterOrganizations, masters, allocationList, fieldInputs, values]
  )

  const doExecute = (vals: Partial<AllocationRow>) => {
    setSubmitError(null)
    try {
      const command = bindOperation(effectiveDef, row.rowId, vals)
      const result  = appService.executeOperation(command)
      if (!result.ok) { setSubmitError(result.errors.map(e => e.message).join(' / ')); return }
      onBack()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '操作の実行に失敗しました')
    }
  }

  const handleSubmit = () => {
    if (row.rowId >= 0 && !!(values.payGradeChangeSign as string | undefined)) {
      const posCurrent = (values.positionCode ?? row.positionCode) as string | undefined
      const posPrev    = row.prevPositionCode as string | undefined
      if (posCurrent === posPrev) {
        const usedNums = new Set(
          allocationList.flatMap(r => [r.positionCode, r.prevPositionCode])
            .filter((c): c is string => typeof c === 'string' && c.startsWith('_pos_'))
            .map(c => parseInt(c.slice(5), 10)).filter(n => !isNaN(n))
        )
        let n = nextRowId(allocationList)
        while (usedNums.has(n)) n++
        setPendingPosCode(`_pos_${n}`)
        setShowPosModal(true)
        return
      }
    }
    const effects = computeSideEffects(effectiveDef, row, values, ctx)
    if (hasSideEffects(effects)) { setSideEffectSummary(effects); setShowSideEffectModal(true); return }
    doExecute(values)
  }

  const FIELDS_WITH_PREV    = useMemo(() => new Set(FIELD_METADATA.map(m => m.after as string)), [])
  const hasBlockingError    = issues.some(i => i.level === 'error') || !!submitError
  const currentJobFamily    = (values.jobFamily ?? row.jobFamily) as string | undefined
  const indicatorDefs       = useMemo(() => fieldInputs.filter(i => i.indicator), [fieldInputs])

  const fieldCtx: FieldCtx = {
    row, values, draftRow, issues, allocationList, afterOrganizations, masters,
    stepMode, currentJobFamily, fieldsWithPrev: FIELDS_WITH_PREV,
    onChange: handleChange,
    onCommit: handleCommit,
    onStepModeChange: setStepMode,
    openOrgPicker: setOrgPickerField,
    openPosPicker: (field, opts) => {
      setPosPickerField(field)
      setPosPickerFilter(() => opts?.filter)
      setPosPickerInitialOrg(opts?.initOrg)
    },
    openMgrPicker: (field, opts) => {
      setMgrPickerField(field)
      setMgrPickerExclude(opts?.exclude)
      setMgrPickerOrgCode(opts?.orgCode)
    },
    openPersonPicker: () => setShowPersonPicker(true),
    openNewPosDlg:    () => setNewPosDlgOpen(true),
  }

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-shrink-0">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1" title="戻る">←</button>
          <span className="text-xs font-semibold text-gray-700">{def.label}</span>
          {indicatorDefs.length > 0 && (
            <div className="ml-auto flex items-center gap-3">
              {indicatorDefs.map(({ field, label }) => {
                const key     = field as string
                const lbl     = (label ?? ALLOCATION_LIST_LABEL_MAP[key]?.ja ?? key).replace(/_新$/, '')
                const checked = !!(values[field] as string | undefined)
                return (
                  <label key={key} className="flex items-center gap-1 text-[10px] text-gray-400 cursor-default select-none">
                    <input type="checkbox" checked={checked} readOnly className="w-3 h-3 accent-blue-500 cursor-default" />
                    {lbl}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {def.description && (
            <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-2 leading-relaxed">
              {def.description}
            </div>
          )}
          {def.supportsLeaveVacant && !!row.positionCode && (
            <div className={`px-3 py-2.5 rounded-lg border text-xs ${subordinateCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={leaveVacant} onChange={e => setLeaveVacant(e.target.checked)} className="mt-0.5 flex-shrink-0" />
                <span>
                  {subordinateCount > 0 ? (
                    <>
                      <span className="font-semibold text-amber-900">元の組織上 {subordinateCount} 名の部下を持っています。</span>
                      {' '}異動後にレポートラインが切れる可能性があります。<br />
                      <span className="font-semibold">元のポジションを空席として残す（推奨）</span>
                    </>
                  ) : '元のポジションを空席として残す'}
                </span>
              </label>
            </div>
          )}

          {def.inputs.map((item, idx) => {
            const key = isSectionDivider(item) ? `section-${idx}` : isInputRow(item) ? `row-${idx}` : item.field as string
            return <FieldInput key={key} item={item} ctx={fieldCtx} />
          })}

          {submitError && (
            <div className="text-[11px] text-red-600 bg-red-50 rounded px-2.5 py-1.5">{submitError}</div>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
          <button onClick={onBack} className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50">キャンセル</button>
          <button onClick={handleSubmit} disabled={hasBlockingError}
            className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >実行</button>
        </div>

        {/* インライン用モーダル (PersonPickerDialog, OrgSearchDialog はスタック上に表示) */}
        <OperationModals
          row={row} values={values} allocationList={allocationList}
          afterOrganizations={afterOrganizations} masters={masters}
          showPersonPicker={showPersonPicker} setShowPersonPicker={setShowPersonPicker}
          mgrPickerField={mgrPickerField} mgrPickerExclude={mgrPickerExclude} mgrPickerOrgCode={mgrPickerOrgCode}
          setMgrPickerField={setMgrPickerField} setMgrPickerExclude={setMgrPickerExclude} setMgrPickerOrgCode={setMgrPickerOrgCode}
          orgPickerField={orgPickerField} setOrgPickerField={setOrgPickerField}
          posPickerField={posPickerField} posPickerFilter={posPickerFilter} posPickerInitialOrg={posPickerInitialOrg}
          setPosPickerField={setPosPickerField} setPosPickerFilter={setPosPickerFilter} setPosPickerInitialOrg={setPosPickerInitialOrg}
          showSideEffectModal={showSideEffectModal} sideEffectSummary={sideEffectSummary} setShowSideEffectModal={setShowSideEffectModal}
          titleSuggest={titleSuggest} setTitleSuggest={setTitleSuggest}
          newPosDlgOpen={newPosDlgOpen} setNewPosDlgOpen={setNewPosDlgOpen}
          showPosModal={showPosModal} pendingPosCode={pendingPosCode}
          setShowPosModal={setShowPosModal} setPendingPosCode={setPendingPosCode}
          setValues={setValues} handleChange={handleChange} doExecute={doExecute}
        />
      </div>
    </>
  )
}
