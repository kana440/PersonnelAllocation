import { useState, useRef, useEffect } from 'react'
import { useOrgView } from '../OrgViewContext'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { subtreeRowCount } from './helpers'
import { OrgSection } from './OrgSection'
import { NewRowOperationModal } from './NewRowOperationModal'
import {
  concurrentAddNewDef,
  secondmentInNewSFDef,
  secondmentInNewNonSFDef,
  concurrentSecondmentInNewSFDef,
  concurrentSecondmentInNewNonSFDef,
} from '@personnel/domain/commands/defs'
import type { EditOperation } from '@personnel/domain/commands/defs'

const ADD_OPS: { def: EditOperation; label: string }[] = [
  { def: concurrentAddNewDef,              label: '社内兼務追加' },
  { def: secondmentInNewSFDef,             label: '本務出向受入（SF統合先）' },
  { def: secondmentInNewNonSFDef,          label: '本務出向受入（SF非統合先）' },
  { def: concurrentSecondmentInNewSFDef,   label: '兼務出向受入（SF統合先）' },
  { def: concurrentSecondmentInNewNonSFDef, label: '兼務出向受入（SF非統合先）' },
]

interface OrgPanelProps {
  orgId:      string
  panelId:    string
  colorIndex: number
  onRemove:   () => void
}

export function OrgPanel({ orgId, panelId, colorIndex, onRemove }: OrgPanelProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const { showVacantPositions, toggleShowVacantPositions } = useCanvasLayoutStore()

  const org = organizations.find(o => o.id === orgId)
  if (!org) return null

  const totalCount   = subtreeRowCount(orgId, organizations, id => positionTreeByOrgId.get(id)?.length ?? 0)
  const isDropTarget = dragOverOrgId === orgId

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activeOp, setActiveOp]         = useState<EditOperation | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    const close = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [dropdownOpen])

  const orgCode = org.externalCode ?? ''

  return (
    <div
      className={`flex-shrink-0 w-64 max-h-full flex flex-col border-2 rounded-xl shadow-sm transition-colors ${
        isDropTarget ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 bg-white'
      }`}
      onDragOver={e => handleDragOver(e, orgId)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, orgId)}
    >
      {/* パネルヘッダ */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold text-gray-800 truncate">{org.name}</span>
        <span className="text-[10px] text-gray-400 flex-shrink-0">({totalCount}名)</span>

        {/* 空席ポジション表示トグル */}
        <button
          onClick={toggleShowVacantPositions}
          className={`w-5 h-5 rounded flex items-center justify-center text-xs transition-colors ${
            showVacantPositions
              ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
              : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
          }`}
          title={showVacantPositions ? '空席ポジションを非表示' : '空席ポジションを表示'}
        >□</button>

        {/* 行追加ドロップダウン */}
        {orgCode && (
          <div className="relative flex-shrink-0" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:bg-blue-100 hover:text-blue-700 transition-colors text-xs font-bold"
              title="行を追加"
            >＋</button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-0.5 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                {ADD_OPS.map(({ def, label }) => (
                  <button
                    key={def.id}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                    onClick={() => { setActiveOp(def); setDropdownOpen(false) }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onRemove}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-[10px] leading-none"
          title="パネルを閉じる"
        >✕</button>
      </div>

      {/* スクロール可能な本体 */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        <OrgSection orgId={orgId} panelId={panelId} isRoot colorIndex={colorIndex} />
        {totalCount === 0 && (
          <p className="text-[10px] text-gray-400 text-center py-3">メンバーなし</p>
        )}
      </div>

      {/* 新規行追加モーダル */}
      {activeOp && (
        <NewRowOperationModal
          def={activeOp}
          orgCode={orgCode}
          onClose={() => setActiveOp(null)}
        />
      )}
    </div>
  )
}
