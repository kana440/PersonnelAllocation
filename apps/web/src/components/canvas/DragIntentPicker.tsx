import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { orgRestructureDef, orgTransferDef } from '@personnel/domain/commands/defs/orgTransferDefs'
import { concurrentAddDef } from '@personnel/domain/commands/defs/concurrentDefs'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { afterKeysByBinding } from '@personnel/domain/allocationRow'
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

/** 移動後に元ポジションを空席行として残すラッパー */
function wrapWithLeaveVacant(baseDef: EditOperation): EditOperation {
  return {
    ...baseDef,
    onSubmit(ctx, rowId, values) {
      const row = ctx.allocationList.find(r => r.rowId === rowId)
      const oldPosCode = row?.positionCode as string | undefined

      if (!oldPosCode || !row) {
        return baseDef.onSubmit(ctx, rowId, values)
      }

      // ベース操作実行（departmentCode・managerPositionCode などを更新）
      const baseResult = baseDef.onSubmit(ctx, rowId, values)

      // 空席行と人の新ポジションコード用 ID を確保
      const maxId = baseResult.updatedList.length === 0
        ? 0
        : Math.max(...baseResult.updatedList.map(r => r.rowId))
      const vacantRowId = maxId + 1
      const newPosCode  = `_pos_${maxId + 2}`

      // 人の行に新しい positionCode を付与（旧コードは空席行へ）
      const updatedWithNewPos = baseResult.updatedList.map(r =>
        r.rowId === rowId ? { ...r, positionCode: newPosCode } : r
      )

      // 空席行を生成（旧 position / both フィールドを引き継ぎ）
      const positionFields = Object.fromEntries(
        afterKeysByBinding('position').map(k => [k, row[k as keyof AllocationRow]])
      )
      const bothFields = Object.fromEntries(
        afterKeysByBinding('both').map(k => [k, row[k as keyof AllocationRow]])
      )
      const vacantRow = {
        rowId: vacantRowId,
        ...bothFields,      // 旧 departmentCode・組織階層
        ...positionFields,  // 旧 positionCode・localJobTitle・managerPositionCode など
      } as AllocationRow

      return {
        updatedList: [...updatedWithNewPos, vacantRow],
        label: `${baseResult.label}（元ポジション空席）`,
      }
    },
  }
}

export function DragIntentPicker({ state, allocationList, persons, allOrgs, onPick, onCancel }: Props) {
  const person     = persons.find(p => p.id === state.personId)
  const toOrg      = allOrgs.find(o => o.id === state.toOrgId)
  const toOrgCode  = toOrg?.externalCode ?? ''
  const personName = person?.name ?? '—'
  const toOrgName  = toOrg?.name   ?? '—'

  // person/gap ドロップ時の上司を特定（表示用）
  const managerRow    = state.managerPositionCode
    ? allocationList.find(r => r.positionCode === state.managerPositionCode)
    : null
  const managerPerson = managerRow?.userId
    ? persons.find(p => p.sfPersonId === managerRow.userId)
    : null
  const managerName   = managerPerson?.name ?? null

  // 移動元の行を特定
  const sourceRow = useMemo(() => {
    if (state.fromRowId) {
      const r = allocationList.find(r => r.rowId === state.fromRowId)
      if (r) return r
    }
    const sfId = person?.sfPersonId
    if (!sfId) return null
    return allocationList.find(r => r.userId === sfId && !r.concurrentType)
        ?? allocationList.find(r => r.userId === sfId)
        ?? null
  }, [state, allocationList, person])

  // 元ポジションを持つ場合のみ空席チェックボックスを表示
  const hasPosition   = !!sourceRow?.positionCode

  // prev データで部下の有無を判定
  const prevPosCode      = (sourceRow?.prevPositionCode as string | undefined) ?? null
  const subordinateCount = prevPosCode
    ? allocationList.filter(r => (r.prevManagerPositionCode as string | undefined) === prevPosCode).length
    : 0
  const hasSubordinates = subordinateCount > 0

  const [leavePositionVacant, setLeavePositionVacant] = useState(hasSubordinates)

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
    const mgrOverride = state.managerPositionCode !== undefined
      ? { managerPositionCode: state.managerPositionCode }
      : {}

    // 兼務追加以外で空席チェックが ON かつポジションがある場合はラップ
    const def = (!intent.usePrimaryOnly && leavePositionVacant && !!row.positionCode)
      ? wrapWithLeaveVacant(intent.def)
      : intent.def

    onPick(def, row, { departmentCode: toOrgCode, ...mgrOverride })
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

        {/* person/gap ドロップ時のコンテキストバナー */}
        {state.dropType !== 'org' && managerName && (
          <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 text-center">
            {state.dropType === 'person'
              ? <><span className="font-semibold">{managerName}</span> の配下として配置します</>
              : <><span className="font-semibold">{managerName}</span> と同じチームに配置します（上司として設定）</>
            }
          </div>
        )}

        {/* 元ポジションを空席として残すチェックボックス */}
        {hasPosition && (
          <div className={`mb-4 px-3 py-2.5 rounded-lg border text-xs ${
            hasSubordinates
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-gray-50 border-gray-200 text-gray-600'
          }`}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={leavePositionVacant}
                onChange={e => setLeavePositionVacant(e.target.checked)}
                className="mt-0.5 flex-shrink-0"
              />
              <span>
                {hasSubordinates ? (
                  <>
                    <span className="font-semibold text-amber-900">
                      元の組織上 {subordinateCount} 名の部下を持っています。
                    </span>
                    {' '}異動後にレポートラインが切れる可能性があります。<br />
                    <span className="font-semibold">元のポジションを空席として残す（推奨）</span>
                  </>
                ) : (
                  '元のポジションを空席として残す（同じ組織・上司に別の人を当てる予定がある場合にチェック）'
                )}
              </span>
            </label>
          </div>
        )}

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
