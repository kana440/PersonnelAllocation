import { useRef, useEffect, useCallback, useState } from 'react'
import { EditView } from './EditView'
import { useStore } from '../../store/useStore'

const FLOAT_W_DEFAULT = 560
const FLOAT_H_DEFAULT = 580
const FLOAT_MIN_W     = 360
const FLOAT_MIN_H     = 320

export function FloatingEditor() {
  const { editMode, exitEditMode, isHistoryPreviewMode } = useStore()

  // ── 位置・サイズ ───────────────────────────────────────────────────────────
  const [pos,  setPos]  = useState(() => ({
    x: Math.max(0, (window.innerWidth  - FLOAT_W_DEFAULT) / 2),
    y: Math.max(0, (window.innerHeight - FLOAT_H_DEFAULT) / 3),
  }))
  const [size, setSize] = useState({ w: FLOAT_W_DEFAULT, h: FLOAT_H_DEFAULT })

  // ── ドラッグ移動 ──────────────────────────────────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-resize]')) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, dragRef.current.ox + ev.clientX - dragRef.current.startX),
        y: Math.max(0, dragRef.current.oy + ev.clientY - dragRef.current.startY),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos])

  // ── リサイズ（右下コーナー）────────────────────────────────────────────────
  const resizeRef = useRef<{ startX: number; startY: number; sw: number; sh: number } | null>(null)

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    resizeRef.current = { startX: e.clientX, startY: e.clientY, sw: size.w, sh: size.h }

    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return
      setSize({
        w: Math.max(FLOAT_MIN_W, resizeRef.current.sw + ev.clientX - resizeRef.current.startX),
        h: Math.max(FLOAT_MIN_H, resizeRef.current.sh + ev.clientY - resizeRef.current.startY),
      })
    }
    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size])

  // Esc キーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && editMode) exitEditMode() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editMode, exitEditMode])

  if (!editMode) return null

  return (
    <div
      className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      {/* ドラッグハンドル（タイトルバー） */}
      <div
        className={`flex-shrink-0 h-8 border-b flex items-center px-3 gap-2 cursor-move select-none ${
          isHistoryPreviewMode
            ? 'bg-amber-50 border-amber-200'
            : 'bg-gray-100 border-gray-200'
        }`}
        onMouseDown={onDragStart}
      >
        {isHistoryPreviewMode
          ? <span className="text-[11px] font-semibold text-amber-600 flex-1">🔍 照会（プレビュー中・保存不可）</span>
          : <span className="text-[11px] font-semibold text-gray-500 flex-1">編集</span>
        }
        <button
          onClick={exitEditMode}
          className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors text-xs"
          title="閉じる (Esc)"
        >✕</button>
      </div>

      {/* EditView 本体 */}
      <div className="flex-1 overflow-hidden">
        <EditView readOnly={isHistoryPreviewMode} />
      </div>

      {/* リサイズハンドル（右下） */}
      <div
        data-resize="true"
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={onResizeStart}
        style={{ background: 'linear-gradient(135deg, transparent 50%, #d1d5db 50%)' }}
      />
    </div>
  )
}
