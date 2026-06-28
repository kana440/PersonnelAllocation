import React, { useState, useMemo } from 'react'
import type { Organization }   from '@personnel/domain/schemas'
import type { OrgMasterEntry } from '@personnel/domain/masters/orgMaster'
import { normalizeSearch }     from '../../../utils/normalizeSearch'
import {
  FILTER_FIELDS, FILTER_FIELD_LABEL,
  TEXT_OPS, LIST_OPS,
  makeFilterRule,
  type FilterCard, type FilterRule, type FilterField, type FilterOperator,
} from './types'
import { getFieldOptions } from './filterLogic'

// ── テキスト入力モード ────────────────────────────────────────────────────

interface TextInputProps {
  value:    string
  onChange: (v: string) => void
  options:  string[]
}

function TextInput({ value, onChange, options }: TextInputProps) {
  const [open, setOpen] = useState(false)
  const filtered = useMemo(() => {
    if (!value) return options.slice(0, 20)
    const q = normalizeSearch(value)
    return options.filter(o => normalizeSearch(o).includes(q)).slice(0, 20)
  }, [value, options])

  return (
    <div className="relative flex-1 min-w-0">
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="テキストを入力…"
        className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-blue-300"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-36 overflow-y-auto">
          {filtered.map(o => (
            <button
              key={o}
              onMouseDown={() => { onChange(o); setOpen(false) }}
              className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 text-gray-700 truncate"
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── リスト選択モード ──────────────────────────────────────────────────────

interface ListSelectProps {
  values:   string[]
  onChange: (v: string[]) => void
  options:  string[]
}

function ListSelect({ values, onChange, options }: ListSelectProps) {
  const [search, setSearch] = useState('')
  const [open,   setOpen]   = useState(false)

  const selectedSet = new Set(values)
  const filtered    = useMemo(() => {
    const q = normalizeSearch(search)
    return (search ? options.filter(o => normalizeSearch(o).includes(q)) : options).slice(0, 30)
  }, [search, options])

  const toggle = (v: string) => {
    const next = selectedSet.has(v) ? values.filter(x => x !== v) : [...values, v]
    onChange(next)
  }

  return (
    <div className="flex-1 min-w-0">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-0.5 mb-1">
          {values.map(v => (
            <span key={v} className="inline-flex items-center gap-0.5 px-1.5 py-0 bg-blue-100 text-blue-700 rounded text-[11px] leading-5">
              {v}
              <button onClick={() => onChange(values.filter(x => x !== v))} className="text-blue-400 hover:text-blue-700 font-bold leading-none ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <button onClick={() => setOpen(v => !v)} className="text-[11px] text-blue-500 hover:text-blue-700">
          ＋ {values.length === 0 ? '選択肢を追加' : '追加'}
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-0.5 w-56 bg-white border border-gray-200 rounded shadow-xl z-50 flex flex-col max-h-52">
            <div className="px-2 pt-1.5 pb-1 border-b border-gray-100 flex-shrink-0">
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="絞り込み…"
                className="w-full text-xs px-1.5 py-0.5 border border-gray-200 rounded focus:outline-none focus:border-blue-300"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0
                ? <div className="text-xs text-gray-400 text-center py-2">該当なし</div>
                : filtered.map(v => (
                    <label key={v} className="flex items-center gap-2 px-2 py-1 hover:bg-blue-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(v)}
                        onChange={() => toggle(v)}
                        className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
                      />
                      <span className="text-xs text-gray-700 truncate">{v}</span>
                    </label>
                  ))
              }
            </div>
            <div className="border-t border-gray-100 px-2 py-1 flex justify-between flex-shrink-0">
              <button onClick={() => onChange([])} className="text-[10px] text-gray-400 hover:text-red-500">全解除</button>
              <button onClick={() => { setOpen(false); setSearch('') }} className="text-[10px] text-gray-400 hover:text-gray-600">閉じる</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 1ルール行 ─────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule:             FilterRule
  orgMasterEntries: OrgMasterEntry[]
  afterOrgs:        Organization[]
  onChange:         (r: FilterRule) => void
  onRemove:         () => void
  canRemove:        boolean
}

function RuleRow({ rule, orgMasterEntries, afterOrgs, onChange, onRemove, canRemove }: RuleRowProps) {
  const options = useMemo(
    () => getFieldOptions(rule.field, orgMasterEntries, afterOrgs),
    [rule.field, orgMasterEntries, afterOrgs],
  )

  const isText = TEXT_OPS.has(rule.operator)
  const isList = LIST_OPS.has(rule.operator)

  const handleFieldChange = (field: FilterField) =>
    onChange({ ...rule, field, values: [] })

  const handleOpChange = (op: FilterOperator) => {
    const wasText  = TEXT_OPS.has(rule.operator)
    const willText = TEXT_OPS.has(op)
    onChange({ ...rule, operator: op, values: wasText !== willText ? [] : rule.values })
  }

  return (
    <div className="space-y-1.5">
      {/* フィールド + 演算子 + 削除 */}
      <div className="flex items-center gap-1">
        <select
          value={rule.field}
          onChange={e => handleFieldChange(e.target.value as FilterField)}
          className="border border-gray-200 rounded px-1 py-0.5 text-xs text-gray-700 focus:outline-none focus:border-blue-300 flex-shrink-0"
        >
          {FILTER_FIELDS.map(f => (
            <option key={f} value={f}>{FILTER_FIELD_LABEL[f]}</option>
          ))}
        </select>

        <select
          value={rule.operator}
          onChange={e => handleOpChange(e.target.value as FilterOperator)}
          className="border border-gray-200 rounded px-1 py-0.5 text-xs text-gray-700 focus:outline-none focus:border-blue-300 flex-shrink-0"
        >
          {rule.field === 'orgName' ? (
            <>
              <option value="contains">テキスト含む</option>
              <option value="not-contains">テキスト含まない</option>
              <option value="in">リスト選択（含む）</option>
              <option value="not-in">リスト選択（除く）</option>
            </>
          ) : (
            <>
              <option value="in">リスト選択（含む）</option>
              <option value="not-in">リスト選択（除く）</option>
              <option value="contains">テキスト含む</option>
              <option value="not-contains">テキスト含まない</option>
            </>
          )}
        </select>

        <button
          onClick={onRemove}
          disabled={!canRemove}
          className={`flex-shrink-0 text-sm leading-none px-0.5 ml-auto ${canRemove ? 'text-gray-300 hover:text-red-400' : 'text-gray-100 cursor-default'}`}
          title="この条件を削除"
        >×</button>
      </div>

      {/* 値入力 */}
      <div className="pl-1">
        {isText && (
          <TextInput
            value={rule.values[0] ?? ''}
            onChange={v => onChange({ ...rule, values: v ? [v] : [] })}
            options={options}
          />
        )}
        {isList && (
          <ListSelect
            values={rule.values}
            onChange={vs => onChange({ ...rule, values: vs })}
            options={options}
          />
        )}
      </div>

      {/* 配下を含む */}
      <div className="pl-1">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rule.subtree}
            onChange={e => onChange({ ...rule, subtree: e.target.checked })}
            className="w-3 h-3 accent-blue-600"
          />
          <span className="text-[10px] text-gray-500">配下を含む（サブツリー全体を表示）</span>
        </label>
      </div>
    </div>
  )
}

// ── FilterCardEditor ──────────────────────────────────────────────────────

interface Props {
  card:             FilterCard
  orgMasterEntries: OrgMasterEntry[]
  afterOrgs:        Organization[]
  onChange:         (updated: FilterCard) => void
  onSave:           () => void
  onCancel:         () => void
  onRemove:         () => void
}

export function FilterCardEditor({ card, orgMasterEntries, afterOrgs, onChange, onSave, onCancel, onRemove }: Props) {
  const updateRule = (id: string, updated: FilterRule) =>
    onChange({ ...card, rules: card.rules.map(r => r.id === id ? updated : r) })

  const removeRule = (id: string) =>
    onChange({ ...card, rules: card.rules.filter(r => r.id !== id) })

  const addRule = () =>
    onChange({ ...card, rules: [...card.rules, makeFilterRule()] })

  return (
    <div className="w-[340px]">
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <span className="text-[11px] font-semibold text-gray-600">フィルタ条件（AND）</span>
      </div>

      <div className="px-3 py-2.5 space-y-3 max-h-80 overflow-y-auto">
        {card.rules.map((rule, i) => (
          <React.Fragment key={rule.id}>
            {i > 0 && <div className="text-[10px] text-gray-400 text-center">AND</div>}
            <RuleRow
              rule={rule}
              orgMasterEntries={orgMasterEntries}
              afterOrgs={afterOrgs}
              onChange={updated => updateRule(rule.id, updated)}
              onRemove={() => removeRule(rule.id)}
              canRemove={card.rules.length > 1}
            />
          </React.Fragment>
        ))}
      </div>

      <div className="px-3 pb-2">
        <button onClick={addRule} className="text-[11px] text-blue-500 hover:text-blue-700 transition-colors">
          ＋ 条件を追加（AND）
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
        <button onClick={onRemove} className="text-[11px] text-red-400 hover:text-red-600 mr-auto">削除</button>
        <button onClick={onCancel} className="px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-200 rounded transition-colors">キャンセル</button>
        <button onClick={onSave}   className="px-2.5 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium">保存</button>
      </div>
    </div>
  )
}
