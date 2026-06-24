import React, { useState, useRef } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { createPortal } from 'react-dom'
import { NewRowOperationModal } from './panel/NewRowOperationModal'
import type { EditOperation } from '@personnel/domain/commands/defs'
import {
  addEmptyPositionDef,
  concurrentAddNewDef,
  secondmentInNewDef,
  concurrentSecondmentInNewDef,
} from '@personnel/domain/commands/defs'

type AddOpsGroup = { groupLabel: string; ops: { def: EditOperation; label: string }[] }

const ADD_OP_GROUPS: AddOpsGroup[] = [
  {
    groupLabel: '通常追加',
    ops: [
      { def: addEmptyPositionDef, label: '空席ポジション追加' },
      { def: concurrentAddNewDef, label: '社内兼務追加' },
    ],
  },
  {
    groupLabel: '出向受入',
    ops: [
      { def: secondmentInNewDef,           label: '本務出向受入' },
      { def: concurrentSecondmentInNewDef, label: '兼務出向受入' },
    ],
  },
]

interface Props {
  orgCode: string
  /** 'header': 色付きタイトルバー内（白文字）。'inline': InlineOrgSection ヘッダー（グレー） */
  variant: 'header' | 'inline'
}

/**
 * 組織パネル／InlineOrgSection に置くポジション追加ドロップダウン。
 * overflow:hidden 制約を受けないよう、メニューは createPortal で document.body に描画する。
 */
export function AddRowDropdown({ orgCode, variant }: Props) {
  const [open, setOpen]         = useState(false)
  const [menuPos, setMenuPos]   = useState<{ top: number; right: number } | null>(null)
  const [activeOp, setActiveOp] = useState<EditOperation | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef   = useRef<HTMLDivElement>(null)

  useClickOutside([buttonRef, menuRef], () => setOpen(false), open)

  if (!orgCode) return null

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 2, right: window.innerWidth - rect.right })
    }
    setOpen(v => !v)
  }

  const isHeader = variant === 'header'

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        onMouseDown={e => e.stopPropagation()}
        title="行を追加"
        className={
          isHeader
            ? 'flex items-center gap-0.5 px-1.5 h-5 rounded text-[9px] font-medium text-white/80 hover:text-white hover:bg-white/20 transition-colors flex-shrink-0'
            : 'flex items-center gap-0.5 px-1.5 h-[18px] rounded text-[9px] font-medium text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors flex-shrink-0'
        }
      >＋追加</button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          onMouseDown={e => e.stopPropagation()}
        >
          {ADD_OP_GROUPS.map((group, gi) => (
            <React.Fragment key={group.groupLabel}>
              {gi > 0 && <div className="border-t border-gray-100 my-1" />}
              <div className="px-3 py-0.5 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                {group.groupLabel}
              </div>
              {group.ops.map(({ def, label }) => (
                <button
                  key={def.id}
                  onClick={e => { e.stopPropagation(); setActiveOp(def); setOpen(false) }}
                  className="w-full text-left px-3 py-1.5 text-[10px] text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {label}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>,
        document.body,
      )}

      {/* モーダルはキャンバスの transform スタックコンテキスト外に portal する */}
      {activeOp && createPortal(
        <NewRowOperationModal
          def={activeOp}
          orgCode={orgCode}
          onClose={() => setActiveOp(null)}
        />,
        document.body,
      )}
    </>
  )
}
