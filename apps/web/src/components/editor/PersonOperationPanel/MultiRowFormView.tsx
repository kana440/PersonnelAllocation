import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import { ComboInput } from '../../common/ComboInput'
import { OrgSearchDialog } from '../OrgSearchDialog'
import { getGroupedFieldOptions } from '@personnel/domain/choices'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import type { MultiRowOperationDef, MultiRowFormSection } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'

const PREV_BOX = 'text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-[5px] min-h-[30px] break-all'

interface Props {
  def:                 MultiRowOperationDef
  anchor:              AllocationRow
  onBack:              () => void
  /** 各セクションの初期値を上書きする（ルーティング経由で company 等を渡す場合に使用） */
  overrideSectionVals?: Partial<Record<string, string>>[]
}

export function MultiRowFormView({ def, anchor, onBack, overrideSectionVals }: Props) {
  const { allocationList, afterOrganizations, masters } = useStore()

  const [sectionValues, setSectionValues] = useState<Record<string, string>[]>(
    () => def.sections.map((section, i): Record<string, string> => {
      const base: Record<string, string> = section.initialValues
        ? section.initialValues(anchor, allocationList)
        : {}
      const overrides = overrideSectionVals?.[i] ?? {}
      const merged: Record<string, string> = { ...base }
      for (const [k, v] of Object.entries(overrides)) {
        if (v !== undefined) merged[k] = v
      }
      return merged
    })
  )
  const [orgPicker,   setOrgPicker]   = useState<{ sectionIdx: number; field: string } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const ctx = useMemo(
    () => ({ allocationList, afterOrganizations, masters }),
    [allocationList, afterOrganizations, masters],
  )

  const setFieldValue = (sectionIdx: number, field: string, value: string) => {
    setSectionValues(prev => {
      const next = [...prev]
      next[sectionIdx] = { ...next[sectionIdx], [field]: value }
      return next
    })
  }

  const canSubmit = def.sections.every((section, i) => {
    if (section.style === 'delete') return true
    return section.inputs.filter(inp => inp.required).every(inp => !!(sectionValues[i]?.[inp.field as string]))
  })

  const handleSubmit = () => {
    setSubmitError(null)
    const cmd    = def.createCommand(anchor.rowId, sectionValues, ctx)
    const result = appService.executeOperation(cmd)
    if (!result.ok) {
      setSubmitError(result.errors.map(e => e.message).join(' / '))
      return
    }
    onBack()
  }

  const personName     = [anchor.lastName, anchor.firstName].filter(Boolean).join(' ') || '（空席）'
  const employeeNumber = (anchor.employeeNumber as string | undefined) ?? ''
  const rowCount       = def.affectedRowCount ?? def.sections.length

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1" title="戻る">←</button>
          <span className="text-xs font-semibold text-gray-700">{def.label}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 ml-6 text-[11px] text-gray-500">
          <span className="font-medium text-gray-700">{personName}</span>
          {employeeNumber && <span className="text-gray-400">{employeeNumber}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {def.description && (
          <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-3 py-2 leading-relaxed">
            {def.description}
          </div>
        )}

        {def.sections.map((section, sectionIdx) => {
          const isDelete  = section.style === 'delete'
          const isNew     = !!section.isNewRow
          const headerBg  = isDelete ? 'bg-red-50'   : isNew ? 'bg-green-50'  : 'bg-blue-50'
          const headerTxt = isDelete ? 'text-red-700' : isNew ? 'text-green-700' : 'text-blue-700'
          const border    = isDelete ? 'border-red-200' : isNew ? 'border-green-200' : 'border-blue-200'
          const icon      = isDelete ? '✕' : isNew ? '＋' : '✏'
          const vals      = sectionValues[sectionIdx] ?? {}

          return (
            <div key={sectionIdx} className={`rounded-lg border ${border} overflow-hidden`}>
              <div className={`${headerBg} px-3 py-1.5 flex items-center gap-1.5`}>
                <span className={`text-[10px] font-bold ${headerTxt}`}>{icon}</span>
                <span className={`text-[10px] font-semibold ${headerTxt}`}>
                  行{sectionIdx + 1}：{section.label}
                </span>
              </div>

              {isDelete ? (
                <DeleteSection section={section} anchor={anchor} allocationList={allocationList} />
              ) : (
                <div className="px-3 py-2.5 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div />
                    <div className="text-[9px] text-gray-400 text-right pr-1">発令前</div>
                  </div>

                  {section.notice && (
                    <div className="text-[11px] text-green-700 bg-green-50 border border-green-100 rounded px-2.5 py-1.5 leading-relaxed">
                      {section.notice}
                    </div>
                  )}

                  {section.inputs.map(inp => (
                    <SectionField
                      key={inp.field as string}
                      inp={inp}
                      isNewRow={isNew}
                      currentVal={vals[inp.field as string] ?? ''}
                      anchorVal={(anchor[inp.field] as string | undefined) ?? ''}
                      afterOrganizations={afterOrganizations}
                      options={getGroupedFieldOptions(inp.field as string, anchor, masters, undefined).valid}
                      onChange={v => setFieldValue(sectionIdx, inp.field as string, v)}
                      onOpenOrgPicker={() => setOrgPicker({ sectionIdx, field: inp.field as string })}
                    />
                  ))}
                </div>
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
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >実行（{rowCount}行）</button>
      </div>

      {orgPicker && (
        <OrgSearchDialog
          afterOrganizations={afterOrganizations}
          orgMasterEntries={masters.orgMasterEntries}
          onSelect={code => {
            setFieldValue(orgPicker.sectionIdx, orgPicker.field, code)
            setOrgPicker(null)
          }}
          onClose={() => setOrgPicker(null)}
        />
      )}
    </div>
  )
}

// ── フィールド1行 ─────────────────────────────────────────────────────────────

interface SectionFieldProps {
  inp:                import('@personnel/domain/commands/defs/index').OperationInput
  isNewRow:           boolean
  currentVal:         string
  anchorVal:          string
  afterOrganizations: { externalCode?: string; id: string; name: string }[]
  options:            string[]
  onChange:           (v: string) => void
  onOpenOrgPicker:    () => void
}

function SectionField({ inp, isNewRow, currentVal, anchorVal, afterOrganizations, options, onChange, onOpenOrgPicker }: SectionFieldProps) {
  const fieldKey      = inp.field as string
  const rawLabel      = inp.label ?? ALLOCATION_LIST_LABEL_MAP[fieldKey]?.ja ?? fieldKey
  const fieldLabel    = rawLabel.replace(/_新$/, '')
  const prevVal       = isNewRow ? '' : anchorVal
  const isChanged     = currentVal !== '' && currentVal !== prevVal
  const currentOrgName = inp.picker === 'org'
    ? (afterOrganizations.find(o => o.externalCode === currentVal || o.id === currentVal)?.name ?? '')
    : ''
  const prevOrgName = inp.picker === 'org' && prevVal
    ? (afterOrganizations.find(o => o.externalCode === prevVal || o.id === prevVal)?.name ?? prevVal)
    : ''

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">
        {fieldLabel}{inp.required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      <div className="grid grid-cols-2 gap-2">
        {inp.picker === 'org' ? (
          <div className="flex gap-1">
            <ComboInput value={currentVal} onChange={onChange} options={[]} modified={!!currentVal} />
            <button onClick={onOpenOrgPicker}
              className="px-1.5 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 flex-shrink-0"
              title="組織を検索">🔍</button>
          </div>
        ) : (
          <ComboInput value={currentVal} onChange={onChange} options={options} modified={!!currentVal} />
        )}
        <div className={PREV_BOX}>
          {prevVal
            ? (inp.picker === 'org' ? prevOrgName || prevVal : prevVal)
            : <span className="text-gray-300">—</span>
          }
        </div>
      </div>

      {currentOrgName && <p className="text-[10px] text-blue-600 mt-0.5 truncate">{currentOrgName}</p>}

      {isChanged && (
        <p className="text-[10px] mt-1 flex items-center gap-1 flex-wrap">
          <span className="text-gray-400 line-through">{prevVal || '（空）'}</span>
          <span className="text-gray-400">→</span>
          <span className="text-blue-600 font-medium">{currentVal}</span>
        </p>
      )}
    </div>
  )
}

// ── delete セクション ─────────────────────────────────────────────────────────

function DeleteSection({ section, anchor, allocationList }: {
  section:        MultiRowFormSection
  anchor:         AllocationRow
  allocationList: AllocationRow[]
}) {
  const related = section.relatedRowFinder?.(anchor, allocationList)
  const name    = related ? [related.lastName, related.firstName].filter(Boolean).join(' ') : undefined
  return (
    <div className="px-3 py-2.5">
      <p className="text-[11px] text-red-700 mb-1">{section.deleteDescription ?? 'この行を削除します。'}</p>
      {related
        ? <p className="text-[11px] font-medium text-red-800">{name || '（名前なし）'} / {related.departmentCode as string}</p>
        : <p className="text-[11px] text-gray-400">（対象行なし）</p>
      }
    </div>
  )
}
