import { useState, useMemo, useRef, useEffect } from 'react'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import { CONCURRENT_TYPES } from '@personnel/domain/masters/concurrentType'
import { FIELD_METADATA } from '@personnel/domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { useStore } from '../../../store/useStore'
import { OrgPickerModal } from '../../common/OrgPickerModal'

// ── 定数 ─────────────────────────────────────────────────────────────────────

// after/prev 両方に同じ選択肢を使うコンボフィールドの定義
const COMBO_PAIRS: Array<[string, (ms: AllMasters) => string[]]> = [
  ['transferReason',       ms => ms.transferReasons.map(e => e.label)],
  ['employmentType',       ms => ms.employmentTypes.map(e => e.label)],
  ['officialPositionCode', ms => ms.officialPositions.map(e => e.label)],
  ['location',             ms => ms.workLocations.map(e => e.label)],
  ['jobFamily',            ms => ms.jobFamilies.map(e => e.label)],
  ['jobType',              ms => ms.jobTypes.map(e => e.label)],
  ['positionBand',         ms => ms.jobLevels.map(e => e.label)],
  ['band',                 ms => ms.jobLevels.map(e => e.label)],
  ['payGrade',             ms => ms.payGrades.map(e => e.label)],
  ['concurrentReason',     ms => ms.concurrentReasons.map(e => e.label)],
]
const prevOf = (k: string) => `prev${k[0].toUpperCase()}${k.slice(1)}`
const COMBO_OPTIONS = Object.fromEntries(
  COMBO_PAIRS.flatMap(([k, fn]) => [[k, fn], [prevOf(k), fn]])
) as Partial<Record<string, (ms: AllMasters) => string[]>>

const FLAG_FIELDS = new Set([
  'positionUnionFlag',          'prevPositionUnionFlag',
  'positionDiscretionaryWorkFlag', 'prevPositionDiscretionaryWorkFlag',
  'trainingPositionFlag',       'prevTrainingPositionFlag',
  'unionFlag',                  'prevUnionFlag',
  'discretionaryWorkFlag',      'prevDiscretionaryWorkFlag',
  'nonUnionAgreementFlag',      'prevNonUnionAgreementFlag',
  'leaveOfAbsenceSign',         'prevLeaveOfAbsenceSign',
])
const ORG_PICKER_FIELDS = new Set(['departmentCode', 'prevDepartmentCode'])
const CONCURRENT_FIELDS = new Set(['concurrentType', 'prevConcurrentType'])

// ラベルは ALLOCATION_LIST_LABEL_MAP の header から自然に取得
// after-fields: 'xxx_新'  / before-fields: 'xxx'  (Excel 列ヘッダーの命名規則をそのまま使用)
const hdr = (key: string) => ALLOCATION_LIST_LABEL_MAP[key]?.header ?? key
const mkF  = (key: string) => ({ key, label: hdr(key) })

const COMMON_FIELDS = [
  { key: '__name__',      label: '氏名' },
  { key: '__orgPath__',   label: '組織（階層）' },
  { key: 'userId',        label: 'ユーザーID' },
  { key: 'groupEmployeeId', label: 'グループ社員ID' },
  { key: 'employeeNumber',  label: '社員番号' },
  { key: 'transferReason',  label: '申請区分(異動事由)' },
  { key: 'memo',            label: 'メモ' },
  { key: 'demotionReason',  label: '降格理由' },
]
const AFTER_MAIN   = FIELD_METADATA.filter(m => !FLAG_FIELDS.has(String(m.after))).map(m => mkF(String(m.after)))
const AFTER_FLAGS  = FIELD_METADATA.filter(m =>  FLAG_FIELDS.has(String(m.after))).map(m => mkF(String(m.after)))
const BEFORE_MAIN  = FIELD_METADATA.filter(m => !FLAG_FIELDS.has(String(m.before))).map(m => mkF(String(m.before)))
const BEFORE_FLAGS = FIELD_METADATA.filter(m =>  FLAG_FIELDS.has(String(m.before))).map(m => mkF(String(m.before)))

// ── Sub-components ────────────────────────────────────────────────────────────

function ComboInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  const [open, setOpen] = useState(false)
  const filtered = useMemo(
    () => (value ? options.filter(o => o.toLowerCase().includes(value.toLowerCase())) : options).slice(0, 20),
    [options, value]
  )
  return (
    <div className="relative flex-1 min-w-0">
      <input type="text" value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full text-[9px] border border-gray-200 rounded px-1.5 py-0.5 pr-4 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white" />
      {value && <button onMouseDown={e => { e.preventDefault(); onChange('') }} className="absolute right-1 top-0.5 text-gray-400 text-[9px]">×</button>}
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 min-w-full bg-white border border-gray-200 rounded shadow-lg max-h-36 overflow-y-auto">
          {filtered.map(o => <div key={o} onMouseDown={() => { onChange(o); setOpen(false) }}
            className={`px-2 py-0.5 text-[9px] cursor-pointer hover:bg-blue-50 whitespace-nowrap ${value === o ? 'bg-blue-50 font-medium' : ''}`}>{o}</div>)}
        </div>
      )}
    </div>
  )
}

function FlagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded overflow-hidden border border-gray-200 flex-shrink-0">
      <button onClick={() => onChange('')} className={`px-1.5 py-0.5 text-[9px] transition-colors ${!value ? 'bg-gray-100 text-gray-600 font-medium' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>全て</button>
      <button onClick={() => onChange(value === '!!true'  ? '' : '!!true')}  className={`px-1.5 py-0.5 text-[9px] transition-colors border-l border-gray-200 ${value === '!!true'  ? 'bg-blue-500 text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>あり</button>
      <button onClick={() => onChange(value === '!!false' ? '' : '!!false')} className={`px-1.5 py-0.5 text-[9px] transition-colors border-l border-gray-200 ${value === '!!false' ? 'bg-red-500  text-white' : 'bg-white text-gray-400 hover:bg-gray-50'}`}>なし</button>
    </div>
  )
}

function SelectChipsInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-0.5 flex-wrap">
      {CONCURRENT_TYPES.map(opt => (
        <button key={opt} onClick={() => onChange(value === opt ? '' : opt)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors ${value === opt ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>{opt}</button>
      ))}
    </div>
  )
}

function OrgPickerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const afterOrgs = useStore(s => s.afterOrganizations)
  const orgByCode = useMemo(() => new Map(afterOrgs.filter(o => o.externalCode).map(o => [o.externalCode!, o])), [afterOrgs])
  const orgById   = useMemo(() => new Map(afterOrgs.map(o => [o.id, o])), [afterOrgs])
  const name      = (orgByCode.get(value) ?? orgById.get(value))?.name
  return (
    <div className="flex gap-0.5 items-center flex-1 min-w-0">
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="組織コード"
        className="flex-1 min-w-0 text-[9px] border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white" />
      {name && <span className="text-[9px] text-blue-600 truncate max-w-[5rem] flex-shrink-0" title={name}>{name}</span>}
      {value && <button onClick={() => onChange('')} className="text-gray-400 text-[9px] flex-shrink-0">×</button>}
      <button onClick={() => setOpen(true)} title="組織を選択"
        className="flex-shrink-0 px-1.5 py-0.5 text-[9px] border border-gray-200 rounded bg-white hover:bg-gray-50 text-gray-500">…</button>
      {open && <OrgPickerModal open onClose={() => setOpen(false)}
        onSelect={id => { onChange(orgById.get(id)?.externalCode ?? id); setOpen(false) }} />}
    </div>
  )
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const el = ref.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 60)}px` }, [value])
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} rows={1}
    style={{ resize: 'none', overflow: 'hidden' }}
    className="flex-1 min-w-0 text-[9px] border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-200 bg-white" />
}

// ── FilterDetailPanel ─────────────────────────────────────────────────────────

interface Props {
  fieldConditions: Partial<Record<string, string>>
  onSetField:      (field: string, value: string) => void
  onClearAll:      () => void
  onClose:         () => void
  masters:         AllMasters
}

export function FilterDetailPanel({ fieldConditions, onSetField, onClearAll, onClose, masters }: Props) {
  const hasConditions = Object.values(fieldConditions).some(v => !!v?.trim())

  const renderInput = (key: string) => {
    const value = fieldConditions[key] ?? ''
    const set   = (v: string) => onSetField(key, v)
    if (ORG_PICKER_FIELDS.has(key))  return <OrgPickerInput value={value} onChange={set} />
    if (CONCURRENT_FIELDS.has(key))  return <SelectChipsInput value={value} onChange={set} />
    if (FLAG_FIELDS.has(key))        return <FlagInput value={value} onChange={set} />
    const getOpts = COMBO_OPTIONS[key]
    if (getOpts)                     return <ComboInput value={value} onChange={set} options={getOpts(masters)} />
    return                                  <TextInput value={value} onChange={set} />
  }

  const GRID = 'grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-3 gap-y-0.5'
  const LABEL = 'text-[9px] text-gray-500 flex-shrink-0 w-24 truncate'

  const renderGrid = (fields: typeof COMMON_FIELDS) => (
    <div className={GRID}>
      {fields.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-1">
          <label className={LABEL} title={label}>{label}</label>
          {renderInput(key)}
        </div>
      ))}
    </div>
  )

  const renderSection = (title: string, hdrCls: string, main: typeof AFTER_MAIN, flags: typeof AFTER_FLAGS) => (
    <div>
      <div className={`text-[9px] font-semibold px-1.5 py-0.5 mb-1 rounded-sm ${hdrCls}`}>{title}</div>
      {renderGrid(main)}
      {flags.length > 0 && <>
        <div className="text-[9px] text-gray-400 mt-1 mb-0.5 ml-0.5">フラグ</div>
        {renderGrid(flags)}
      </>}
    </div>
  )

  return (
    <div className="px-2 pb-2 border-t border-blue-100 bg-blue-50/30">
      <div className="flex items-center gap-1 py-1 mb-1">
        <span className="text-[9px] font-semibold text-blue-700 flex-1">詳細条件（AND 絞り込み）</span>
        <button onClick={onClearAll} disabled={!hasConditions}
          className="text-[9px] text-gray-400 hover:text-red-600 disabled:opacity-30 underline">全クリア</button>
        <button onClick={onClose} className="text-[9px] text-gray-400 hover:text-gray-700 ml-1">▲ 畳む</button>
      </div>
      <div className="max-h-80 overflow-y-auto space-y-3">
        {renderSection('共通情報', 'bg-gray-100 text-gray-600',     COMMON_FIELDS, [])}
        {renderSection('新',       'bg-blue-100 text-blue-700',     AFTER_MAIN,  AFTER_FLAGS)}
        {renderSection('旧',       'bg-amber-50 text-amber-700',    BEFORE_MAIN, BEFORE_FLAGS)}
      </div>
    </div>
  )
}
