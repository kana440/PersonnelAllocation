import { useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { rowDiff, type AllocationRow } from '@personnel/domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { ALL_EDIT_OPERATIONS, type EditOperation } from '@personnel/domain/commands/defs/index'
import { useUnavailableOperationDisplay } from '../../../hooks/useFieldStrictness'
import type { PanelView } from './types'

// ── セクション定義（業務語） ────────────────────────────────────────────────────
// id は OperationDef.id と 1:1 対応。shortLabel はバッジ表示用の短縮ラベル。
// 出向セクションは SF区別をセクションタイトルで示すため同じ shortLabel を使い分けて問題なし。
// Domain 側の def を変更したときはここも合わせて更新する。
const SECTIONS: { label: string; ops: { id: string; shortLabel: string; cancel?: boolean }[] }[] = [
  {
    label: '昇降格・役職変更',
    ops: [
      { id: 'Promotion',   shortLabel: '昇格' },
      { id: 'Demotion',    shortLabel: '降格' },
      { id: 'TitleChange', shortLabel: '役職変更' },
    ],
  },
  {
    label: '職務内容・雇用形態',
    ops: [
      { id: 'JobTypeChange',        shortLabel: '職種変更' },
      { id: 'EmploymentExtension',  shortLabel: '雇用延長' },
      { id: 'EmploymentTypeChange', shortLabel: '雇用タイプ変更' },
    ],
  },
  {
    label: '組織への異動',
    ops: [
      { id: 'OrgTransfer',    shortLabel: '社内異動' },
      { id: 'OrgRestructure', shortLabel: '組織改変' },
      { id: 'ManagerChange',  shortLabel: '上司変更' },
    ],
  },
  {
    label: '兼務',
    ops: [
      { id: 'ConcurrentAdd',       shortLabel: '兼務追加' },
      { id: 'ConcurrentAddCancel', shortLabel: '兼務追加取消', cancel: true },
      { id: 'ConcurrentRelease',   shortLabel: '兼務解除' },
    ],
  },
  {
    label: '出向・出向解除（SF導入会社）',
    ops: [
      { id: 'SecondmentOutSF',                   shortLabel: 'SF導入\n本務出向' },
      { id: 'SecondmentOutReleaseSF',             shortLabel: 'SF導入\n本務出向解除' },
      { id: 'SecondmentInReleaseSF',              shortLabel: 'SF導入\n本務受入解除' },
      { id: 'SecondmentInCancelSF',               shortLabel: 'SF導入\n本務受入取消', cancel: true },
      { id: 'ConcurrentSecondmentOutSF',          shortLabel: 'SF導入\n兼務出向' },
      { id: 'ConcurrentSecondmentOutReleaseSF',   shortLabel: 'SF導入\n兼務出向解除' },
      { id: 'ConcurrentSecondmentInReleaseSF',    shortLabel: 'SF導入\n兼務受入解除' },
      { id: 'ConcurrentSecondmentInCancelSF',     shortLabel: 'SF導入\n兼務受入取消', cancel: true },
    ],
  },
  {
    label: '出向・出向解除（SF未導入会社）',
    ops: [
      { id: 'SecondmentOutNonSF',                     shortLabel: 'SF未導入\n本務出向' },
      { id: 'SecondmentOutReleaseNonSF',               shortLabel: 'SF未導入\n本務出向解除' },
      { id: 'SecondmentInReleaseNonSF',                shortLabel: 'SF未導入\n本務受入解除' },
      { id: 'SecondmentInCancelNonSF',                 shortLabel: 'SF未導入\n本務受入取消', cancel: true },
      { id: 'ConcurrentSecondmentOutNonSF',            shortLabel: 'SF未導入\n兼務出向' },
      { id: 'ConcurrentSecondmentOutReleaseNonSF',     shortLabel: 'SF未導入\n兼務出向解除' },
      { id: 'ConcurrentSecondmentInReleaseNonSF',      shortLabel: 'SF未導入\n兼務受入解除' },
      { id: 'ConcurrentSecondmentInCancelNonSF',       shortLabel: 'SF未導入\n兼務受入取消', cancel: true },
    ],
  },
  {
    label: '在籍・退職',
    ops: [
      { id: 'LeaveOfAbsence',       shortLabel: '休職' },
      { id: 'LeaveOfAbsenceCancel', shortLabel: '休職取消', cancel: true },
      { id: 'ReturnFromLeave',      shortLabel: '復職' },
      { id: 'EmploymentTransfer', shortLabel: '移籍' },
      { id: 'NoChange',              shortLabel: '変更なし' },
    ],
  },
]

const COLOR_AVAILABLE   = 'bg-blue-100 text-blue-700'
const COLOR_CANCEL      = 'bg-red-100 text-red-600'
const COLOR_UNAVAILABLE = 'bg-gray-100 text-gray-400'

const defById = new Map(ALL_EDIT_OPERATIONS.map(d => [d.id, d]))

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
        {SECTIONS.map(({ label, ops }) => {
          const items = ops
            .map(({ id, shortLabel, cancel }) => ({ def: defById.get(id), shortLabel, cancel }))
            .filter((x): x is { def: EditOperation; shortLabel: string; cancel: boolean | undefined } => !!x.def)
            .map(({ def, shortLabel, cancel }) => ({ def, shortLabel, cancel, available: def.availableFor(row, codeLists) }))
            .filter(({ available }) => unavailableDisplay !== 'hide' || available)

          if (items.length === 0) return null

          return (
            <div key={label}>
              <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                {label}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1">
                {items.map(({ def, shortLabel, cancel, available }) => {
                  const disabled = !available && unavailableDisplay === 'show-disabled'
                  const color = available
                    ? (cancel ? COLOR_CANCEL : COLOR_AVAILABLE)
                    : COLOR_UNAVAILABLE
                  return (
                    <button
                      key={def.id}
                      onClick={disabled ? undefined : () => onSelect({ def, rowId: row.rowId })}
                      disabled={disabled}
                      className={[
                        'px-1 py-0.5 min-h-[1.75rem] rounded text-[10px] font-medium text-center leading-tight whitespace-pre-line',
                        disabled
                          ? 'cursor-not-allowed opacity-50'
                          : 'transition-all hover:brightness-95 active:scale-95',
                        color,
                      ].join(' ')}
                      title={available ? def.label : `${def.label}（この行では通常使用しません）`}
                    >
                      {shortLabel}
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
              className="px-1 py-0.5 min-h-[1.75rem] rounded text-[10px] font-medium text-center leading-tight bg-gray-100 text-gray-500 hover:brightness-95 active:scale-95 transition-all"
            >
              直接編集
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
