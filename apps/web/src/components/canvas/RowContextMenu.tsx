import { detectPatterns }                              from '@personnel/domain/patterns/detection'
import { EDIT_PATTERN_META }                           from '@personnel/domain/patterns/editPattern'
import type { EditPattern }                            from '@personnel/domain/patterns/editPattern'
import type { AllocationRow }                          from '@personnel/domain/allocationRow'
import { useStore }                                    from '../../store/useStore'

// ── メニューセクション定義 ─────────────────────────────────────────────────────
// 業務上の文脈に沿った分類。availableFor() を通過した操作のみ各セクションに表示される。

const SECTIONS: { label: string; patterns: EditPattern[] }[] = [
  {
    label: '昇降格・役職変更',
    patterns: ['promotion', 'demotion', 'titleChange'],
  },
  {
    label: '職務内容・雇用形態',
    patterns: ['jobTypeChange', 'employmentExtension'],
  },
  {
    label: '組織への異動',
    patterns: ['orgTransfer', 'orgRestructure', 'managerChange', 'vacantPositionMove'],
  },
  {
    label: '兼務',
    patterns: ['concurrentAdd', 'concurrentRelease'],
  },
  {
    label: '出向',
    patterns: [
      'secondmentOut',    'secondmentIn',
      'secondmentOutRelease', 'secondmentInRelease',
      'concurrentSecondmentOut',    'concurrentSecondmentIn',
      'concurrentSecondmentOutRelease', 'concurrentSecondmentInRelease',
    ],
  },
  {
    label: '在籍・退職',
    patterns: [
      'leaveOfAbsence', 'returnFromLeave',
      'employmentTransferOut', 'employmentTransferIn',
      'resignation', 'noChange',
    ],
  },
]

// 雇用タイプバッジ（出向受入のみ表示）
function useEmpBadge(row: AllocationRow): { label: string; cls: string } | null {
  const { codeLists } = useStore()
  const et = row.employmentType as string | undefined
  if (!et) return null
  const entry = codeLists.employmentTypes.find(e => e.label === et || e.code === et)
  if (!entry?.isSecondmentAcceptance) return null
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

const MENU_W = 360

export function RowContextMenu({ x, y, row, onEditPattern, onDirectEdit, onClose }: Props) {
  const clampedX = Math.min(x, window.innerWidth  - MENU_W - 8)
  const clampedY = Math.min(y, window.innerHeight - 520 - 8)

  const { codeLists } = useStore()
  const empBadge = useEmpBadge(row)

  // 設定済みパターン（ヘッダー表示用）
  const active = detectPatterns(row).patterns

  // availableFor を通過した操作セット
  const passesFilter = (p: EditPattern) => {
    const cond = EDIT_PATTERN_META[p].availableFor
    return cond === undefined || cond(row, codeLists)
  }

  const name         = [row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）'
  const posTitle     = row.localJobTitle || row.officialPositionCode || row.positionCode || ''
  const transferReason = (row.transferReason as string | undefined) ?? ''

  return (
    <>
      <div
        className="fixed inset-0 z-[9990]"
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose() }}
      />
      <div
        className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col"
        style={{ left: clampedX, top: clampedY, width: MENU_W, maxHeight: '82vh' }}
      >
        {/* ── ヘッダー ── */}
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
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

          {/* 現在設定済みのパターン（情報表示のみ） */}
          {active.size > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {[...active].map(p => (
                <span
                  key={p}
                  className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ring-1 ring-current/30 ${EDIT_PATTERN_META[p].badgeColor}`}
                >
                  {EDIT_PATTERN_META[p].menuLabel ?? EDIT_PATTERN_META[p].label}
                </span>
              ))}
            </div>
          )}

          {transferReason && (
            <div className="mt-1 text-[10px] text-gray-400 truncate">
              {transferReason}
            </div>
          )}
        </div>

        {/* ── 操作セクション群 ── */}
        <div className="overflow-y-auto flex-1 py-2 px-3 space-y-3">
          {SECTIONS.map(({ label, patterns }) => {
            const visible = patterns.filter(passesFilter)
            if (visible.length === 0) return null
            return (
              <div key={label}>
                {/* セクションヘッダー */}
                <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-0.5">
                  {label}
                </div>
                {/* バッジボタン — 3列グリッドで等幅 */}
                <div className="grid grid-cols-3 gap-1">
                  {visible.map(p => {
                    const meta     = EDIT_PATTERN_META[p]
                    const isActive = active.has(p)
                    const blabel   = meta.menuLabel ?? meta.label
                    return (
                      <button
                        key={p}
                        onClick={() => { onEditPattern(p, row.rowId); onClose() }}
                        title={meta.label}
                        className={[
                          'py-1 rounded text-[11px] font-medium text-center',
                          'transition-all hover:brightness-95 active:scale-95',
                          meta.badgeColor,
                          isActive ? 'ring-1 ring-current/40' : 'opacity-80',
                        ].join(' ')}
                      >
                        {blabel}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 直接編集 ── */}
        <div className="border-t border-gray-100 px-3 py-2 flex-shrink-0">
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
