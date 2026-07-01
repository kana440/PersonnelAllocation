import { getGroupedFieldOptions } from '@personnel/domain/rules/options'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import type { OperationInput }    from '@personnel/domain/commands/defs/index'
import { isSectionDivider, isInputRow } from '@personnel/domain/commands/defs/index'
import type { SectionDivider, InputRow } from '@personnel/domain/commands/defs/index'
import { ComboInput }             from '../../../common/ComboInput'
import { BandStepFilter, filterBandsByStep } from '../BandStepFilter'
import type { FieldCtx }          from './types'
import type { AllocationRow }     from '@personnel/domain/allocationRow'

// ── 小型サブコンポーネント ────────────────────────────────────────────────────

function IssueList({ issues }: { issues: Array<{ field: string; message: string; level: 'error' | 'warning' }> }) {
  return (
    <>
      {issues.map(issue => (
        <p key={`${issue.field}-${issue.message}`}
          className={`text-[10px] mt-0.5 ${issue.level === 'error' ? 'text-red-500' : 'text-orange-500'}`}
        >
          {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
        </p>
      ))}
    </>
  )
}

function PrevBox({ value }: { value: string }) {
  return (
    <div className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-[5px] min-h-[30px] break-all">
      {value || <span className="text-gray-300">—</span>}
    </div>
  )
}

function DiffLine({ before, after }: { before: string; after: string }) {
  return (
    <p className="text-[10px] mt-1 flex items-center gap-1 flex-wrap">
      <span className="text-gray-400 line-through">{before || '（空）'}</span>
      <span className="text-gray-400">→</span>
      <span className="text-blue-600 font-medium">{after || '（空）'}</span>
    </p>
  )
}

// ── メイン FieldInput ────────────────────────────────────────────────────────

type Item = OperationInput | SectionDivider | InputRow

interface Props {
  item: Item
  ctx:  FieldCtx
}

export function FieldInput({ item, ctx }: Props) {
  const {
    row, values, draftRow, issues, allocationList, afterOrganizations,
    masters, stepMode, currentJobFamily, fieldsWithPrev,
    onChange, onCommit, onStepModeChange,
    openOrgPicker, openPosPicker, openMgrPicker, openPersonPicker, openNewPosDlg,
  } = ctx

  // ── 表示条件 ──────────────────────────────────────────────────────────────
  if (!isSectionDivider(item) && !isInputRow(item) && item.visibleWhen) {
    if (!item.visibleWhen(values, masters)) return null
  }

  // ── セクション区切り ──────────────────────────────────────────────────────
  if (isSectionDivider(item)) {
    return (
      <div className="flex items-center gap-2 pt-2 pb-0.5">
        <span className="text-[10px] font-semibold text-gray-500 tracking-wider">{item.label}</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    )
  }

  // ── 横並びグループ（readOnly フィールド用） ──────────────────────────────
  if (isInputRow(item)) {
    return (
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${item.inputs.length}, 1fr)` }}>
        {item.inputs.map(inp => {
          const fk      = inp.field as string
          const lbl     = (inp.label ?? ALLOCATION_LIST_LABEL_MAP[fk]?.ja ?? fk).replace(/_新$/, '')
          const val     = (values[inp.field] as string | undefined) ?? ''
          const prevFk  = `prev${fk.charAt(0).toUpperCase()}${fk.slice(1)}`
          const prevVal = (row[prevFk as keyof AllocationRow] as string | undefined) ?? ''
          const changed = fieldsWithPrev.has(fk) && !!prevVal && val !== prevVal
          return (
            <div key={fk}>
              <label className="text-xs font-medium text-gray-600 block mb-1">{lbl}</label>
              <div className={`text-xs bg-gray-50 border rounded px-2 py-[5px] min-h-[30px] text-gray-500 select-none truncate ${changed ? 'border-amber-400' : 'border-gray-200'}`}>
                {val || <span className="text-gray-300">—</span>}
              </div>
              {changed && <p className="text-[10px] text-gray-400 mt-0.5 truncate">前: {prevVal}</p>}
            </div>
          )
        })}
      </div>
    )
  }

  // ── 通常 OperationInput ──────────────────────────────────────────────────
  const { field, required, label, stepFilter, readOnly, picker, positionFilter, inputType, indicator, options: inputOptions, optionsMode, warningFn } = item
  if (indicator) return null

  const fieldKey   = field as string
  const fieldLabel = (label ?? ALLOCATION_LIST_LABEL_MAP[fieldKey]?.ja ?? fieldKey).replace(/_新$/, '')
  const currentVal   = (values[field] as string | undefined) ?? ''
  const committedVal = (row[field]  as string | undefined) ?? ''
  const prevKey      = `prev${fieldKey.charAt(0).toUpperCase()}${fieldKey.slice(1)}`
  const prevVal      = (row[prevKey as keyof AllocationRow] as string | undefined) ?? ''
  const hasPrev      = fieldsWithPrev.has(fieldKey)
  const fieldIssues  = issues.filter(i => i.field === fieldKey)
  const hasIssue     = fieldIssues.some(i => i.level === 'error' || i.level === 'warning')
  const isChanged    = currentVal !== committedVal
  const gridCls      = hasPrev ? 'grid grid-cols-2 gap-2' : ''
  const warnMsg      = warningFn?.({ allocationList, afterOrganizations, masters }, values)
  const prevBox      = hasPrev ? <PrevBox value={prevVal} /> : null
  const diffLine     = isChanged ? <DiffLine before={committedVal} after={currentVal} /> : null

  // ── チェックボックス ───────────────────────────────────────────────────
  if (inputType === 'checkbox') {
    const checked = !!currentVal && currentVal !== '0'
    return (
      <div>
        <div className={gridCls}>
          <label className={`flex items-center gap-2 min-h-[30px] ${readOnly ? 'cursor-default select-none' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={checked}
              disabled={readOnly}
              readOnly={readOnly}
              className="w-4 h-4 accent-blue-600 disabled:opacity-60"
              onChange={readOnly ? undefined : (e) => onChange(field, e.target.checked ? '1' : '')}
            />
            <span className="text-xs font-medium text-gray-600">{fieldLabel}</span>
          </label>
          {prevBox}
        </div>
        {diffLine}
      </div>
    )
  }

  // ── ポジション新設 picker ─────────────────────────────────────────────
  if (picker === 'newPosition') {
    const showWarning = !!(values.payGradeChangeSign as string | undefined)
      && (currentVal === prevVal || !currentVal)
    return (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">{fieldLabel}</label>
        <div className={gridCls}>
          <div className="flex items-center gap-1.5">
            <div className={`flex-1 text-xs bg-gray-50 border rounded px-2 py-[5px] min-h-[30px] text-gray-500 select-none ${isChanged ? 'border-amber-400' : 'border-gray-200'}`}>
              {currentVal || <span className="text-gray-300">—</span>}
            </div>
            <button type="button" onClick={openNewPosDlg}
              className="text-xs px-2.5 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 whitespace-nowrap flex-shrink-0"
            >変更</button>
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

  // ── 読み取り専用フィールド ────────────────────────────────────────────
  if (readOnly) {
    return (
      <div>
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

  // ── ポジション picker ─────────────────────────────────────────────────
  if (picker === 'position') {
    const posRow        = currentVal ? allocationList.find(r => r.positionCode === currentVal && !!r.userId) : undefined
    const posPersonName = posRow ? ([posRow.lastName, posRow.firstName].filter(Boolean).join(' ') || undefined) : undefined
    return (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <div className={gridCls}>
          <div className="flex gap-1">
            <ComboInput value={currentVal} onChange={v => onChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
            <button
              onClick={() => {
                const predicate = positionFilter ? positionFilter(row, { allocationList, afterOrganizations, masters }) : undefined
                const curCode   = (values[field] as string | undefined) ?? (row[field] as string | undefined)
                const mgrRow    = curCode ? allocationList.find(r => r.positionCode === curCode) : undefined
                const deptCode  = mgrRow?.departmentCode ?? row.departmentCode
                const orgId     = afterOrganizations.find(o => o.externalCode === deptCode)?.id
                openPosPicker(field, { filter: predicate, initOrg: orgId })
              }}
              className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
              title="ポジションを検索"
            >🔍</button>
          </div>
          {prevBox}
        </div>
        {posPersonName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{posPersonName}</p>}
        {diffLine}
        <IssueList issues={fieldIssues} />
      </div>
    )
  }

  // ── 人物 picker ────────────────────────────────────────────────────────
  if (picker === 'person') {
    const nameDisplay = [
      (values.lastName  as string | undefined) ?? '',
      (values.firstName as string | undefined) ?? '',
    ].filter(Boolean).join(' ')
    return (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <div className="flex gap-1">
          <ComboInput value={currentVal} onChange={v => onChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
          <button onClick={openPersonPicker}
            className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
            title="人物を検索"
          >🔍</button>
        </div>
        {nameDisplay && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{nameDisplay}</p>}
        {diffLine}
        <IssueList issues={fieldIssues} />
      </div>
    )
  }

  // ── 上司ポジション picker ─────────────────────────────────────────────
  if (picker === 'managerPosition') {
    const posRow        = currentVal ? allocationList.find(r => r.positionCode === currentVal && !!r.userId) : undefined
    const posPersonName = posRow ? ([posRow.lastName, posRow.firstName].filter(Boolean).join(' ') || undefined) : undefined
    return (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <div className={gridCls}>
          <div className="flex gap-1">
            <ComboInput value={currentVal} onChange={v => onChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
            <button
              onClick={() => {
                const predicate = positionFilter ? positionFilter(row, { allocationList, afterOrganizations, masters }) : undefined
                const exclude   = predicate
                  ? new Set(allocationList.filter(r => r.userId && !predicate(r)).map(r => r.userId!))
                  : undefined
                const deptCode  = (values.departmentCode ?? row.departmentCode) as string | undefined
                openMgrPicker(field, { exclude, orgCode: deptCode })
              }}
              className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
              title="上司を人物検索"
            >🔍</button>
          </div>
          {prevBox}
        </div>
        {posPersonName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{posPersonName}</p>}
        {diffLine}
        <IssueList issues={fieldIssues} />
      </div>
    )
  }

  // ── 組織 picker ────────────────────────────────────────────────────────
  if (picker === 'org') {
    const orgName = afterOrganizations.find(o => o.externalCode === currentVal || o.id === currentVal)?.name ?? ''
    return (
      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">
          {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        <div className={gridCls}>
          <div className="flex gap-1">
            <ComboInput value={currentVal} onChange={v => onChange(field, v)} options={[]} hasIssue={hasIssue} modified={isChanged} />
            <button onClick={() => openOrgPicker(fieldKey)}
              className="px-2 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
              title="組織を検索"
            >🔍</button>
          </div>
          {prevBox}
        </div>
        {orgName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{orgName}</p>}
        {diffLine}
        <IssueList issues={fieldIssues} />
      </div>
    )
  }

  // ── 通常フィールド (ComboInput) ──────────────────────────────────────
  const resolvedOptions = inputOptions
    ? (typeof inputOptions === 'function' ? inputOptions({ allocationList, afterOrganizations, masters }, row) : inputOptions) as string[]
    : null
  const { valid, invalid } = resolvedOptions
    ? { valid: resolvedOptions, invalid: [] as string[] }
    : getGroupedFieldOptions(fieldKey, draftRow, masters, currentJobFamily)
  const fieldBaseBand = (row[field] as string | undefined)
  const filteredValid = stepFilter
    ? filterBandsByStep(valid, fieldBaseBand, masters, stepMode, stepFilter)
    : valid

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">
        {fieldLabel}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {stepFilter && (
        <BandStepFilter mode={stepMode} direction={stepFilter} onChange={onStepModeChange} />
      )}
      <div className={gridCls}>
        <ComboInput
          value={currentVal}
          onChange={v => onChange(field, v)}
          onCommit={v => onCommit(field, v)}
          options={filteredValid}
          invalidOptions={invalid}
          strictness={resolvedOptions
            ? (optionsMode === 'suggest' ? 'guide' : 'strict')
            : (invalid.length > 0 ? 'guide' : 'free')}
          hasIssue={hasIssue}
          modified={isChanged}
        />
        {prevBox}
      </div>
      {diffLine}
      <IssueList issues={fieldIssues} />
      {warnMsg && <p className="text-[10px] mt-0.5 text-amber-600">⚠ {warnMsg}</p>}
    </div>
  )
}
