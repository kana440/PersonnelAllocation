import React, { useState, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useClickOutside } from '../../../hooks/useClickOutside'
import { useOrgView } from '../OrgViewContext'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { subtreeRowCount } from './helpers'
import { OrgSection }       from './OrgSection'
import { BandMatrixPanel }   from './BandMatrixPanel'
import { NewRowOperationModal } from './NewRowOperationModal'
import {
  concurrentAddNewDef,
  secondmentInNewDef,
  concurrentSecondmentInNewDef,
} from '@personnel/domain/commands/defs'
import type { EditOperation } from '@personnel/domain/commands/defs'

type AddOpsGroup = { groupLabel: string; ops: { def: EditOperation; label: string }[] }

const ADD_OP_GROUPS: AddOpsGroup[] = [
  {
    groupLabel: '社内追加',
    ops: [{ def: concurrentAddNewDef, label: '社内兼務追加' }],
  },
  {
    groupLabel: '出向受入',
    ops: [
      { def: secondmentInNewDef,           label: '本務出向受入' },
      { def: concurrentSecondmentInNewDef, label: '兼務出向受入' },
    ],
  },
]

interface OrgPanelProps {
  orgId:      string
  panelId:    string
  colorIndex: number
  onRemove:   () => void
}

export function OrgPanel({ orgId, panelId, colorIndex, onRemove }: OrgPanelProps) {
  const {
    orgById, childrenByOrgId, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const {
    showVacantPositions, toggleShowVacantPositions,
    canvasPanelStyle,
  } = useCanvasLayoutStore(useShallow(s => ({
    showVacantPositions:       s.showVacantPositions,
    toggleShowVacantPositions: s.toggleShowVacantPositions,
    canvasPanelStyle:             s.canvasPanelStyle,
  })))

  const org = orgById.get(orgId)
  if (!org) return null

  const totalCount   = subtreeRowCount(orgId, childrenByOrgId, id => positionTreeByOrgId.get(id)?.length ?? 0)
  const isDropTarget = dragOverOrgId === orgId

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [activeOp, setActiveOp]         = useState<EditOperation | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useClickOutside([dropdownRef], () => setDropdownOpen(false), dropdownOpen)

  const orgCode = org.externalCode ?? ''

  return (
    <div
      className={`flex-shrink-0 max-h-full flex flex-col border-2 rounded-xl shadow-sm transition-colors
        ${canvasPanelStyle === 'band' ? 'w-52' : 'w-64'}
        ${isDropTarget ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 bg-white'}`}
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
              className="flex items-center gap-0.5 px-1.5 h-5 rounded text-[10px] font-semibold text-blue-600 hover:bg-blue-100 hover:text-blue-700 transition-colors border border-blue-200 hover:border-blue-300"
              title="行を追加"
            >＋ 追加</button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-0.5 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                {ADD_OP_GROUPS.map((group, gi) => (
                  <React.Fragment key={group.groupLabel}>
                    {gi > 0 && <div className="border-t border-gray-100 my-1" />}
                    <div className="px-3 py-0.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                      {group.groupLabel}
                    </div>
                    {group.ops.map(({ def, label }) => (
                      <button
                        key={def.id}
                        type="button"
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                        onClick={() => { setActiveOp(def); setDropdownOpen(false) }}
                      >
                        {label}
                      </button>
                    ))}
                  </React.Fragment>
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
      <div className="flex-1 overflow-y-auto min-h-0">
        {canvasPanelStyle === 'band'
          ? <BandMatrixPanel orgId={orgId} panelId={panelId} />
          : (
            <div className="p-2">
              <OrgSection orgId={orgId} panelId={panelId} isRoot colorIndex={colorIndex} />
            </div>
          )
        }
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
