import { useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { rowDiff } from '../../../domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '../../../domain/csvImport/allocationList/labels'
import { ALL_OPERATION_DEFS, type OperationDef } from '../../../domain/operationDefs'
import { useUnavailableOperationDisplay } from '../../../hooks/useFieldStrictness'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { PanelView } from './types'

// ── セクション定義（業務語） ────────────────────────────────────────────────────
const SECTIONS: { label: string; defIds: string[] }[] = [
  { label: '昇降格・役職変更',    defIds: ['Promotion', 'Demotion', 'TitleChange'] },
  { label: '職務内容・雇用形態',  defIds: ['JobTypeChange', 'EmploymentExtension'] },
  { label: '組織への異動',        defIds: ['OrgTransfer', 'OrgRestructure', 'ManagerChange'] },
  { label: '兼務',                defIds: ['ConcurrentAdd', 'ConcurrentRelease'] },
  {
    label: '出向・出向解除（SF導入会社）',
    defIds: [
      'SecondmentOutSF',               'SecondmentInSF',
      'SecondmentOutReleaseSF',        'SecondmentInReleaseSF',
      'ConcurrentSecondmentOutSF',     'ConcurrentSecondmentInSF',
      'ConcurrentSecondmentOutReleaseSF', 'ConcurrentSecondmentInReleaseSF',
    ],
  },
  {
    label: '出向・出向解除（SF未導入会社）',
    defIds: [
      'SecondmentOutNonSF',               'SecondmentInNonSF',
      'SecondmentOutReleaseNonSF',        'SecondmentInReleaseNonSF',
      'ConcurrentSecondmentOutNonSF',     'ConcurrentSecondmentInNonSF',
      'ConcurrentSecondmentOutReleaseNonSF', 'ConcurrentSecondmentInReleaseNonSF',
    ],
  },
  { label: '在籍・退職', defIds: ['LeaveOfAbsence', 'ReturnFromLeave', 'EmploymentTransferOut', 'EmploymentTransferIn', 'NoChange'] },
]

// OperationDef.id → バッジ短縮ラベル
// 出向セクション内は SF区別をセクションタイトルで示すためラベルから省略
// 命名規則: 本務/兼務 × 出向/出向受入 × (空)/解除
const SHORT_LABEL: Record<string, string> = {
  Promotion:                          '昇格',
  Demotion:                           '降格',
  TitleChange:                        '役職変更',
  JobTypeChange:                      '職種変更',
  EmploymentExtension:                '雇用延長',
  OrgTransfer:                        '社内異動',
  OrgRestructure:                     '組織改変',
  ManagerChange:                      '上司変更',
  ConcurrentAdd:                      '兼務追加',
  ConcurrentRelease:                  '兼務解除',
  // 出向（SF導入）
  SecondmentOutSF:                    '本務出向',
  SecondmentInSF:                     '本務出向受入',
  SecondmentOutReleaseSF:             '本務出向解除',
  SecondmentInReleaseSF:              '本務出向受入解除',
  ConcurrentSecondmentOutSF:          '兼務出向',
  ConcurrentSecondmentInSF:           '兼務出向受入',
  ConcurrentSecondmentOutReleaseSF:   '兼務出向解除',
  ConcurrentSecondmentInReleaseSF:    '兼務出向受入解除',
  // 出向（SF未導入）— セクションが違うので同じラベルで問題なし
  SecondmentOutNonSF:                 '本務出向',
  SecondmentInNonSF:                  '本務出向受入',
  SecondmentOutReleaseNonSF:          '本務出向解除',
  SecondmentInReleaseNonSF:           '本務出向受入解除',
  ConcurrentSecondmentOutNonSF:       '兼務出向',
  ConcurrentSecondmentInNonSF:        '兼務出向受入',
  ConcurrentSecondmentOutReleaseNonSF:'兼務出向解除',
  ConcurrentSecondmentInReleaseNonSF: '兼務出向受入解除',
  // 在籍・退職
  LeaveOfAbsence:                     '休職',
  ReturnFromLeave:                    '復職',
  EmploymentTransferOut:              '移籍（出）',
  EmploymentTransferIn:               '移籍（入）',
  NoChange:                           '変更なし',
}

// 2色のみ: 有効 / 無効
const COLOR_AVAILABLE   = 'bg-blue-100 text-blue-700'
const COLOR_UNAVAILABLE = 'bg-gray-100 text-gray-400'

const defById = new Map(ALL_OPERATION_DEFS.map(d => [d.id, d]))

interface Props {
  row:          AllocationRow
  onSelect:     (view: PanelView) => void
  onDirectEdit: () => void
}

export function SummaryView({ row, onSelect, onDirectEdit }: Props) {
  const { codeLists, afterOrganizations } = useStore()
  const unavailableDisplay = useUnavailableOperationDisplay()

  const diffs   = useMemo(() => rowDiff(row), [row])
  const orgName = afterOrganizations.find(
    o => o.externalCode === row.departmentCode || o.id === row.departmentCode
  )?.name ?? (row.departmentCode as string | undefined) ?? ''

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* 人物・行情報 */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <div className="text-sm font-semibold text-gray-800">
          {[row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）'}
        </div>
        {orgName && <div className="text-xs text-gray-400 mt-0.5 truncate">{orgName}</div>}
        {row.concurrentType === '兼務' && (
          <span className="inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">兼務</span>
        )}
      </div>

      {/* 変更済みフィールドのサマリー */}
      {diffs.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-100 bg-blue-50 flex-shrink-0">
          <div className="text-[10px] font-semibold text-blue-600 mb-1">変更済み（{diffs.length}件）</div>
          <div className="space-y-0.5 max-h-24 overflow-y-auto">
            {diffs.map(({ afterKey, prevValue, afterValue }) => (
              <div key={afterKey as string} className="flex items-center gap-1 text-[10px]">
                <span className="text-gray-400 flex-shrink-0 truncate max-w-[80px]">
                  {ALLOCATION_LIST_LABEL_MAP[afterKey as string]?.ja ?? afterKey as string}
                </span>
                <span className="text-gray-300">→</span>
                <span className="text-blue-700 truncate">{afterValue || '（空）'}</span>
                {prevValue && <span className="text-gray-300 truncate">（前: {prevValue}）</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作ボタン群 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {SECTIONS.map(({ label, defIds }) => {
          const defs = defIds
            .map(id => defById.get(id))
            .filter((d): d is OperationDef => !!d)
            .map(d => ({ def: d, available: d.availableFor(row, codeLists) }))
            .filter(({ available }) => unavailableDisplay !== 'hide' || available)

          if (defs.length === 0) return null

          return (
            <div key={label}>
              <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {label}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {defs.map(({ def, available }) => {
                  const disabled = !available && unavailableDisplay === 'show-disabled'
                  return (
                    <button
                      key={def.id}
                      onClick={disabled ? undefined : () => onSelect({ def, rowId: row.rowId })}
                      disabled={disabled}
                      className={[
                        'px-1 py-1.5 min-h-[2.5rem] rounded text-[11px] font-medium text-center leading-tight',
                        disabled
                          ? 'cursor-not-allowed opacity-50'
                          : 'transition-all hover:brightness-95 active:scale-95',
                        available ? COLOR_AVAILABLE : COLOR_UNAVAILABLE,
                      ].join(' ')}
                      title={available ? def.label : `${def.label}（この行では通常使用しません）`}
                    >
                      {SHORT_LABEL[def.id] ?? def.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* 全項目を直接編集（常に有効・unavailableDisplay フィルター対象外） */}
        <div>
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            全項目を直接編集
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button
              onClick={onDirectEdit}
              className="px-1 py-1.5 min-h-[2.5rem] rounded text-[11px] font-medium text-center leading-tight bg-gray-100 text-gray-500 hover:brightness-95 active:scale-95 transition-all"
            >
              直接編集
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
