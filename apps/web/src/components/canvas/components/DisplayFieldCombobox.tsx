import { useRef, useEffect, useState } from 'react'
import { useCanvasDisplayStore, CANVAS_DISPLAYABLE_FIELDS } from '../../../store/canvasDisplayStore'
import { BADGE_DISPLAY_INFO, ALL_OPERATION_BADGES } from '../../../config/badgeColors'
import type { OperationBadge } from '@personnel/domain/commands/defs/badge'

const MAX_FIELDS = 3

export function DisplayFieldCombobox() {
  const { displayFields, setDisplayFields, hiddenBadgeTypes, setHiddenBadgeTypes } = useCanvasDisplayStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggleField = (key: string) => {
    if (displayFields.includes(key)) {
      setDisplayFields(displayFields.filter(k => k !== key))
    } else if (displayFields.length < MAX_FIELDS) {
      setDisplayFields([...displayFields, key])
    }
  }

  const toggleBadge = (badge: OperationBadge) => {
    if (hiddenBadgeTypes.includes(badge)) {
      setHiddenBadgeTypes(hiddenBadgeTypes.filter(b => b !== badge))
    } else {
      setHiddenBadgeTypes([...hiddenBadgeTypes, badge])
    }
  }

  const atMax        = displayFields.length >= MAX_FIELDS
  const hiddenCount  = hiddenBadgeTypes.length

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`px-2 py-0.5 text-xs font-medium rounded border transition-colors ${
          open
            ? 'bg-gray-100 border-gray-400 text-gray-700'
            : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
        }`}
        title="カードに表示するフィールド・バッジを設定"
      >
        表示設定{displayFields.length > 0 ? ` (${displayFields.length})` : ''}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48 max-h-96 overflow-y-auto">

          {/* ── 変更バッジ ── */}
          <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            変更バッジ{hiddenCount > 0 ? ` (${hiddenCount}件非表示)` : ''}
          </div>
          {ALL_OPERATION_BADGES.map(badge => {
            const { color, label } = BADGE_DISPLAY_INFO[badge]
            const visible = !hiddenBadgeTypes.includes(badge)
            return (
              <label
                key={badge}
                className="flex items-center gap-2 px-3 py-1 text-xs cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => toggleBadge(badge)}
                  className="w-3 h-3 accent-blue-500 flex-shrink-0"
                />
                <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-medium leading-none ${color}`}>
                  {label}
                </span>
              </label>
            )
          })}

          {/* ── 追加表示フィールド ── */}
          <div className="border-t border-gray-100 mt-1">
            <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              追加表示フィールド
            </div>
            {atMax && (
              <div className="px-3 py-1 text-[10px] text-amber-600 bg-amber-50">
                最大{MAX_FIELDS}項目まで
              </div>
            )}
            {CANVAS_DISPLAYABLE_FIELDS.map(({ key, label }) => {
              const checked  = displayFields.includes(key)
              const disabled = !checked && atMax
              return (
                <label
                  key={key}
                  className={`flex items-center gap-2 px-3 py-1 text-xs transition-colors ${
                    disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleField(key)}
                    className="w-3 h-3 accent-blue-500 flex-shrink-0"
                  />
                  <span className={checked ? 'font-medium text-blue-700' : 'text-gray-700'}>{label}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
