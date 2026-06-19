import { createPortal } from 'react-dom'
import { orgRestructureDef, orgTransferDef } from '@personnel/domain/commands/defs/orgTransferDefs'
import { concurrentAddDef } from '@personnel/domain/commands/defs/concurrentDefs'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { DropIntentState } from './hooks/useDropIntent'

interface Props {
  state:           DropIntentState
  allocationList:  AllocationRow[]
  persons:         { id: string; name?: string; sfPersonId?: string }[]
  allOrgs:         Organization[]
  onPick:          (def: EditOperation, row: AllocationRow, overrideInitial: Partial<AllocationRow>) => void
  onCancel:        () => void
}

const INTENTS = [
  {
    def:   orgRestructureDef,
    title: '組織改正による異動',
    desc:  '組織の改廃・統廃合・名称変更などで在籍部署が変わる場合。異動事由は改組系を選択。',
    border: 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50',
    badge:  'bg-indigo-100 text-indigo-700',
    icon:   '🏢',
    usePrimaryOnly: false,
  },
  {
    def:   orgTransferDef,
    title: '業務変更による異動',
    desc:  '担当業務の変更・本人都合などにより、在籍部署が変わる場合。通常の社内異動。',
    border: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
    badge:  'bg-blue-100 text-blue-700',
    icon:   '👤',
    usePrimaryOnly: false,
  },
  {
    def:   concurrentAddDef,
    title: '兼務追加',
    desc:  '本務を維持したまま、この組織に兼務を追加する。本務行をベースに兼務行が新たに作成されます。',
    border: 'border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50',
    badge:  'bg-cyan-100 text-cyan-700',
    icon:   '📋',
    usePrimaryOnly: true,
  },
] as const

export function DragIntentPicker({ state, allocationList, persons, allOrgs, onPick, onCancel }: Props) {
  const person   = persons.find(p => p.id === state.personId)
  const toOrg    = allOrgs.find(o => o.id === state.toOrgId)
  const toOrgCode = toOrg?.externalCode ?? ''
  const personName = person?.name ?? '—'
  const toOrgName  = toOrg?.name   ?? '—'

  const findSourceRow = (usePrimaryOnly: boolean): AllocationRow | null => {
    if (!usePrimaryOnly && state.fromRowId) {
      const row = allocationList.find(r => r.rowId === state.fromRowId)
      if (row) return row
    }
    const sfId = person?.sfPersonId
    if (!sfId) return null
    return allocationList.find(r => r.userId === sfId && !r.concurrentType)
        ?? allocationList.find(r => r.userId === sfId)
        ?? null
  }

  const handlePick = (intent: typeof INTENTS[number]) => {
    const row = findSourceRow(intent.usePrimaryOnly)
    if (!row) return
    onPick(intent.def, row, { departmentCode: toOrgCode })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center select-text"
      onClick={onCancel}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-5 text-center">
          <p className="text-sm font-semibold text-gray-800">
            <span className="text-blue-600">{personName}</span>
            {' '}を{' '}
            <span className="text-indigo-600">{toOrgName}</span>
            {' '}へ
          </p>
          <p className="text-xs text-gray-500 mt-1">操作の種別を選択してください</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {INTENTS.map((intent) => (
            <button
              key={intent.def.id}
              onClick={() => handlePick(intent)}
              className={`flex flex-col items-start text-left p-4 rounded-xl border-2 transition-colors bg-white ${intent.border}`}
            >
              <span className="text-2xl mb-2">{intent.icon}</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 ${intent.badge}`}>
                {intent.def.label}
              </span>
              <p className="text-xs font-medium text-gray-800 mb-1.5">{intent.title}</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">{intent.desc}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-center">
          <button
            onClick={onCancel}
            className="px-5 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >キャンセル</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
