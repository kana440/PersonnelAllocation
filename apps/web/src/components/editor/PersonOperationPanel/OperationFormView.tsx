import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import { deriveFieldUpdates } from '@personnel/domain/derivation'
import { validateRow } from '@personnel/domain/validation/validateRow'
import { getGroupedFieldOptions } from '@personnel/domain/choices'
import { resolveFieldStrictness } from '@personnel/domain/optionStrictness'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { nextRowId } from '@personnel/domain/allocationRow'
import { ComboInput } from '../../common/ComboInput'
import { TitleSuggestionModal } from '../../common/TitleSuggestionModal'
import { NewPositionConfirmModal } from '../../common/NewPositionConfirmModal'
import { ClearFieldsConfirmModal }  from '../../common/ClearFieldsConfirmModal'
import { PositionPickerModal }      from '../../common/PositionPickerModal'
import { computeSideEffects, hasSideEffects, type SideEffectSummary } from './operationPreview'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import { bindOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { OrgSearchDialog } from '../OrgSearchDialog'
import { BandStepFilter, filterBandsByStep } from './BandStepFilter'
import type { StepMode } from './BandStepFilter'

interface Props {
  def:    EditOperation
  row:    AllocationRow
  onBack: () => void
}

export function OperationFormView({ def, row, onBack }: Props) {
  const { allocationList, codeLists, afterOrganizations } = useStore()

  const ctx = useMemo(
    () => ({ allocationList, afterOrganizations, codeLists }),
    [allocationList, afterOrganizations, codeLists]
  )
  const initialValues = useMemo(() => def.deriveInitial(row, ctx), [def, row, ctx])

  const [values,         setValues]         = useState<Partial<AllocationRow>>(() => ({ ...initialValues }))
  const [orgPickerField, setOrgPickerField] = useState<string | null>(null)
  const [submitError,    setSubmitError]    = useState<string | null>(null)
  const [stepMode,       setStepMode]       = useState<StepMode>('1')
  const [titleSuggest,    setTitleSuggest]    = useState<{ field: keyof AllocationRow; fieldLabel: string; value: string } | null>(null)
  const [showPosModal,    setShowPosModal]    = useState(false)
  const [pendingPosCode,  setPendingPosCode]  = useState<string | null>(null)
  const [showSideEffectModal,  setShowSideEffectModal]  = useState(false)
  const [sideEffectSummary,    setSideEffectSummary]    = useState<SideEffectSummary>({ cleared: [], changed: [] })
  const [posPickerField,      setPosPickerField]      = useState<keyof AllocationRow | null>(null)
  const [posPickerFilter,     setPosPickerFilter]     = useState<((r: AllocationRow) => boolean) | undefined>(undefined)
  const [posPickerInitialOrg, setPosPickerInitialOrg] = useState<string | undefined>(undefined)

  const draftRow = useMemo(() => ({ ...row, ...values } as AllocationRow), [row, values])

  const handleChange = (field: keyof AllocationRow, value: string) => {
    const changes  = { [field]: value } as Partial<AllocationRow>
    const derived  = deriveFieldUpdates(changes, draftRow, codeLists, allocationList)
    const inputDef = def.inputs.find(i => i.field === field)
    const effects  = inputDef?.afterChange?.(value, ctx)

    setValues(prev => ({
      ...prev,
      ...changes,
      ...derived,
      ...(effects?.setValues ?? {}),
    }))

    if (effects?.suggestFieldValue && !titleSuggest) {
      const { field: suggestField, value: suggestVal } = effects.suggestFieldValue
      const targetInput = def.inputs.find(i => i.field === suggestField)
      const currentTargetVal = (values[suggestField] as string | undefined) ?? ''
      if (targetInput && suggestVal !== currentTargetVal) {
        const fieldLabel = targetInput.label ?? ALLOCATION_LIST_LABEL_MAP[suggestField as string]?.ja ?? suggestField as string
        setTitleSuggest({ field: suggestField, fieldLabel, value: suggestVal })
      }
    }

    if (effects?.openPickerFor) {
      const targetInput = def.inputs.find(i => i.field === effects.openPickerFor)
      if (targetInput?.picker === 'position') {
        const predicate = targetInput.positionFilter ? targetInput.positionFilter(row, ctx) : undefined
        setPosPickerFilter(() => predicate)
        setPosPickerInitialOrg(effects.openPickerInitialOrg)
        setPosPickerField(effects.openPickerFor!)
      } else if (targetInput?.picker === 'org') {
        setOrgPickerField(effects.openPickerFor as string)
      }
    }
  }

  const issues = useMemo(
    () => validateRow({ row: draftRow, afterOrganizations, codeLists, allocationList })
      .filter(i => def.inputs.some(inp => inp.field === i.field && !inp.readOnly)),
    [draftRow, afterOrganizations, codeLists, allocationList, def.inputs]
  )

  const needsNewPosition = (): boolean => {
    const newBand  = (values.band ?? row.band) as string | undefined
    const prevBand = row.prevBand as string | undefined
    const posCurrent = (values.positionCode ?? row.positionCode) as string | undefined
    const posPrev    = row.prevPositionCode as string | undefined
    return !!newBand && newBand !== prevBand && posCurrent === posPrev
  }

  const doExecute = (vals: Partial<AllocationRow>) => {
    setSubmitError(null)
    try {
      const command = bindOperation(def, row.rowId, vals)
      const result  = appService.executeOperation(command)
      if (!result.ok) { setSubmitError(result.errors.map(e => e.message).join(' / ')); return }
      onBack()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : '操作の実行に失敗しました')
    }
  }

  const handleSubmit = () => {
    if (needsNewPosition()) {
      const newId = nextRowId(allocationList)
      const code  = `_pos_${newId}`
      setPendingPosCode(code)
      setShowPosModal(true)
      return
    }
    const effects = computeSideEffects(def, row, values, ctx)
    if (hasSideEffects(effects)) {
      setSideEffectSummary(effects)
      setShowSideEffectModal(true)
      return
    }
    doExecute(values)
  }

  const hasBlockingError   = issues.some(i => i.level === 'error') || !!submitError
  const currentJobFamily   = (values.jobFamily ?? row.jobFamily) as string | undefined
  const baseBand           = row.band as string | undefined
  const derivedPromSign    = (values.promotionSign ?? '') as string
  const derivedPayGradeSign = (values.payGradeChangeSign ?? '') as string

  return (
    <>
      <div className="flex flex-col h-full overflow-hidden">

        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-shrink-0">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1" title="戻る">←</button>
          <span className="text-xs font-semibold text-gray-700">{def.label}</span>
          {derivedPromSign && (
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              derivedPromSign === '昇格' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
            }`}>{derivedPromSign === '昇格' ? '▲' : '▼'} {derivedPromSign}サイン</span>
          )}
          {derivedPayGradeSign && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              給与等級変更サイン
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {def.description && (
            <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-2 leading-relaxed">
              {def.description}
            </div>
          )}
          {def.inputs.map(({ field, required, label, stepFilter, readOnly, picker, positionFilter, inputType }) => {
            const fieldKey    = field as string
            const fieldLabel  = label ?? ALLOCATION_LIST_LABEL_MAP[fieldKey]?.ja ?? fieldKey
            const currentVal  = (values[field] as string | undefined) ?? ''
            const prevKey     = `prev${fieldKey.charAt(0).toUpperCase()}${fieldKey.slice(1)}`
            const prevVal     = (row[prevKey as keyof AllocationRow] as string | undefined) ?? ''
            const fieldIssues = issues.filter(i => i.field === fieldKey)
            const hasIssue    = fieldIssues.some(i => i.level === 'error' || i.level === 'warning')

            if (picker === 'position') {
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <div className="flex gap-1.5">
                    <ComboInput value={currentVal} onChange={v => handleChange(field, v)} options={[]} hasIssue={hasIssue} />
                    <button
                      onClick={() => {
                        const predicate = positionFilter ? positionFilter(row, ctx) : undefined
                        setPosPickerFilter(() => predicate)
                        // 現在値のポジションが属する組織、なければ自行の組織を初期選択
                        const currentCode = (values[field] as string | undefined) ?? (row[field] as string | undefined)
                        const managerRow  = currentCode ? allocationList.find(r => r.positionCode === currentCode) : undefined
                        const deptCode    = managerRow?.departmentCode ?? row.departmentCode
                        const orgId       = afterOrganizations.find(o => o.externalCode === deptCode)?.id
                        setPosPickerInitialOrg(orgId)
                        setPosPickerField(field)
                      }}
                      className="px-2.5 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
                      title="ポジションを検索"
                    >🔍</button>
                  </div>
                  {prevVal && <p className="text-xs text-gray-500 mt-1">変更前: <span className="font-medium">{prevVal}</span></p>}
                  {fieldIssues.map((issue, i) => (
                    <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                      {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                    </p>
                  ))}
                </div>
              )
            }

            if (picker === 'org') {
              const orgName = afterOrganizations.find(
                o => o.externalCode === currentVal || o.id === currentVal
              )?.name ?? ''
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <div className="flex gap-1.5">
                    <ComboInput value={currentVal} onChange={v => handleChange(field, v)} options={[]} hasIssue={hasIssue} />
                    <button onClick={() => setOrgPickerField(fieldKey)}
                      className="px-2.5 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
                      title="組織を検索">🔍</button>
                  </div>
                  {orgName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{orgName}</p>}
                  {prevVal && <p className="text-xs text-gray-500 mt-1">変更前: <span className="font-medium">{prevVal}</span></p>}
                  {fieldIssues.map((issue, i) => (
                    <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                      {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                    </p>
                  ))}
                </div>
              )
            }

            if (inputType === 'checkbox') {
              const checked = !!currentVal && currentVal !== '0'
              return (
                <div key={fieldKey}>
                  <label className="flex items-center gap-2 cursor-default select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      readOnly={readOnly}
                      className="w-4 h-4 accent-blue-600 disabled:opacity-60"
                      onChange={readOnly ? undefined : (e) => handleChange(field, e.target.checked ? '1' : '')}
                    />
                    <span className="text-xs font-medium text-gray-600">{fieldLabel}</span>
                  </label>
                </div>
              )
            }

            if (readOnly) {
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{fieldLabel}</label>
                  <div className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-500 select-none">
                    {currentVal || '（空）'}
                  </div>
                </div>
              )
            }

            const { valid, invalid } = getGroupedFieldOptions(fieldKey, draftRow, codeLists, currentJobFamily)
            const filteredValid = stepFilter
              ? filterBandsByStep(valid, baseBand, codeLists, stepMode, stepFilter)
              : valid

            return (
              <div key={fieldKey}>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                {stepFilter && (
                  <BandStepFilter mode={stepMode} direction={stepFilter} onChange={setStepMode} />
                )}
                <ComboInput
                  value={currentVal}
                  onChange={v => handleChange(field, v)}
                  options={filteredValid}
                  invalidOptions={invalid}
                  strictness={resolveFieldStrictness(fieldKey, {})}
                  hasIssue={hasIssue}
                />
                {prevVal && <p className="text-xs text-gray-500 mt-1">変更前: <span className="font-medium">{prevVal}</span></p>}
                {fieldIssues.map((issue, i) => (
                  <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                    {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                  </p>
                ))}
              </div>
            )
          })}

          {submitError && (
            <div className="text-[11px] text-red-600 bg-red-50 rounded px-2.5 py-1.5">{submitError}</div>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
          <button onClick={onBack}
            className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >キャンセル</button>
          <button onClick={handleSubmit} disabled={hasBlockingError}
            className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >実行</button>
        </div>

        {orgPickerField && (
          <OrgSearchDialog
            afterOrganizations={afterOrganizations}
            orgMasterEntries={codeLists.orgMasterEntries}
            onSelect={(code) => {
              handleChange(orgPickerField as keyof AllocationRow, code)
              setOrgPickerField(null)
            }}
            onClose={() => setOrgPickerField(null)}
          />
        )}
      </div>

      {/* ポジション選択モーダル */}
      {posPickerField && (
        <PositionPickerModal
          allocationList={allocationList}
          afterOrganizations={afterOrganizations}
          initialOrgId={posPickerInitialOrg}
          filter={posPickerFilter}
          onSelect={(code, _name) => {
            handleChange(posPickerField, code)
            setPosPickerField(null)
            setPosPickerFilter(undefined)
            setPosPickerInitialOrg(undefined)
          }}
          onClose={() => {
            setPosPickerField(null)
            setPosPickerFilter(undefined)
            setPosPickerInitialOrg(undefined)
          }}
        />
      )}

      {/* 副作用確認モーダル */}
      {showSideEffectModal && (
        <ClearFieldsConfirmModal
          cleared={sideEffectSummary.cleared}
          changed={sideEffectSummary.changed}
          onConfirm={() => { setShowSideEffectModal(false); doExecute(values) }}
          onCancel={() => setShowSideEffectModal(false)}
        />
      )}

      {/* フィールド値提案モーダル */}
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

      {/* ポジション新設確認モーダル */}
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
