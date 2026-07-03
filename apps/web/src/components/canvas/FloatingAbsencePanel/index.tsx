import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }  from '@personnel/domain/schemas'
import type { DragData }      from '../OrgViewContext'
import { appService }         from '../../../application/HRApplicationService'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import { TR }                 from '@personnel/domain/transferReasonLabels'
import { getAbsenceCategory, isAbsenceRow, ABSENCE_SHOW_THRESHOLD } from './helpers'
import type { AbsenceCategory } from './helpers'
import { AbsenceCard, buildAbsenceDragData } from './AbsenceCard'
import { AbsenceDropDialog }  from './AbsenceDropDialog'

const PANEL_W = 272
const PANEL_H = 400
const MARGIN  = 12

interface Props {
  allocationList:   AllocationRow[]
  orgsByCode:       Map<string, Organization>
  visible:          boolean
  containerRef:     React.RefObject<HTMLElement | null>
  onCardDoubleClick?: (rowId: number) => void
}

interface PendingDrop {
  rowId:      number
  personName: string
}

function clampToCanvas(x: number, y: number, rect: DOMRect): { x: number; y: number } {
  return {
    x: Math.max(rect.left + MARGIN, Math.min(rect.right  - PANEL_W - MARGIN, x)),
    y: Math.max(rect.top  + MARGIN, Math.min(rect.bottom - 60      - MARGIN, y)),
  }
}

function defaultPos(rect: DOMRect): { x: number; y: number } {
  return {
    x: rect.right  - PANEL_W - MARGIN,
    y: rect.bottom - PANEL_H - MARGIN,
  }
}

export function FloatingAbsencePanel({ allocationList, orgsByCode, visible, containerRef, onCardDoubleClick }: Props) {
  // ── キャンバス境界の追跡 ──────────────────────────────────────────────────
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setCanvasRect(el.getBoundingClientRect())
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => { ro.disconnect(); window.removeEventListener('resize', update) }
  }, [containerRef])

  // ── パネル位置 ────────────────────────────────────────────────────────────
  const [pos,    setPos]    = useState<{ x: number; y: number } | null>(null)
  const dragRef             = useRef<{ startX: number; startY: number; panelX: number; panelY: number } | null>(null)

  // キャンバスリサイズ時に既存位置をクランプし直す
  useEffect(() => {
    if (!canvasRect || !pos) return
    const clamped = clampToCanvas(pos.x, pos.y, canvasRect)
    if (clamped.x !== pos.x || clamped.y !== pos.y) setPos(clamped)
  // posを依存に含めると無限ループになるため意図的に除外
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRect])

  // 表示位置の確定（レンダー時にクランプ）
  const displayPos = canvasRect
    ? (pos ? clampToCanvas(pos.x, pos.y, canvasRect) : defaultPos(canvasRect))
    : (pos ?? { x: window.innerWidth - PANEL_W - MARGIN, y: window.innerHeight - PANEL_H - MARGIN })

  // ── UI状態 ─────────────────────────────────────────────────────────────────
  const [searchText,  setSearchText]  = useState('')
  const [dragOver,    setDragOver]    = useState(false)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)

  // ── データ ─────────────────────────────────────────────────────────────────
  const absenceRows = useMemo(() => allocationList.filter(isAbsenceRow), [allocationList])

  const resignationCount = useMemo(
    () => absenceRows.filter(r => (r.transferReason as string | undefined) === TR.TERMINATION).length,
    [absenceRows],
  )
  const transferCount = useMemo(
    () => absenceRows.filter(r => (r.transferReason as string | undefined) === TR.TRANSFER).length,
    [absenceRows],
  )

  const visibleRows = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return absenceRows
    return absenceRows.filter(r => {
      const name    = `${r.lastName ?? ''}${r.firstName ?? ''}`.toLowerCase()
      const orgCode = (r.prevDepartmentCode as string | undefined) ?? ''
      const orgName = orgsByCode.get(orgCode)?.name?.toLowerCase() ?? ''
      return name.includes(q) || orgCode.toLowerCase().includes(q) || orgName.includes(q)
    })
  }, [absenceRows, searchText, orgsByCode])

  const showSearch = absenceRows.length > ABSENCE_SHOW_THRESHOLD || searchText !== ''

  // ── パネルヘッダーをドラッグして移動 ─────────────────────────────────────
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input')) return
    e.preventDefault()
    const start = { startX: e.clientX, startY: e.clientY, panelX: displayPos.x, panelY: displayPos.y }
    dragRef.current = start

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current || !canvasRect) return
      const raw = {
        x: dragRef.current.panelX + ev.clientX - dragRef.current.startX,
        y: dragRef.current.panelY + ev.clientY - dragRef.current.startY,
      }
      setPos(clampToCanvas(raw.x, raw.y, canvasRect))
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── 不在ボックスへのドロップ ──────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
    if (data.fromAbsence) return

    const rowId = data.fromRowId
    if (!rowId) return
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return
    const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || '—'
    setPendingDrop({ rowId, personName: name })
  }

  // ── ダイアログ確定 ────────────────────────────────────────────────────────
  const handleDropConfirm = useCallback((category: AbsenceCategory, memo: string) => {
    if (!pendingDrop) return
    const transferReason = category === '退職' ? TR.TERMINATION : TR.TRANSFER
    appService.executeOperation(
      new DirectEditOperation(pendingDrop.rowId, { transferReason, ...(memo ? { memo } : {}) }, `${category}設定`),
    )
    setPendingDrop(null)
  }, [pendingDrop])

  // ── 不在ボックスカードのドラッグ開始 ─────────────────────────────────────
  const handleCardDragStart = (e: React.DragEvent, row: AllocationRow) => {
    e.dataTransfer.setData('application/json', JSON.stringify(buildAbsenceDragData(row)))
    e.dataTransfer.effectAllowed = 'move'
  }

  if (!visible) return null

  return createPortal(
    <>
      <div
        style={{ left: displayPos.x, top: displayPos.y, width: PANEL_W }}
        className={`fixed z-[150] bg-white rounded-xl shadow-2xl border flex flex-col select-none transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* ヘッダー（ドラッグで移動） */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-gray-100 cursor-move rounded-t-xl bg-gray-50"
          onMouseDown={handleHeaderMouseDown}
        >
          <span className="text-[11px] font-semibold text-gray-600 flex-1">4/1 不在</span>
          {resignationCount > 0 && (
            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">
              退職 {resignationCount}
            </span>
          )}
          {transferCount > 0 && (
            <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">
              移籍 {transferCount}
            </span>
          )}
          {absenceRows.length === 0 && (
            <span className="text-[10px] text-gray-400">なし</span>
          )}
        </div>

        {/* 検索（閾値超えたら表示） */}
        {showSearch && (
          <div className="px-2 pt-1.5 pb-1">
            <input
              type="text"
              placeholder="名前・組織で検索"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            {searchText && (
              <p className="text-[10px] text-gray-400 mt-0.5 pl-1">{visibleRows.length}件ヒット</p>
            )}
          </div>
        )}

        {/* カードリスト */}
        <div className="overflow-y-auto max-h-72 py-1">
          {visibleRows.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-4 leading-relaxed">
              {absenceRows.length === 0
                ? <>ここにカードをドロップ<br />退職・移籍として登録します</>
                : '該当なし'}
            </p>
          ) : (
            visibleRows.map(row => {
              const cat = getAbsenceCategory(row)!
              const prevOrgName = orgsByCode.get(row.prevDepartmentCode as string ?? '')?.name ?? ''
              return (
                <AbsenceCard
                  key={row.rowId}
                  row={row}
                  category={cat}
                  prevOrgName={prevOrgName}
                  onDragStart={handleCardDragStart}
                  onDoubleClick={onCardDoubleClick}
                />
              )
            })
          )}
        </div>

        {dragOver && (
          <div className="px-3 pb-2 text-[10px] text-blue-600 text-center font-medium">
            ↓ ここで離すと登録
          </div>
        )}
      </div>

      {pendingDrop && (
        <AbsenceDropDialog
          personName={pendingDrop.personName}
          onConfirm={handleDropConfirm}
          onCancel={() => setPendingDrop(null)}
        />
      )}
    </>,
    document.body,
  )
}
