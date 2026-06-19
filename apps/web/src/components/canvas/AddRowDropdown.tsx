import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NewRowOperationModal } from './panel/NewRowOperationModal'
import type { EditOperation } from '@personnel/domain/commands/defs'
import {
  addEmptyPositionDef,
  concurrentAddNewDef,
  secondmentInNewSFDef,
  secondmentInNewNonSFDef,
  concurrentSecondmentInNewSFDef,
  concurrentSecondmentInNewNonSFDef,
} from '@personnel/domain/commands/defs'

const ADD_OPS: { def: EditOperation; label: string }[] = [
  { def: addEmptyPositionDef,               label: 'ポジション追加' },
  { def: concurrentAddNewDef,               label: '社内兼務追加' },
  { def: secondmentInNewSFDef,              label: '本務出向受入（SF統合先）' },
  { def: secondmentInNewNonSFDef,           label: '本務出向受入（SF非統合先）' },
  { def: concurrentSecondmentInNewSFDef,    label: '兼務出向受入（SF統合先）' },
  { def: concurrentSecondmentInNewNonSFDef, label: '兼務出向受入（SF非統合先）' },
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

  // クリックアウトで閉じる
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (
        !buttonRef.current?.contains(e.target as Node) &&
        !menuRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

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
            ? 'flex items-center gap-0.5 px-1.5 h-5 rounded text-[9px] font-medium text-white/60 hover:text-white hover:bg-white/20 transition-colors flex-shrink-0'
            : 'flex items-center gap-0.5 px-1 h-[14px] rounded text-[9px] font-medium text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors flex-shrink-0'
        }
      >＋追加</button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          onMouseDown={e => e.stopPropagation()}
        >
          {ADD_OPS.map(({ def, label }) => (
            <button
              key={def.id}
              onClick={e => { e.stopPropagation(); setActiveOp(def); setOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-[10px] text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
            >
              {label}
            </button>
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
