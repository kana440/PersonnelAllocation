import { useState, useMemo } from 'react'
import { createPortal }     from 'react-dom'
import { isSFIntegratedCompany }                              from '@personnel/domain/commands/helpers'
import { withLeavePositionVacant,
         getSameOrgSubordinates, getOtherOrgSubordinates }    from '@personnel/domain/commands/defs/index'
import type { EditOperation }  from '@personnel/domain/commands/defs/index'
import type { AllocationRow }  from '@personnel/domain/allocationRow'
import type { Organization }   from '@personnel/domain/schemas'
import type { AllMasters }     from '@personnel/domain/masters/aggregate'
import type { DropIntentState, DragBatchItem } from '../../hooks/useDropIntent'
import { ComboInput }          from '../../../common/ComboInput'
import {
  TRANSFER_INTENTS, SECONDMENT_RELEASE_INTENTS, SAME_ORG_INTENTS,
  secondmentOutSFDef, secondmentOutNonSFDef,
  type IntentDef,
} from './intents'
import { IntentCard }          from './IntentCard'
import { managerChangeDef }    from '@personnel/domain/commands/defs/positionAddDef'
import { orgTransferDef }      from '@personnel/domain/commands/defs/orgTransferDefs'
import { concurrentAddDef }    from '@personnel/domain/commands/defs/concurrentDefs'

interface Props {
  state:               DropIntentState
  allocationList:      AllocationRow[]
  persons:             { id: string; name?: string; sfPersonId?: string }[]
  allOrgs:             Organization[]
  secondmentOrgCodes:  Set<string>
  masters:             AllMasters
  onPick:       (def: EditOperation, row: AllocationRow, overrideInitial: Partial<AllocationRow>) => void
  onImmediate:  (def: EditOperation, row: AllocationRow, values: Partial<AllocationRow>) => void
  onBatch:      (label: string, items: DragBatchItem[]) => void
  onCancel:     () => void
}

/** orgId からルートまでの階層フルパス（ root > ... > leaf） */
function buildOrgPath(orgId: string | undefined, allOrgs: Organization[]): string {
  if (!orgId) return ''
  const byId = new Map(allOrgs.map(o => [o.id, o]))
  const leaf  = byId.get(orgId)
  if (!leaf) return ''
  const parts: string[] = []
  let cur: Organization | undefined = leaf
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' > ')
}

/** externalCode からルートまでのフルパス */
function buildOrgPathByCode(code: string | undefined, allOrgs: Organization[]): string {
  if (!code) return ''
  const org = allOrgs.find(o => o.externalCode === code)
  return buildOrgPath(org?.id, allOrgs)
}

export function DragIntentPicker({
  state, allocationList, persons, allOrgs, secondmentOrgCodes, masters,
  onPick, onImmediate, onBatch, onCancel,
}: Props) {
  const person     = persons.find(p => p.id === state.personId)
  const toOrg      = allOrgs.find(o => o.id === state.toOrgId)
  const toOrgCode  = toOrg?.externalCode ?? ''
  const personName = person?.name ?? '—'
  const toOrgName  = toOrg?.name  ?? '—'

  const isSameOrg = !!state.fromOrgId && state.fromOrgId === state.toOrgId

  const fromOrg         = allOrgs.find(o => o.id === state.fromOrgId)
  const srcCode         = fromOrg?.externalCode ?? ''
  const srcIsSecondment = !!srcCode    && secondmentOrgCodes.has(srcCode)
  const tgtIsSecondment = !!toOrgCode  && secondmentOrgCodes.has(toOrgCode)
  const isSecondmentOut     = !isSameOrg && !srcIsSecondment && tgtIsSecondment
  const isSecondmentRelease = !isSameOrg && srcIsSecondment  && !tgtIsSecondment

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

  const sameOrgSubs  = sourceRow ? getSameOrgSubordinates(sourceRow, allocationList)  : []
  const otherOrgSubs = sourceRow ? getOtherOrgSubordinates(sourceRow, allocationList) : []
  const hasSubordinates = sameOrgSubs.length > 0 || otherOrgSubs.length > 0

  // ── プレビュー文字列 ────────────────────────────────────────────────────────
  const fromPath = buildOrgPathByCode(sourceRow?.departmentCode as string | undefined, allOrgs)
  const toPath   = buildOrgPath(state.toOrgId, allOrgs)

  // ── 移動値セット（即時実行用） ────────────────────────────────────────────
  const baseTransferValues = useMemo((): Partial<AllocationRow> => ({
    departmentCode:      toOrgCode as AllocationRow['departmentCode'],
    managerPositionCode: state.managerPositionCode as AllocationRow['managerPositionCode'] | undefined,
    managerName:         (managerName ?? undefined) as AllocationRow['managerName'] | undefined,
    location:            sourceRow?.location,
    costCenter:          sourceRow?.costCenter,
  }), [toOrgCode, state.managerPositionCode, managerName, sourceRow])

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

  // 出向・通常インテントの handlePick（フォームを開く操作用）
  const handlePick = (intent: IntentDef) => {
    const row = findSourceRow(intent.usePrimaryOnly)
    if (!row) return
    const mgrOverride = state.managerPositionCode !== undefined
      ? { managerPositionCode: state.managerPositionCode }
      : {}
    onPick(intent.def, row, { departmentCode: toOrgCode, ...mgrOverride } as Partial<AllocationRow>)
  }

  const handleSecondmentCompanyConfirm = () => {
    const c = companyValue.trim()
    if (!c || effectiveSF === null) return
    const def = effectiveSF ? secondmentOutSFDef : secondmentOutNonSFDef
    const row = findSourceRow(false)
    if (!row) return
    const mgrOverride = state.managerPositionCode !== undefined
      ? { managerPositionCode: state.managerPositionCode }
      : {}
    onPick(def, row, { departmentCode: toOrgCode, secondmentToCompany: c, ...mgrOverride } as Partial<AllocationRow>)
  }

  const isSameManager = isSameOrg
    && state.managerPositionCode !== undefined
    && state.managerPositionCode === (sourceRow?.managerPositionCode as string | undefined)

  const sameOrgIntents = isSameManager
    ? SAME_ORG_INTENTS.filter(i => i.def.id !== managerChangeDef.id)
    : SAME_ORG_INTENTS
  const fallbackIntents = isSameOrg           ? sameOrgIntents
    : isSecondmentRelease                     ? SECONDMENT_RELEASE_INTENTS
    : TRANSFER_INTENTS

  const isSecondmentOutMode = isSecondmentOut && secondmentCompanyInput === null
  const isCompanyStep       = isSecondmentOut && secondmentCompanyInput !== null

  const headerLabel = isSecondmentOut     ? `を出向者用組織 ${toOrgName} に`
    : isSecondmentRelease                 ? `の出向を解除、${toOrgName} に戻す`
    : isSameOrg                           ? `の ${toOrgName} 内での操作`
    : `を ${toOrgName} へ`

  // ── 通常異動（別組織）: 新しい3択/2択カードを描画 ──────────────────────
  const isNormalTransfer = !isSameOrg && !isSecondmentOut && !isSecondmentRelease

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

        {/* ── 本務出向: 会社名入力ステップ ── */}
        {isCompanyStep && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                出向先会社名<span className="text-red-400 ml-0.5">*</span>
              </label>
              <ComboInput
                value={companyValue}
                onChange={v => { setCompanyValue(v); setManualOverride(null) }}
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
                  <button onClick={() => setManualOverride(true)}
                    className={`flex-1 py-1.5 transition-colors ${effectiveSF === true ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >SF統合先</button>
                  <button onClick={() => setManualOverride(false)}
                    className={`flex-1 py-1.5 border-l border-gray-200 transition-colors ${effectiveSF === false ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >SF外（未統合）</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 本務出向: 開始カード ── */}
        {isSecondmentOutMode && (
          <button
            onClick={() => { setSecondmentCompanyInput(''); setCompanyValue('') }}
            className="w-full flex flex-col items-start text-left p-4 rounded-xl border-2 transition-colors bg-white border-purple-200 hover:border-purple-400 hover:bg-purple-50"
          >
            <span className="text-2xl mb-2">🏢</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 bg-purple-100 text-purple-700">本務出向</span>
            <p className="text-xs font-medium text-gray-800 mb-1.5">本務出向</p>
            <p className="text-[11px] text-gray-500 leading-relaxed">出向先会社名を入力し、SF統合先か否かを自動判定してフォームを開きます。</p>
          </button>
        )}

        {/* ── 通常異動: 新しい2択 / 3択カード ── */}
        {isNormalTransfer && (
          <div className={`grid gap-3 ${hasSubordinates ? 'grid-cols-3' : 'grid-cols-2'}`}>

            {/* 部下なし: 移動 */}
            {!hasSubordinates && sourceRow && (
              <TransferCard
                icon="👤"
                title="移動"
                desc="別組織への通常異動。本人を新組織のポジションに移動します。"
                fromPath={fromPath}
                toPath={toPath}
                onClick={() => onImmediate(orgTransferDef, sourceRow, baseTransferValues)}
              />
            )}

            {/* 部下あり: 異動（新ポジション） */}
            {hasSubordinates && sourceRow && (
              <TransferCard
                icon="🔲"
                title="異動（新ポジション）"
                desc="本人のみ新組織へ。旧ポジションは空席として残し、後から別の人をアサインできます。"
                fromPath={fromPath}
                toPath={toPath}
                onClick={() => onImmediate(withLeavePositionVacant(orgTransferDef), sourceRow, baseTransferValues)}
              />
            )}

            {/* 部下あり: 部下ごと移動 */}
            {hasSubordinates && sourceRow && (
              <TransferCard
                icon="👥"
                title="部下ごと移動"
                desc={`同一組織の部下 ${sameOrgSubs.length} 名と一緒に移動します。`}
                fromPath={fromPath}
                toPath={toPath}
                warning={otherOrgSubs.length > 0
                  ? `他組織の部下 ${otherOrgSubs.length} 名は個別に移動が必要です`
                  : undefined}
                onClick={() => {
                  const items: DragBatchItem[] = [
                    { def: orgTransferDef, rowId: sourceRow.rowId, values: baseTransferValues },
                    ...sameOrgSubs.map(sub => ({
                      def:    orgTransferDef,
                      rowId:  sub.rowId,
                      values: { departmentCode: toOrgCode as AllocationRow['departmentCode'], location: sub.location, costCenter: sub.costCenter } as Partial<AllocationRow>,
                    })),
                  ]
                  onBatch(`部下ごと移動: ${personName} → ${toOrgName}`, items)
                }}
              />
            )}

            {/* 兼務追加（常に表示） */}
            {sourceRow && (
              <IntentCard
                intent={TRANSFER_INTENTS.find(i => i.def.id === concurrentAddDef.id)!}
                hasPosition={!!sourceRow.positionCode}
                hasSubordinates={false}
                subordinateCount={0}
                leavePositionVacant={false}
                onLeaveVacantChange={() => {}}
                onPick={intent => {
                  const row = findSourceRow(intent.usePrimaryOnly)
                  if (!row) return
                  onPick(intent.def, row, { departmentCode: toOrgCode } as Partial<AllocationRow>)
                }}
              />
            )}
          </div>
        )}

        {/* ── 同一組織 / 出向解除: 既存インテントカード ── */}
        {!isNormalTransfer && !isSecondmentOut && (
          <div className={`grid gap-3 ${fallbackIntents.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {fallbackIntents.map(intent => (
              <IntentCard
                key={intent.def.id}
                intent={intent}
                hasPosition={!!sourceRow?.positionCode}
                hasSubordinates={hasSubordinates}
                subordinateCount={sameOrgSubs.length + otherOrgSubs.length}
                leavePositionVacant={false}
                onLeaveVacantChange={() => {}}
                onPick={handlePick}
              />
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-center gap-3">
          {isCompanyStep && (
            <button onClick={() => setSecondmentCompanyInput(null)}
              className="px-5 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">
              戻る
            </button>
          )}
          <button onClick={onCancel}
            className="px-5 py-1.5 text-xs text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50">
            キャンセル
          </button>
          {isCompanyStep && (
            <button onClick={handleSecondmentCompanyConfirm} disabled={effectiveSF === null}
              className="px-5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              実行
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── 即時実行カード（移動系専用） ──────────────────────────────────────────────

interface TransferCardProps {
  icon:      string
  title:     string
  desc:      string
  fromPath:  string
  toPath:    string
  warning?:  string
  onClick:   () => void
}

function TransferCard({ icon, title, desc, fromPath, toPath, warning, onClick }: TransferCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start text-left p-4 rounded-xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50 bg-white transition-colors"
    >
      <span className="text-2xl mb-2">{icon}</span>
      <p className="text-xs font-semibold text-gray-800 mb-1">{title}</p>
      <p className="text-[11px] text-gray-500 leading-relaxed mb-2">{desc}</p>
      {warning && (
        <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2 w-full leading-relaxed">
          ⚠ {warning}
        </p>
      )}
      {/* プレビュー: 組織フルパス2行 */}
      {(fromPath || toPath) && (
        <div className="mt-auto pt-2 border-t border-blue-100 w-full text-[10px] text-gray-500 space-y-0.5">
          <div className="truncate" title={fromPath}>現: {fromPath || '—'}</div>
          <div className="truncate text-blue-700 font-medium" title={toPath}>→ {toPath || '—'}</div>
        </div>
      )}
    </button>
  )
}
