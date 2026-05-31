import { detectChanges }         from '../../domain/review/changeDetection'
import { deriveEditPatterns, EDIT_PATTERN_META } from '../../domain/editPattern'
import type { EditPattern }       from '../../domain/editPattern'
import type { AllocationRow }     from '../../domain/allocationRow'
import { useStore }               from '../../store/useStore'

// 雇用タイプバッジ（出向受入のみ表示）
function useEmpBadge(row: AllocationRow): { label: string; cls: string } | null {
  const { codeLists } = useStore()
  const et = row.employmentType as string | undefined
  if (!et) return null
  const entry = codeLists.employmentTypes.find(e => e.label === et || e.code === et)
  if (!entry?.isOutsourceAcceptance) return null
  return { label: '出向受入', cls: 'bg-orange-100 text-orange-700' }
}

interface Props {
  x:             number
  y:             number
  row:           AllocationRow
  onEditPattern: (pattern: EditPattern, rowId: number) => void
  onDirectEdit:  (rowId: number) => void
  onClose:       () => void
}

const MENU_W = 240
const MENU_H = 320

export function RowContextMenu({ x, y, row, onEditPattern, onDirectEdit, onClose }: Props) {
  const clampedX = Math.min(x, window.innerWidth  - MENU_W - 8)
  const clampedY = Math.min(y, window.innerHeight - MENU_H - 8)

  const { codeLists } = useStore()
  const empBadge = useEmpBadge(row)

  const { kinds } = detectChanges(row)
  const { active, available } = deriveEditPatterns(kinds, row, codeLists)

  const name          = [row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）'
  const posTitle      = row.localJobTitle || row.officialPositionCode || row.positionCode || ''
  const transferReason = (row.transferReason as string | undefined) ?? ''

  return (
    <>
      <div
        className="fixed inset-0 z-[9990]"
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
      />
      <div
        className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
        style={{ left: clampedX, top: clampedY, width: MENU_W }}
      >
        {/* ヘッダー */}
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-gray-800 truncate">{name}</div>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                {empBadge && (
                  <span className={`flex-shrink-0 text-[9px] font-medium px-1 py-0.5 rounded ${empBadge.cls}`}>
                    {empBadge.label}
                  </span>
                )}
                {posTitle && (
                  <span className="text-[10px] text-gray-400 truncate">{posTitle}</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-gray-300 hover:text-gray-500 text-xs leading-none mt-0.5"
            >✕</button>
          </div>
          <div className="mt-1 text-[10px] text-gray-500">
            異動事由: {transferReason
              ? <span className="text-gray-700">{transferReason}</span>
              : <span className="text-gray-300">―</span>
            }
          </div>
        </div>

        {/* 設定済みパターンのバッジ */}
        {active.length > 0 && (
          <div className="px-3 py-1.5 border-b border-gray-100 flex flex-wrap gap-1">
            {active.map(p => (
              <span
                key={p}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${EDIT_PATTERN_META[p].badgeColor}`}
              >{EDIT_PATTERN_META[p].label}</span>
            ))}
          </div>
        )}

        {/* パターンボタン群 */}
        <div className="py-0.5">
          {active.map(p => (
            <button
              key={p}
              onClick={() => { onEditPattern(p, row.rowId) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition-colors"
            >
              <span className="text-gray-400">✏</span>
              {EDIT_PATTERN_META[p].editLabel}
            </button>
          ))}

          {active.length > 0 && available.length > 0 && (
            <div className="mx-3 my-0.5 border-t border-gray-100" />
          )}

          {available.map(p => (
            <button
              key={p}
              onClick={() => { onEditPattern(p, row.rowId) }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 flex items-center gap-2 transition-colors"
            >
              <span className="text-gray-300">＋</span>
              {EDIT_PATTERN_META[p].addLabel}
            </button>
          ))}
        </div>

        {/* 直接編集ボタン */}
        <div className="border-t border-gray-100 px-3 py-2">
          <button
            onClick={() => { onDirectEdit(row.rowId); onClose() }}
            className="w-full text-center text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            直接編集する →
          </button>
        </div>
      </div>
    </>
  )
}
