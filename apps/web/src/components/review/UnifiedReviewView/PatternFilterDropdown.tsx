import { useState, useEffect, useRef } from 'react'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { ReviewData } from '../hooks/useReviewData'
import { PATTERN_CHIP_DEFS } from './helpers'
import { PatternReferenceModal } from '../../common/PatternReferenceModal'

interface Props {
  activePatterns: Set<EditPattern>
  onToggle:       (key: EditPattern) => void
  onClear:        () => void
  summary:        ReviewData['summary']
}

export function PatternFilterDropdown({ activePatterns, onToggle, onClear, summary }: Props) {
  const [open,    setOpen]    = useState(false)
  const [refOpen, setRefOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const count = activePatterns.size

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${
          count > 0
            ? 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
            : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
        }`}
      >
        変更種別{count > 0 && <span className="font-bold">({count})</span>}
        <span className="opacity-60">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-0.5 z-30 bg-white border border-gray-200 rounded-lg shadow-xl w-48 max-h-64 overflow-y-auto">
          {count > 0 && (
            <button
              onClick={() => { onClear(); setOpen(false) }}
              className="w-full text-left px-3 py-1 text-[10px] text-gray-400 hover:text-gray-700 hover:bg-gray-50 border-b border-gray-100"
            >
              クリア（{count}件選択中）
            </button>
          )}
          {PATTERN_CHIP_DEFS.map(({ key, label, color }) => {
            const cnt    = summary.byPattern.get(key) ?? 0
            const active = activePatterns.has(key)
            const dim    = cnt === 0 && !active
            return (
              <label
                key={key}
                className={`flex items-center gap-2 px-3 py-1.5 text-[10px] select-none ${
                  dim ? 'opacity-35 cursor-default' : 'cursor-pointer hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={active}
                  disabled={dim}
                  onChange={() => onToggle(key)}
                  className="accent-blue-500 w-3 h-3 shrink-0"
                />
                <span className={`px-1 py-0.5 rounded text-[9px] border ${color}`}>{label}</span>
                {cnt > 0 && <span className="ml-auto text-gray-400 text-[9px]">{cnt}</span>}
              </label>
            )
          })}
          {/* 一覧リンク */}
          <button
            onClick={() => { setOpen(false); setRefOpen(true) }}
            className="w-full text-left px-3 py-2 text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 border-t border-gray-100 transition-colors"
          >
            📋 判定ロジック一覧を見る →
          </button>
        </div>
      )}
      {refOpen && <PatternReferenceModal onClose={() => setRefOpen(false)} />}
    </div>
  )
}
