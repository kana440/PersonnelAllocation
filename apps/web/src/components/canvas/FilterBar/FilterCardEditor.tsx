import { useState, useMemo } from 'react'
import type { OrgMasterEntry } from '@personnel/domain/masters/orgMaster'
import { normalizeSearch } from '../../../utils/normalizeSearch'
import { PATH_FIELDS, PATH_FIELD_LABEL, lowerFields, type FilterCard, type PathField } from './types'
import { getAvailableValues } from './filterLogic'

// ── 1フィールドの複数選択 ────────────────────────────────────────────────

interface FieldSelectorProps {
  field:            PathField
  card:             FilterCard
  orgMasterEntries: OrgMasterEntry[]
  onChange:         (field: PathField, values: string[]) => void
}

function FieldSelector({ field, card, orgMasterEntries, onChange }: FieldSelectorProps) {
  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const selected            = card[field]

  const options = useMemo(
    () => getAvailableValues(field, card, orgMasterEntries),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [field, card, orgMasterEntries],
  )

  const filtered = search.trim()
    ? options.filter(v => normalizeSearch(v).includes(normalizeSearch(search)))
    : options

  if (options.length === 0) return null

  const toggle = (v: string) => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
    onChange(field, next)
  }

  return (
    <div>
      <div className="flex items-start gap-1.5 min-h-[22px]">
        <span className="text-[10px] font-semibold text-gray-500 w-14 flex-shrink-0 leading-5 pt-0.5">
          {PATH_FIELD_LABEL[field]}
        </span>
        <div className="flex-1 flex flex-wrap gap-1 items-center">
          {selected.map(v => (
            <span
              key={v}
              className="inline-flex items-center gap-0.5 px-1.5 py-0 bg-blue-100 text-blue-700 rounded text-[11px] leading-5"
            >
              {v}
              <button
                onClick={() => onChange(field, selected.filter(x => x !== v))}
                className="text-blue-400 hover:text-blue-700 font-bold ml-0.5 leading-none"
              >×</button>
            </span>
          ))}
          <div className="relative">
            <button
              onClick={() => setOpen(v => !v)}
              className="text-[11px] text-blue-500 hover:text-blue-700 px-1 leading-5"
            >
              {open ? '▴' : '＋'}
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
                            checked={selected.includes(v)}
                            onChange={() => toggle(v)}
                            className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-700 truncate">{v}</span>
                        </label>
                      ))
                  }
                </div>
                <div className="border-t border-gray-100 px-2 py-1 flex-shrink-0">
                  <button onClick={() => { setOpen(false); setSearch('') }} className="text-[10px] text-gray-400 hover:text-gray-600">
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── カードエディタ（ポップオーバー内コンテンツ）──────────────────────────

interface Props {
  card:             FilterCard
  orgMasterEntries: OrgMasterEntry[]
  onChange:         (updated: FilterCard) => void
  onRemove:         () => void
}

export function FilterCardEditor({ card, orgMasterEntries, onChange, onRemove }: Props) {
  const handleFieldChange = (field: PathField, values: string[]) => {
    const reset: Partial<FilterCard> = {}
    for (const f of lowerFields(field)) reset[f] = []
    onChange({ ...card, ...reset, [field]: values })
  }

  return (
    <div className="p-3 min-w-[280px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-600">フィルタ条件</span>
        <button
          onClick={onRemove}
          className="text-[11px] text-red-400 hover:text-red-600 font-medium"
        >削除</button>
      </div>
      <div className="space-y-1.5">
        {PATH_FIELDS.map(field => (
          <FieldSelector
            key={field}
            field={field}
            card={card}
            orgMasterEntries={orgMasterEntries}
            onChange={handleFieldChange}
          />
        ))}
      </div>
    </div>
  )
}
