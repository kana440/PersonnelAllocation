import { useState, useMemo, useEffect } from 'react'
import { useFormStateStore } from '../../../store/formStateStore'
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
import { NewPositionDialog }       from '../../common/NewPositionDialog'
import { ClearFieldsConfirmModal }  from '../../common/ClearFieldsConfirmModal'
import { PositionPickerModal }      from '../../common/PositionPickerModal'
import { computeSideEffects, hasSideEffects, type SideEffectSummary } from './operationPreview'
import type { EditOperation, OperationInput } from '@personnel/domain/commands/defs/index'
import { bindOperation, isSectionDivider, isInputRow } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { FIELD_METADATA } from '@personnel/domain/allocationRow'
import { OrgSearchDialog } from '../OrgSearchDialog'
import { BandStepFilter, filterBandsByStep } from './BandStepFilter'
import { PersonPickerDialog } from './PersonPickerDialog'
import type { StepMode } from './BandStepFilter'

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
    // overrideInitial に含まれるフィールドから連動導出（managerPositionCode → managerName 等）を伝播させる
    const derived  = Object.keys(override).length > 0
      ? deriveFieldUpdates(override, { ...row, ...base } as AllocationRow, masters, allocationList)
      : {}
    return { ...base, ...override, ...derived }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, row, ctx, overrideInitial])

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
  const [showPersonPicker,    setShowPersonPicker]    = useState(false)
  const [newPosDlgOpen,       setNewPosDlgOpen]       = useState(false)
  const [mgrPickerField,      setMgrPickerField]      = useState<keyof AllocationRow | null>(null)
  const [mgrPickerExclude,    setMgrPickerExclude]    = useState<ReadonlySet<string> | undefined>(undefined)
  const [mgrPickerOrgCode,    setMgrPickerOrgCode]    = useState<string | undefined>(undefined)

  const draftRow = useMemo(() => ({ ...row, ...values } as AllocationRow), [row, values])

  const fieldInputs = useMemo(
    () => def.inputs.filter((i): i is OperationInput => !isSectionDivider(i) && !isInputRow(i)),
    [def.inputs]
  )

  const handleChange = (field: keyof AllocationRow, value: string) => {
    const changes  = { [field]: value } as Partial<AllocationRow>
    const derived  = deriveFieldUpdates(changes, draftRow, masters, allocationList)
    const effects  = def.onFieldChange?.[field]?.(value, ctx)

    // excludeDerived: onFieldChange で指定されたフィールドを自動導出結果から除外する
    const filteredDerived: Record<string, unknown> = { ...derived }
    for (const f of (effects?.excludeDerived ?? [])) {
      delete filteredDerived[f as string]
    }

    setValues(prev => ({
      ...prev,
      ...changes,
      ...filteredDerived,
      ...(effects?.setValues ?? {}),
    }))

    // suggestFieldValue は入力確定時（onCommit）のみ処理する → handleCommit 参照

    if (effects?.openPickerFor) {
      const targetInput = fieldInputs.find(i => i.field === effects.openPickerFor)
      if (targetInput?.picker === 'position') {
        const predicate = targetInput.positionFilter ? targetInput.positionFilter(row, ctx) : undefined
        setPosPickerFilter(() => predicate)
        setPosPickerInitialOrg(effects.openPickerInitialOrg)
        setPosPickerField(effects.openPickerFor!)
      } else if (targetInput?.picker === 'managerPosition') {
        const predicate = targetInput.positionFilter ? targetInput.positionFilter(row, ctx) : undefined
        const exclude = predicate
          ? new Set(allocationList.filter(r => r.userId && !predicate(r)).map(r => r.userId!))
          : undefined
        const deptCode = (values.departmentCode ?? row.departmentCode) as string | undefined
        setMgrPickerOrgCode(deptCode)
        setMgrPickerExclude(exclude)
        setMgrPickerField(effects.openPickerFor!)
      } else if (targetInput?.picker === 'org') {
        setOrgPickerField(effects.openPickerFor as string)
      }
    }
  }

  // 入力確定時（blur / Enter / リスト選択）に suggestFieldValue を処理する
  const handleCommit = (field: keyof AllocationRow, value: string) => {
    const effects = def.onFieldChange?.[field]?.(value, ctx)
    if (!effects?.suggestFieldValue || titleSuggest) return
    const { field: suggestField, value: suggestVal } = effects.suggestFieldValue
    const targetInput = fieldInputs.find(i => i.field === suggestField)
    const currentTargetVal = (values[suggestField] as string | undefined) ?? ''
    if (targetInput && suggestVal !== currentTargetVal) {
      const fieldLabel = targetInput.label ?? ALLOCATION_LIST_LABEL_MAP[suggestField as string]?.ja ?? suggestField as string
      setTitleSuggest({ field: suggestField, fieldLabel, value: suggestVal })
    }
  }

  // フォーム → AI: 値が変わるたびに formStateStore に公開する
  useEffect(() => {
    useFormStateStore.getState().publish({ rowId: row.rowId, operationId: def.id, values })
  }, [values, row.rowId, def.id])

  // アンマウント時にフォーム状態をクリア
  useEffect(() => () => useFormStateStore.getState().clear(), [])

  // AI → フォーム: pendingSuggestion を handleChange に流して連動導出を維持する
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
        // required: false のフィールドは値が空のときのエラーを除外（操作定義が空を許容している）
        if (inp.required === false) {
          const val = (values[inp.field] as string | undefined) ?? ''
          if (!val) return false
        }
        return true
      }),
    [draftRow, afterOrganizations, masters, allocationList, fieldInputs, values]
  )

  // 給与等級が変わった（payGradeChangeSign が立っている）かつポジションが prev から変わっていない場合、
  // ポジション変更が必要と判定する。band 変化ではなく payGrade 変化を基準にする。
  // （M職P職切替は band が変わっても読み替えband が同一で給与等級が変わらないため対象外。
  //   逆に職種変更は band 変化なしでも jobType×band→payGrade の変化でここに入りうる。）
  const needsNewPosition = (): boolean => {
    const posCurrent = (values.positionCode ?? row.positionCode) as string | undefined
    const posPrev    = row.prevPositionCode as string | undefined
    return !!(values.payGradeChangeSign as string | undefined) && posCurrent === posPrev
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
    if (row.rowId >= 0 && needsNewPosition()) {
      const usedNums = new Set(
        allocationList
          .flatMap(r => [r.positionCode, r.prevPositionCode])
          .filter((c): c is string => typeof c === 'string' && c.startsWith('_pos_'))
          .map(c => parseInt(c.slice(5), 10))
          .filter(n => !isNaN(n))
      )
      let n = nextRowId(allocationList)
      while (usedNums.has(n)) n++
      const code = `_pos_${n}`
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

  const FIELDS_WITH_PREV = useMemo(
    () => new Set(FIELD_METADATA.map(m => m.after as string)),
    []
  )

  const hasBlockingError = issues.some(i => i.level === 'error') || !!submitError
  const currentJobFamily = (values.jobFamily ?? row.jobFamily) as string | undefined
  const indicatorDefs    = useMemo(() => fieldInputs.filter(i => i.indicator), [fieldInputs])

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
          {def.inputs.map((item, idx) => {
            // ── セクション区切り ───────────────────────────────────────────────
            if (isSectionDivider(item)) {
              return (
                <div key={`section-${idx}`} className="flex items-center gap-2 pt-2 pb-0.5">
                  <span className="text-[10px] font-semibold text-gray-500 tracking-wider">{item.label}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )
            }

            // ── 横並びグループ（readOnly フィールド用） ────────────────────────
            if (isInputRow(item)) {
              return (
                <div key={`row-${idx}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${item.inputs.length}, 1fr)` }}>
                  {item.inputs.map(inp => {
                    const fk      = inp.field as string
                    const lbl     = (inp.label ?? ALLOCATION_LIST_LABEL_MAP[fk]?.ja ?? fk).replace(/_新$/, '')
                    const val     = (values[inp.field] as string | undefined) ?? ''
                    const prevFk  = `prev${fk.charAt(0).toUpperCase()}${fk.slice(1)}`
                    const prevVal = (row[prevFk as keyof AllocationRow] as string | undefined) ?? ''
                    const changed = FIELDS_WITH_PREV.has(fk) && !!prevVal && val !== prevVal
                    return (
                      <div key={fk}>
                        <label className="text-xs font-medium text-gray-600 block mb-1">{lbl}</label>
                        <div className={`text-xs bg-gray-50 border rounded px-2 py-[5px] min-h-[30px] text-gray-500 select-none truncate ${changed ? 'border-amber-400' : 'border-gray-200'}`}>
                          {val || <span className="text-gray-300">—</span>}
                        </div>
                        {changed && (
                          <p className="text-[10px] text-gray-400 mt-0.5 truncate">前: {prevVal}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            }

            const { field, required, label, stepFilter, readOnly, picker, positionFilter, inputType, indicator, options: inputOptions, optionsMode, warningFn } = item
            if (indicator) return null

            const warnMsg  = warningFn?.(ctx, values)
            const fieldKey = field as string
            const rawLabel     = label ?? ALLOCATION_LIST_LABEL_MAP[fieldKey]?.ja ?? fieldKey
            const fieldLabel   = rawLabel.replace(/_新$/, '')
            const currentVal   = (values[field] as string | undefined) ?? ''
            const committedVal = (row[field]  as string | undefined) ?? ''
            const prevKey      = `prev${fieldKey.charAt(0).toUpperCase()}${fieldKey.slice(1)}`
            const prevVal      = (row[prevKey as keyof AllocationRow] as string | undefined) ?? ''
            const hasPrev      = FIELDS_WITH_PREV.has(fieldKey)
            const fieldIssues  = issues.filter(i => i.field === fieldKey)
            const hasIssue     = fieldIssues.some(i => i.level === 'error' || i.level === 'warning')
            const isChanged    = currentVal !== committedVal

            // 右列: 発令前の読み取り専用ボックス
            const PREV_BOX_CLS = 'text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-[5px] min-h-[30px] break-all'
            const prevBox = hasPrev ? (
              <div className={PREV_BOX_CLS}>
                {prevVal || <span className="text-gray-300">—</span>}
              </div>
            ) : null

            // 変更時のみ表示する差分行
            const diffLine = isChanged ? (
              <p className="text-[10px] mt-1 flex items-center gap-1 flex-wrap">
                <span className="text-gray-400 line-through">{committedVal || '（空）'}</span>
                <span className="text-gray-400">→</span>
                <span className="text-blue-600 font-medium">{currentVal || '（空）'}</span>
              </p>
            ) : null

            const gridCls = hasPrev ? 'grid grid-cols-2 gap-2' : ''

            // ── チェックボックス ───────────────────────────────────────────────
            if (inputType === 'checkbox') {
              const checked = !!currentVal && currentVal !== '0'
              return (
                <div key={fieldKey}>
                  <div className={gridCls}>
                    <label className={`flex items-center gap-2 min-h-[30px] ${readOnly ? 'cursor-default select-none' : 'cursor-pointer'}`}>
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
                    {prevBox}
                  </div>
                  {diffLine}
                </div>
              )
            }

            // ── ポジション新設 picker（readOnly表示 + [変更]ボタン）──────────────
            // readOnly チェックより先に評価（readOnly: true と picker: 'newPosition' を両立させるため）
            if (picker === 'newPosition') {
              const showWarning = !!(values.payGradeChangeSign as string | undefined)
                && (currentVal === prevVal || !currentVal)
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{fieldLabel}</label>
                  <div className={gridCls}>
                    <div className="flex items-center gap-1.5">
                      <div className={`flex-1 text-xs bg-gray-50 border rounded px-2 py-[5px] min-h-[30px] text-gray-500 select-none ${isChanged ? 'border-amber-400' : 'border-gray-200'}`}>
                        {currentVal || <span className="text-gray-300">—</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewPosDlgOpen(true)}
                        className="text-xs px-2.5 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 whitespace-nowrap flex-shrink-0"
                      >
                        変更
                      </button>
                    </div>
                    {prevBox}
                  </div>
                  {diffLine}
                  {showWarning && (
                    <p className="text-[10px] mt-1 text-amber-600">
                      ⚠ 給与等級が変更されます。ポジションの変更を検討してください。
                    </p>
                  )}
                </div>
              )
            }

            // ── 読み取り専用フィールド ─────────────────────────────────────────
            if (readOnly) {
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{fieldLabel}</label>
                  <div className={gridCls}>
                    <div className={`text-xs bg-gray-50 border rounded px-2 py-[5px] min-h-[30px] text-gray-500 select-none ${isChanged ? 'border-amber-400' : 'border-gray-200'}`}>
                      {currentVal || <span className="text-gray-300">—</span>}
                    </div>
                    {prevBox}
                  </div>
                  {diffLine}
                </div>
              )
            }

            // ── ポジション picker ──────────────────────────────────────────────
            if (picker === 'position') {
              const posRow      = currentVal ? allocationList.find(r => r.positionCode === currentVal && !!r.userId) : undefined
              const posPersonName = posRow
                ? ([posRow.lastName, posRow.firstName].filter(Boolean).join(' ') || undefined)
                : undefined
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <div className={gridCls}>
                    <div className="flex gap-1">
                      <ComboInput value={currentVal} onChange={v => handleChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
                      <button
                        onClick={() => {
                          const predicate = positionFilter ? positionFilter(row, ctx) : undefined
                          setPosPickerFilter(() => predicate)
                          const currentCode = (values[field] as string | undefined) ?? (row[field] as string | undefined)
                          const managerRow  = currentCode ? allocationList.find(r => r.positionCode === currentCode) : undefined
                          const deptCode    = managerRow?.departmentCode ?? row.departmentCode
                          const orgId       = afterOrganizations.find(o => o.externalCode === deptCode)?.id
                          setPosPickerInitialOrg(orgId)
                          setPosPickerField(field)
                        }}
                        className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
                        title="ポジションを検索"
                      >🔍</button>
                    </div>
                    {prevBox}
                  </div>
                  {posPersonName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{posPersonName}</p>}
                  {diffLine}
                  {fieldIssues.map((issue, i) => (
                    <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                      {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                    </p>
                  ))}
                </div>
              )
            }

            // ── 人物 picker ───────────────────────────────────────────────────
            if (picker === 'person') {
              const nameDisplay = (() => {
                const ln = (values.lastName  as string | undefined) ?? ''
                const fn = (values.firstName as string | undefined) ?? ''
                return [ln, fn].filter(Boolean).join(' ')
              })()
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <div className="flex gap-1">
                    <ComboInput value={currentVal} onChange={v => handleChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
                    <button
                      onClick={() => setShowPersonPicker(true)}
                      className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
                      title="人物を検索"
                    >🔍</button>
                  </div>
                  {nameDisplay && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{nameDisplay}</p>}
                  {diffLine}
                  {fieldIssues.map((issue, i) => (
                    <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                      {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                    </p>
                  ))}
                </div>
              )
            }

            // ── 上司ポジション picker（人物検索から positionCode を選ぶ） ──────
            if (picker === 'managerPosition') {
              const posRow = currentVal ? allocationList.find(r => r.positionCode === currentVal && !!r.userId) : undefined
              const posPersonName = posRow
                ? ([posRow.lastName, posRow.firstName].filter(Boolean).join(' ') || undefined)
                : undefined
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <div className={gridCls}>
                    <div className="flex gap-1">
                      <ComboInput value={currentVal} onChange={v => handleChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
                      <button
                        onClick={() => {
                          const predicate = positionFilter ? positionFilter(row, ctx) : undefined
                          const exclude = predicate
                            ? new Set(allocationList.filter(r => r.userId && !predicate(r)).map(r => r.userId!))
                            : undefined
                          const deptCode = (values.departmentCode ?? row.departmentCode) as string | undefined
                          setMgrPickerOrgCode(deptCode)
                          setMgrPickerExclude(exclude)
                          setMgrPickerField(field)
                        }}
                        className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
                        title="上司を人物検索"
                      >🔍</button>
                    </div>
                    {prevBox}
                  </div>
                  {posPersonName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{posPersonName}</p>}
                  {diffLine}
                  {fieldIssues.map((issue, i) => (
                    <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                      {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                    </p>
                  ))}
                </div>
              )
            }

            // ── 組織 picker ───────────────────────────────────────────────────
            if (picker === 'org') {
              const orgName = afterOrganizations.find(
                o => o.externalCode === currentVal || o.id === currentVal
              )?.name ?? ''
              return (
                <div key={fieldKey}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <div className={gridCls}>
                    <div className="flex gap-1">
                      <ComboInput value={currentVal} onChange={v => handleChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
                      <button onClick={() => setOrgPickerField(fieldKey)}
                        className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
                        title="組織を検索">🔍</button>
                    </div>
                    {prevBox}
                  </div>
                  {orgName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{orgName}</p>}
                  {diffLine}
                  {fieldIssues.map((issue, i) => (
                    <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                      {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                    </p>
                  ))}
                </div>
              )
            }

            // ── 通常フィールド (ComboInput) ────────────────────────────────────
            // inputOptions が指定されている場合は FIELD_CONSTRAINTS より優先
            const resolvedOptions = inputOptions
              ? (typeof inputOptions === 'function' ? inputOptions(ctx, row) : inputOptions) as string[]
              : null
            const { valid, invalid } = resolvedOptions
              ? { valid: resolvedOptions, invalid: [] as string[] }
              : getGroupedFieldOptions(fieldKey, draftRow, masters, currentJobFamily)
            const fieldBaseBand = (row[field] as string | undefined)
            const filteredValid = stepFilter
              ? filterBandsByStep(valid, fieldBaseBand, masters, stepMode, stepFilter)
              : valid

            return (
              <div key={fieldKey}>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                {stepFilter && (
                  <BandStepFilter mode={stepMode} direction={stepFilter} onChange={setStepMode} />
                )}
                <div className={gridCls}>
                  <ComboInput
                    value={currentVal}
                    onChange={v => handleChange(field, v)}
                    onCommit={v => handleCommit(field, v)}
                    options={filteredValid}
                    invalidOptions={invalid}
                    strictness={resolvedOptions
                      ? (optionsMode === 'suggest' ? 'guide' : 'strict')
                      : resolveFieldStrictness(fieldKey, {})}
                    hasIssue={hasIssue}
                    modified={isChanged}
                  />
                  {prevBox}
                </div>
                {diffLine}
                {fieldIssues.map((issue, i) => (
                  <p key={i} className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}>
                    {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                  </p>
                ))}
                {warnMsg && (
                  <p className="text-[10px] mt-0.5 text-amber-600">⚠ {warnMsg}</p>
                )}
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
              setMgrPickerField(null)
              setMgrPickerExclude(undefined)
              setMgrPickerOrgCode(undefined)
            }}
            onClose={() => {
              setMgrPickerField(null)
              setMgrPickerExclude(undefined)
              setMgrPickerOrgCode(undefined)
            }}
          />
        )}

        {orgPickerField && (
          <OrgSearchDialog
            afterOrganizations={afterOrganizations}
            orgMasterEntries={masters.orgMasterEntries}
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

      {/* ポジション新設ダイアログ（フォーム内 [変更] ボタン用）*/}
      {newPosDlgOpen && (
        <NewPositionDialog
          suggestedCode={(() => {
            // 既に内部コードが割り当て済みならそのまま表示（再クリックで別コードが発行されないように）
            const cur = values.positionCode as string | undefined
            if (cur?.startsWith('_pos_')) return cur
            // 未割当の場合: allocationList の _pos_ 番号を収集して重複しない番号を探す
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
          })()}
          onConfirm={(code) => {
            handleChange('positionCode', code)
            setNewPosDlgOpen(false)
          }}
          onCancel={() => setNewPosDlgOpen(false)}
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
