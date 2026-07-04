import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { getGroupedFieldOptions } from '@personnel/domain/rules/options'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { ValidationResolutionDef } from '@personnel/domain/rules/resolve'
import { useStore } from '../../../../store/useStore'
import { appService } from '../../../../application/HRApplicationService'
import {
  JOB_PAIR_FIELD, OPTIONAL_COLUMNS, READONLY_FIELDS,
  buildOrgPathMap, getModalMode,
  type ColumnDef,
} from './helpers'
import { RecordRow } from './RecordRow'

interface Props {
  field:          string
  rowIds:         number[]
  resolutionDef?: ValidationResolutionDef
  onClose:        () => void
}

function resolveLabel(field: string): string {
  if (field === JOB_PAIR_FIELD) return 'ジョブタイプ・ジョブファミリー'
  return ALLOCATION_LIST_LABEL_MAP[field]?.ja ?? field
}

function getFieldStr(row: AllocationRow, f: string): string {
  return String((row as Record<string, unknown>)[f] ?? '')
}

const AFTER_COLS  = OPTIONAL_COLUMNS.filter(c => c.section === 'after')
const BEFORE_COLS = OPTIONAL_COLUMNS.filter(c => c.section === 'before')

// ── 列ドロップダウン ────────────────────────────────────────────────────────

interface ColPickerProps {
  visibleFields: Set<string>
  onToggle:      (field: string) => void
}

function ColPickerDropdown({ visibleFields, onToggle }: ColPickerProps) {
  const [open, setOpen]   = useState(false)
  const containerRef      = useRef<HTMLDivElement>(null)

  // クリックアウトで閉じる
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const renderCol = (col: ColumnDef) => (
    <label key={col.field}
      className={['flex items-center gap-2 px-3 py-1 text-[11px] select-none',
        col.readOnly ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50',
      ].join(' ')}>
      <input
        type="checkbox"
        checked={visibleFields.has(col.field)}
        disabled={col.readOnly}
        onChange={() => onToggle(col.field)}
        className="accent-blue-500 w-3 h-3 shrink-0"
      />
      <span className={col.readOnly ? 'text-gray-400' : 'text-gray-700'}>
        {col.label}
      </span>
      {col.readOnly && <span className="text-[9px] text-gray-300 ml-auto">固定</span>}
    </label>
  )

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1 text-[11px] px-2 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-600 whitespace-nowrap"
      >
        列 {open ? '▴' : '▾'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden flex flex-col max-h-72">
          <div className="overflow-y-auto flex-1">
            {/* 変更後（新） */}
            <div className="sticky top-0 px-3 py-1 bg-blue-50 text-[10px] font-semibold text-blue-600 uppercase tracking-wide border-b border-blue-100">
              変更後（新）
            </div>
            {AFTER_COLS.map(renderCol)}

            {/* 変更前（旧） */}
            <div className="sticky top-0 px-3 py-1 bg-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-t border-b border-gray-200 mt-1">
              変更前（旧）
            </div>
            {BEFORE_COLS.map(renderCol)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── メインコンポーネント ────────────────────────────────────────────────────

export function BulkFieldEditModal({ field, rowIds, resolutionDef, onClose }: Props) {
  const { allocationList, afterOrganizations, masters } = useStore()
  const mode   = getModalMode(field)
  const label  = resolutionDef?.label ?? resolveLabel(field)
  const isPair = field === JOB_PAIR_FIELD

  // Esc で閉じる
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  // ── 対象行 ────────────────────────────────────────────────────────────────
  const rowIdSet   = useMemo(() => new Set(rowIds), [rowIds])
  const targetRows = useMemo(() => allocationList.filter(r => rowIdSet.has(r.rowId)), [allocationList, rowIdSet])
  const orgPathMap = useMemo(() => buildOrgPathMap(afterOrganizations), [afterOrganizations])

  // ── 列表示設定 ────────────────────────────────────────────────────────────
  const [visibleFields, setVisibleFields] = useState<Set<string>>(new Set(READONLY_FIELDS))

  const visibleColumns: ColumnDef[] = useMemo(
    () => OPTIONAL_COLUMNS.filter(c => visibleFields.has(c.field)),
    [visibleFields],
  )

  const toggleColumn = useCallback((f: string) => {
    if (READONLY_FIELDS.has(f)) return
    setVisibleFields(prev => {
      const n = new Set(prev)
      n.has(f) ? n.delete(f) : n.add(f)
      return n
    })
  }, [])

  // ── フィルタ（フィールド選択 + テキスト、debounce 200ms） ─────────────────
  const [filterField, setFilterField] = useState('__all__')
  const [filterText,  setFilterText]  = useState('')
  const [debouncedQ,  setDebouncedQ]  = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filterText), 200)
    return () => clearTimeout(t)
  }, [filterText])

  const filterTargets = useMemo(() => [
    { value: '__all__',     label: 'すべての表示項目' },
    { value: '__name__',    label: '氏名' },
    { value: '__orgPath__', label: '組織（階層）' },
    { value: '__curVal__',  label: `${label}（現在値）` },
    ...visibleColumns.map(c => ({ value: c.field, label: c.label })),
  ], [label, visibleColumns])

  const filteredRows = useMemo(() => {
    if (!debouncedQ) return targetRows
    const q   = debouncedQ.toLowerCase()
    const chk = (s: string) => s.toLowerCase().includes(q)
    return targetRows.filter(row => {
      const name    = [row.lastName, row.firstName].filter(Boolean).join(' ')
      const orgPath = orgPathMap.get((row.departmentCode as string | undefined) ?? '') ?? ''
      const curVal  = isPair
        ? [(row.jobFamily as string | undefined), (row.jobType as string | undefined)].filter(Boolean).join(' / ')
        : getFieldStr(row, field)
      switch (filterField) {
        case '__all__':
          return chk(name) || chk(orgPath) || chk(curVal) || visibleColumns.some(c => chk(getFieldStr(row, c.field)))
        case '__name__':    return chk(name)
        case '__orgPath__': return chk(orgPath)
        case '__curVal__':  return chk(curVal)
        default:            return chk(getFieldStr(row, filterField))
      }
    })
  }, [targetRows, debouncedQ, filterField, field, isPair, visibleColumns, orgPathMap])

  // ── Bulk モード ────────────────────────────────────────────────────────────
  const fieldOptions = useMemo(() => {
    if (isPair || targetRows.length === 0) return []
    return getGroupedFieldOptions(field, targetRows[0], masters).valid
  }, [field, isPair, targetRows, masters])

  const suggestedValue = useMemo(() => {
    if (!resolutionDef || targetRows.length === 0) return ''
    return resolutionDef.suggestValue?.(targetRows[0]) ?? ''
  }, [resolutionDef, targetRows])

  const [newValue, setNewValue] = useState(() => suggestedValue)

  // ── Pair モード ────────────────────────────────────────────────────────────
  const jobFamilyOptions = useMemo(() => {
    if (!isPair || targetRows.length === 0) return []
    return getGroupedFieldOptions('jobFamily', targetRows[0], masters).valid
  }, [isPair, targetRows, masters])

  const [selectedFamily, setSelectedFamily] = useState('')
  const [selectedType,   setSelectedType]   = useState('')

  const jobTypeOptions = useMemo(() => {
    if (!isPair || !selectedFamily || targetRows.length === 0) return []
    return getGroupedFieldOptions('jobType', { ...targetRows[0], jobFamily: selectedFamily }, masters).valid
  }, [isPair, selectedFamily, targetRows, masters])

  // ── Inline モード ─────────────────────────────────────────────────────────
  const [edits, setEdits] = useState<Map<number, string>>(new Map())
  const setEdit = useCallback((id: number, v: string) =>
    setEdits(prev => new Map(prev).set(id, v)), [])

  // ── 適用 ─────────────────────────────────────────────────────────────────
  const canApply = mode === 'bulk'   ? !!newValue && filteredRows.length > 0
                 : mode === 'pair'   ? !!selectedFamily && !!selectedType && filteredRows.length > 0
                 : edits.size > 0

  const handleApply = () => {
    if (!canApply) return
    if (mode === 'bulk') {
      const values = { [field]: newValue }
      appService.executeBatch(`${label} 一括修正`,
        filteredRows.map(r =>
          resolutionDef
            ? resolutionDef.createCommand(r.rowId, values)
            : new DirectEditOperation(r.rowId, values, `${label} 一括修正`)
        ))
    } else if (mode === 'pair') {
      appService.executeBatch(`${label} 一括修正`,
        filteredRows.map(r => new DirectEditOperation(r.rowId,
          { jobFamily: selectedFamily, jobType: selectedType }, `${label} 一括修正`)))
    } else {
      const cmds = [...edits.entries()]
        .filter(([, v]) => v.trim() !== '')
        .map(([id, v]) => new DirectEditOperation(id, { [field]: v }, `${label} 修正`))
      if (cmds.length > 0) appService.executeBatch(`${label} 修正`, cmds)
    }
    onClose()
  }

  // ── レンダリング ──────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* ── ヘッダー ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <span className="text-sm font-bold text-gray-800">
            {mode === 'inline' ? '個別入力：' : '一括修正：'}{label}
          </span>
          <span className="text-xs text-gray-400">{rowIds.length} 件</span>
          <button onClick={onClose}
            className="ml-auto text-xl leading-none text-gray-400 hover:text-gray-600 transition-colors">×</button>
        </div>

        {/* ── 変更後の値（bulk / pair のみ） ────────────────────────────── */}
        {mode !== 'inline' && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
            <span className="text-xs font-medium text-gray-600 whitespace-nowrap">変更後の値</span>
            {mode === 'pair' ? (
              <>
                <select value={selectedFamily}
                  onChange={e => { setSelectedFamily(e.target.value); setSelectedType('') }}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">ジョブファミリーを選択</option>
                  {jobFamilyOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                <select value={selectedType} onChange={e => setSelectedType(e.target.value)}
                  disabled={!selectedFamily}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40">
                  <option value="">ジョブタイプを選択</option>
                  {jobTypeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </>
            ) : fieldOptions.length > 0 ? (
              <select value={newValue} onChange={e => setNewValue(e.target.value)}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">選択してください</option>
                {fieldOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type="text" value={newValue} onChange={e => setNewValue(e.target.value)}
                placeholder="値を入力"
                className="flex-1 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
            <button onClick={handleApply} disabled={!canApply}
              className={['whitespace-nowrap text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors',
                canApply ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              ].join(' ')}>
              {filteredRows.length} 件に適用 →
            </button>
          </div>
        )}

        {/* ── フィルタバー + 列ドロップダウン ──────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <span className="text-[11px] text-gray-500 shrink-0">絞り込み</span>
          <select value={filterField} onChange={e => { setFilterField(e.target.value); setFilterText('') }}
            className="text-[11px] border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 shrink-0 max-w-[10rem]">
            {filterTargets.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input type="text" value={filterText} onChange={e => setFilterText(e.target.value)}
            placeholder="検索テキスト..."
            className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" />
          {filterText && (
            <button onClick={() => { setFilterText(''); setDebouncedQ('') }}
              className="text-gray-400 hover:text-gray-600 text-sm shrink-0 transition-colors">×</button>
          )}
          <ColPickerDropdown visibleFields={visibleFields} onToggle={toggleColumn} />
        </div>

        {/* ── テーブルヘッダー ──────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-1.5 bg-gray-100 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wide overflow-x-auto">
          <span className="min-w-[8rem] shrink-0">氏名</span>
          {visibleColumns.map(col => (
            <span key={col.field}
              className={['shrink-0 truncate max-w-[7rem]',
                col.section === 'before' ? 'text-gray-400' : '',
              ].join(' ')}>
              {col.label}
            </span>
          ))}
          <span className="ml-auto shrink-0 min-w-[10rem] text-right">
            {label}{mode !== 'inline' ? '（現在値）' : ''}
          </span>
        </div>

        {/* ── 行リスト ──────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {filteredRows.length === 0 ? (
            <div className="text-center text-xs text-gray-400 py-10">
              {debouncedQ ? '絞り込み条件に一致する行がありません' : '対象行がありません'}
            </div>
          ) : filteredRows.map(row => (
            <RecordRow
              key={row.rowId}
              row={row}
              field={field}
              fieldLabel={label}
              orgPath={orgPathMap.get((row.departmentCode as string | undefined) ?? '') ?? ''}
              visibleColumns={visibleColumns}
              mode={mode}
              isPair={isPair}
              editValue={edits.get(row.rowId)}
              onEditChange={v => setEdit(row.rowId, v)}
            />
          ))}
        </div>

        {/* ── フッター ──────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-2 border-t border-gray-200 text-[10px] text-gray-400">
          <span>
            {debouncedQ
              ? `絞り込み中: ${filteredRows.length} 件 / 全 ${targetRows.length} 件`
              : `全 ${targetRows.length} 件`}
          </span>
          {mode === 'inline' && (
            <button onClick={handleApply} disabled={!canApply}
              className={['text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors',
                canApply ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              ].join(' ')}>
              {edits.size} 件を保存
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
