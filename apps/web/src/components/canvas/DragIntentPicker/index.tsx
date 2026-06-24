import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { isSFIntegratedCompany } from '@personnel/domain/commands/helpers'
import { withLeavePositionVacant, countSubordinates } from '@personnel/domain/commands/defs/index'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { DropIntentState } from '../hooks/useDropIntent'
import { ComboInput } from '../../common/ComboInput'
import {
  TRANSFER_INTENTS, SECONDMENT_RELEASE_INTENTS, SAME_ORG_INTENTS,
  secondmentOutSFDef, secondmentOutNonSFDef,
  type IntentDef,
} from './intents'
import { IntentCard } from './IntentCard'
import { managerChangeDef } from '@personnel/domain/commands/defs/positionAddDef'

interface Props {
  state:               DropIntentState
  allocationList:      AllocationRow[]
  persons:             { id: string; name?: string; sfPersonId?: string }[]
  allOrgs:             Organization[]
  secondmentOrgCodes:  Set<string>
  masters:             AllMasters
  onPick:              (def: EditOperation, row: AllocationRow, overrideInitial: Partial<AllocationRow>) => void
  onCancel:            () => void
}

export function DragIntentPicker({
  state, allocationList, persons, allOrgs, secondmentOrgCodes, masters, onPick, onCancel,
}: Props) {
  const person     = persons.find(p => p.id === state.personId)
  const toOrg      = allOrgs.find(o => o.id === state.toOrgId)
  const toOrgCode  = toOrg?.externalCode ?? ''
  const personName = person?.name ?? '—'
  const toOrgName  = toOrg?.name   ?? '—'

  const isSameOrg = !!state.fromOrgId && state.fromOrgId === state.toOrgId

  const fromOrg         = allOrgs.find(o => o.id === state.fromOrgId)
  const srcCode         = fromOrg?.externalCode ?? ''
  const srcIsSecondment = !!srcCode && secondmentOrgCodes.has(srcCode)
  const tgtIsSecondment = !!toOrgCode && secondmentOrgCodes.has(toOrgCode)
  const isSecondmentOut     = !isSameOrg && !srcIsSecondment && tgtIsSecondment
  const isSecondmentRelease = !isSameOrg && srcIsSecondment && !tgtIsSecondment

  const managerRow    = state.managerPositionCode
    ? allocationList.find(r => r.positionCode === state.managerPositionCode)
    : null
  const managerPerson = managerRow?.userId
    ? persons.find(p => p.sfPersonId === managerRow.userId)
    : null
  const managerName   = managerPerson?.name ?? null

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

  const hasPosition      = !!sourceRow?.positionCode
  const subordinateCount = sourceRow ? countSubordinates(sourceRow, allocationList) : 0
  const hasSubordinates  = subordinateCount > 0

  const [leavePositionVacant, setLeavePositionVacant] = useState(hasSubordinates)

  // 本務出向: 会社名入力ステップ
  const [secondmentCompanyInput, setSecondmentCompanyInput] = useState<string | null>(null)
  const [companyValue,   setCompanyValue]   = useState('')
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)

  const autoSF = useMemo(() => {
    if (!companyValue.trim()) return null
    return isSFIntegratedCompany(companyValue.trim(), masters)
  }, [companyValue, masters])

  const effectiveSF: boolean | null = companyValue.trim()
    ? (manualOverride !== null ? manualOverride : (autoSF ?? false))
    : null

  const handleCompanyChange = (v: string) => {
    setCompanyValue(v)
    setManualOverride(null)
  }

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

  const handlePick = (intent: IntentDef) => {
    const row = findSourceRow(intent.usePrimaryOnly)
    if (!row) return
    const mgrOverride = state.managerPositionCode !== undefined
      ? { managerPositionCode: state.managerPositionCode }
      : {}
    const def = (intent.def.supportsLeaveVacant && !intent.usePrimaryOnly && leavePositionVacant && !!row.positionCode)
      ? withLeavePositionVacant(intent.def)
      : intent.def
    onPick(def, row, { departmentCode: toOrgCode, ...mgrOverride } as Partial<AllocationRow>)
  }

  const handleSecondmentCompanyConfirm = () => {
    const c = companyValue.trim()
    if (!c || effectiveSF === null) return
    const def  = effectiveSF ? secondmentOutSFDef : secondmentOutNonSFDef
    const row  = findSourceRow(false)
    if (!row) return
    const mgrOverride = state.managerPositionCode !== undefined
      ? { managerPositionCode: state.managerPositionCode }
      : {}
    const wrappedDef = (def.supportsLeaveVacant && leavePositionVacant && !!row.positionCode)
      ? withLeavePositionVacant(def)
      : def
    onPick(wrappedDef, row, { departmentCode: toOrgCode, secondmentToCompany: c, ...mgrOverride } as Partial<AllocationRow>)
  }

  const isSameManager = isSameOrg
    && state.managerPositionCode !== undefined
    && state.managerPositionCode === (sourceRow?.managerPositionCode as string | undefined)

  const sameOrgIntents = isSameManager
    ? SAME_ORG_INTENTS.filter(i => i.def.id !== managerChangeDef.id)
    : SAME_ORG_INTENTS
  const intents = isSameOrg           ? sameOrgIntents
    : isSecondmentRelease             ? SECONDMENT_RELEASE_INTENTS
    : TRANSFER_INTENTS

  const isSecondmentOutMode = isSecondmentOut && secondmentCompanyInput === null
  const isCompanyStep       = isSecondmentOut && secondmentCompanyInput !== null

  const gridCols = intents.length === 1 ? 'grid-cols-1' : 'grid-cols-2'

  const headerLabel = isSecondmentOut     ? `を出向者用組織 ${toOrgName} に`
    : isSecondmentRelease                 ? `の出向を解除、${toOrgName} に戻す`
    : isSameOrg                           ? `の ${toOrgName} 内での操作`
    : `を ${toOrgName} へ`

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center select-text"
      onMouseDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="mb-5 text-center">
          <p className="text-sm font-semibold text-gray-800">
            <span className="text-blue-600">{personName}</span>
            {headerLabel}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {isCompanyStep ? '出向先会社名を入力してください' : '操作の種別を選択してください'}
          </p>
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

        {/* ── 本務出向: 会社名入力ステップ ──────────────────────────────── */}
        {isCompanyStep && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                出向先会社名<span className="text-red-400 ml-0.5">*</span>
              </label>
              <ComboInput
                value={companyValue}
                onChange={handleCompanyChange}
                options={masters.companies.map(c => c.label)}
                modified={!!companyValue}
              />
            </div>
            {companyValue.trim() && (
              <div className="space-y-2">
                {autoSF !== null && (
                  <div className="text-[10px] text-gray-400">
                    自動判定：{autoSF ? 'SF統合先' : 'SF外'}
                    {manualOverride !== null && manualOverride !== autoSF && (
                      <span className="ml-1 text-amber-500">（手動で上書き中）</span>
                    )}
                  </div>
                )}
                {autoSF === null && (
                  <div className="text-[10px] text-gray-400">マスタ未登録。下のトグルで選択してください。</div>
                )}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-medium">
                  <button
                    onClick={() => setManualOverride(true)}
                    className={`flex-1 py-1.5 transition-colors ${
                      effectiveSF === true ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >SF統合先</button>
                  <button
                    onClick={() => setManualOverride(false)}
                    className={`flex-1 py-1.5 border-l border-gray-200 transition-colors ${
                      effectiveSF === false ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                    }`}
                  >SF外（未統合）</button>
                </div>
                {effectiveSF !== null && (
                  <div className={`text-[11px] rounded px-3 py-2 leading-relaxed ${
                    effectiveSF
                      ? 'bg-purple-50 border border-purple-100 text-purple-700'
                      : 'bg-orange-50 border border-orange-100 text-orange-700'
                  }`}>
                    {effectiveSF
                      ? '出向元行のみ更新します（SF連携で受入行は自動生成）。'
                      : '出向元行を更新します（受入行はパネルから2行操作で作成できます）。'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 本務出向: 選択カード（会社名入力前）──────────────────────── */}
        {isSecondmentOutMode && (
          <button
            onClick={() => { setSecondmentCompanyInput(''); setCompanyValue('') }}
            className="w-full flex flex-col items-start text-left p-4 rounded-xl border-2 transition-colors bg-white border-purple-200 hover:border-purple-400 hover:bg-purple-50"
          >
            <span className="text-2xl mb-2">🏢</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 bg-purple-100 text-purple-700">
              本務出向
            </span>
            <p className="text-xs font-medium text-gray-800 mb-1.5">本務出向</p>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              出向先会社名を入力し、SF統合先か否かを自動判定してフォームを開きます。
            </p>
          </button>
        )}

        {/* ── 通常インテントカード ──────────────────────────────────────── */}
        {!isSecondmentOut && (
          <div className={`grid gap-3 ${gridCols}`}>
            {intents.map(intent => (
              <IntentCard
                key={intent.def.id}
                intent={intent}
                hasPosition={hasPosition}
                hasSubordinates={hasSubordinates}
                subordinateCount={subordinateCount}
                leavePositionVacant={leavePositionVacant}
                onLeaveVacantChange={setLeavePositionVacant}
                onPick={handlePick}
              />
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-center gap-3">
          {isCompanyStep && (
            <button
              onClick={() => setSecondmentCompanyInput(null)}
              className="px-5 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >戻る</button>
          )}
          <button
            onClick={onCancel}
            className="px-5 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >キャンセル</button>
          {isCompanyStep && (
            <button
              onClick={handleSecondmentCompanyConfirm}
              disabled={effectiveSF === null}
              className="px-5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >実行</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
