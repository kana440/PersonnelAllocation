import { useRef, useEffect, useCallback, useState } from 'react'
import { EditView } from './EditView'
import { PersonOperationPanel } from './PersonOperationPanel'
import { useStore } from '../../store/useStore'

const FLOAT_W_DEFAULT = 560
const FLOAT_H_DEFAULT = 580
const FLOAT_MIN_W     = 360
const FLOAT_MIN_H     = 320

export function FloatingEditor() {
  const {
    editMode, exitEditMode, isHistoryPreviewMode,
    operationPanelRowId, exitOperationPanel,
  } = useStore()

  const isOpen = editMode || operationPanelRowId !== null

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

  // ── リサイズ（右下コーナー・右端・下端）──────────────────────────────────
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

  const onRightResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = size.w
    const onMove = (ev: MouseEvent) =>
      setSize(prev => ({ ...prev, w: Math.max(FLOAT_MIN_W, startW + ev.clientX - startX) }))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size.w])

  const onBottomResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startY = e.clientY, startH = size.h
    const onMove = (ev: MouseEvent) =>
      setSize(prev => ({ ...prev, h: Math.max(FLOAT_MIN_H, startH + ev.clientY - startY) }))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [size.h])

  // Esc キーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editMode)                  exitEditMode()
      if (operationPanelRowId !== null) exitOperationPanel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [editMode, exitEditMode, operationPanelRowId, exitOperationPanel])

  if (!isOpen) return null

  const isOperationMode = operationPanelRowId !== null
  const onClose = isOperationMode ? exitOperationPanel : exitEditMode

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
            : isOperationMode
            ? 'bg-blue-50 border-blue-100'
            : 'bg-gray-100 border-gray-200'
        }`}
        onMouseDown={onDragStart}
      >
        {isHistoryPreviewMode
          ? <span className="text-[11px] font-semibold text-amber-600 flex-1">🔍 照会（プレビュー中・保存不可）</span>
          : isOperationMode
          ? <span className="text-[11px] font-semibold text-blue-600 flex-1">操作</span>
          : <span className="text-[11px] font-semibold text-gray-500 flex-1">編集</span>
        }
        <button
          onClick={onClose}
          className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors text-xs"
          title="閉じる (Esc)"
        >✕</button>
      </div>

      {/* 本体 */}
      <div className="flex-1 overflow-hidden">
        {isOperationMode
          ? <PersonOperationPanel rowId={operationPanelRowId} />
          : <EditView readOnly={isHistoryPreviewMode} />
        }
      </div>

      {/* 右端リサイズハンドル */}
      <div
        className="absolute top-8 right-0 w-1.5 cursor-ew-resize"
        style={{ bottom: '16px' }}
        onMouseDown={onRightResizeStart}
      />
      {/* 下端リサイズハンドル */}
      <div
        className="absolute bottom-0 left-0 h-1.5 cursor-s-resize"
        style={{ right: '16px' }}
        onMouseDown={onBottomResizeStart}
      />
      {/* 右下コーナーリサイズハンドル */}
      <div
        data-resize="true"
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={onResizeStart}
        style={{ background: 'linear-gradient(135deg, transparent 50%, #9ca3af 50%)' }}
      />
    </div>
  )
}
