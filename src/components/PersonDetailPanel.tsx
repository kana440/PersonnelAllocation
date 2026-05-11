import { useStore } from '../store/useStore'
import type { OperationKind } from '../types/domain'
import type { AffDetail, FormSubmitPayload } from './forms/types'
import { MoveToOrgForm }            from './forms/MoveToOrgForm'
import { SendOnSecondmentForm }      from './forms/SendOnSecondmentForm'
import { RecallFromSecondmentForm }  from './forms/RecallFromSecondmentForm'
import { AddConcurrentForm }         from './forms/AddConcurrentForm'
import { RemoveConcurrentForm }      from './forms/RemoveConcurrentForm'
import { PromoteForm }               from './forms/PromoteForm'
import { useState } from 'react'

type ActionKind = Extract<OperationKind,
  'MoveToOrg' | 'AddConcurrent' | 'RemoveConcurrent' |
  'SendOnSecondment' | 'RecallFromSecondment' | 'Promote'
>

const ACTIONS: { kind: ActionKind; label: string; desc: string; symbol: string; color: string }[] = [
  { kind: 'MoveToOrg',            label: '分掌異動',  desc: '組織間移動',     symbol: '→', color: 'border-blue-200   bg-blue-50   text-blue-700   hover:bg-blue-100' },
  { kind: 'SendOnSecondment',     label: '出向',      desc: '他社出向',       symbol: '↗', color: 'border-green-200  bg-green-50  text-green-700  hover:bg-green-100' },
  { kind: 'RecallFromSecondment', label: '出向解除',  desc: '出向終了',       symbol: '↙', color: 'border-red-200    bg-red-50    text-red-700    hover:bg-red-100' },
  { kind: 'AddConcurrent',        label: '兼務追加',  desc: '兼務ポジション', symbol: '+', color: 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100' },
  { kind: 'RemoveConcurrent',     label: '兼務解除',  desc: '兼務終了',       symbol: '−', color: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { kind: 'Promote',              label: '昇降格',    desc: 'バンド変更',     symbol: '↕', color: 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
]

const OP_LABELS: Partial<Record<OperationKind, string>> = {
  MoveToOrg: '分掌異動', AddConcurrent: '兼務追加', RemoveConcurrent: '兼務解除',
  SetManager: '上司変更', Promote: '昇降格', SendOnSecondment: '出向',
  RecallFromSecondment: '出向解除', FillVacantPosition: '担当者割り当て',
}
const OP_COLORS: Partial<Record<OperationKind, string>> = {
  RecallFromSecondment: 'bg-red-50 border-red-200 text-red-800',
  SendOnSecondment:     'bg-green-50 border-green-200 text-green-800',
  MoveToOrg:            'bg-blue-50 border-blue-200 text-blue-800',
  AddConcurrent:        'bg-purple-50 border-purple-200 text-purple-800',
  RemoveConcurrent:     'bg-orange-50 border-orange-200 text-orange-800',
  Promote:              'bg-yellow-50 border-yellow-200 text-yellow-800',
  FillVacantPosition:   'bg-teal-50 border-teal-200 text-teal-800',
}

// ── ヘルパーコンポーネント ────────────────────────────────────────
const SecHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
    {children}
  </div>
)

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start gap-1.5 text-xs">
    <span className="text-gray-400 flex-shrink-0 w-20 leading-4">{label}</span>
    <span className="text-gray-700 leading-4 flex-1">{value}</span>
  </div>
)

// ── メインコンポーネント ──────────────────────────────────────────
export function PersonDetailPanel() {
  const {
    persons, companies, organizations, afterOrganizations,
    beforeAffiliations, beforePositions,
    afterAffiliations, afterPositions,
    selectedPersonId, operations,
    effectiveDate, addOperation, removeOperation,
    focusOrg, clearPersonSelection,
    bands, transferReasons,
  } = useStore()

  const [selectedAction, setSelectedAction] = useState<ActionKind | null>(null)

  const person = persons.find(p => p.id === selectedPersonId)

  const findOrg = (orgId: string | undefined) =>
    orgId ? (afterOrganizations.find(o => o.id === orgId) ?? organizations.find(o => o.id === orgId)) : undefined

  const getAffDetails = (personId: string, affs: typeof beforeAffiliations, poss: typeof beforePositions): AffDetail[] =>
    affs
      .filter(a => a.personId === personId && a.status === 'active')
      .flatMap(a => {
        const pos     = poss.find(p => p.id === a.positionId)
        const org     = findOrg(pos?.orgId)
        const company = companies.find(c => c.id === pos?.companyId)
        if (!pos || !org || !company) return []
        return [{ aff: a, pos, org, company }]
      })

  const beforeDetails = person ? getAffDetails(person.id, beforeAffiliations, beforePositions) : []
  const afterDetails  = person ? getAffDetails(person.id, afterAffiliations,  afterPositions)  : []

  const primaryAft    = afterDetails.find(d => d.aff.type === 'primary')
  const concurrentAft = afterDetails.filter(d => d.aff.type === 'concurrent')

  const allCompanyIds = [...new Set([...beforeDetails.map(d => d.company.id), ...afterDetails.map(d => d.company.id)])]

  const personOps = operations
    .filter(op => op.params.personId === selectedPersonId || op.params.positionId !== undefined && (() => {
      // FillVacantPosition は personId でなく positionId から追跡
      if (op.kind !== 'FillVacantPosition') return false
      const pos = afterPositions.find(p => p.id === op.params.positionId)
      return pos && afterAffiliations.some(a => a.positionId === pos.id && a.personId === selectedPersonId)
    })())
    .sort((a, b) => a.order - b.order)

  const handleSubmit = (payload: FormSubmitPayload) => {
    addOperation({ ...payload, effectiveDate })
    setSelectedAction(null)
  }

  const formProps = {
    person: person!,
    primaryAft,
    concurrentAft,
    afterDetails,
    activeCompanyIds: afterDetails.map(d => d.company.id),
    companies,
    afterOrganizations,
    bands,
    transferReasons,
    onSubmit: handleSubmit,
    onCancel: () => setSelectedAction(null),
  }

  const activeAction = selectedAction ? ACTIONS.find(a => a.kind === selectedAction) : null

  // ポジション情報カード（primary / concurrent 共通）
  const PositionCard = ({ d, isBefore = false }: { d: AffDetail; isBefore?: boolean }) => (
    <div className={`rounded px-2 py-1.5 border ${
      isBefore     ? 'bg-gray-50 border-gray-200 opacity-60' :
      d.aff.type === 'primary'    ? 'bg-blue-50 border-blue-100' :
                                    'bg-purple-50 border-purple-100'
    }`}>
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-0.5">
        {d.aff.type === 'concurrent' && !isBefore && (
          <span className="text-purple-600 font-semibold">兼</span>
        )}
        <span>{d.company.name}</span>
        <span className="text-gray-300">›</span>
        <button
          onClick={() => !isBefore && focusOrg(d.org.id)}
          className={`font-medium truncate max-w-[80px] ${
            isBefore ? 'text-gray-500 cursor-default' :
            d.aff.type === 'primary' ? 'text-blue-600 hover:underline' : 'text-purple-600 hover:underline'
          }`}
          title={d.org.name}
        >
          {d.org.name}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-700 truncate flex-1">
          {d.aff.freeTitle ?? d.pos.title ?? '担当'}
        </span>
        <span className={`text-sm font-bold flex-shrink-0 ${
          isBefore     ? 'text-gray-500' :
          d.aff.type === 'primary' ? 'text-blue-700' : 'text-purple-700'
        }`}>
          {d.aff.individualBand ?? d.pos.band}
        </span>
        {d.aff.salaryGrade && (
          <span className="text-xs text-gray-400 flex-shrink-0">({d.aff.salaryGrade})</span>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: SF 順 詳細 + 手順 ─────────────────────────────── */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            {person ? (
              <>
                <span className="font-semibold text-gray-800 text-sm flex-1 truncate">{person.name}</span>
                {person.sfPersonId && (
                  <span className="text-xs text-gray-400 font-mono flex-shrink-0">SF:{person.sfPersonId}</span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-400 flex-1">人を選択</span>
            )}
            <button
              onClick={clearPersonSelection}
              className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0 px-1"
              title="閉じる"
            >✕</button>
          </div>
        </div>

        {!person ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-xs text-center px-4">
            組織図の人カードをクリックするか<br />ポジション一覧から選択してください
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── 1. ポジション情報 ── */}
            <div className="px-3 pt-3">
              <SecHeader>ポジション情報</SecHeader>
              {afterDetails.length === 0 ? (
                <div className="text-xs text-gray-400">発令後のポジションなし</div>
              ) : (
                <div className="space-y-1">
                  {afterDetails.map(d => <PositionCard key={d.aff.id} d={d} />)}
                </div>
              )}
            </div>

            {/* ── 2. 職務情報 ── */}
            {primaryAft && (
              <div className="px-3 pt-3">
                <SecHeader>職務情報</SecHeader>
                <div className="space-y-0.5">
                  <InfoRow label="雇用形態" value={primaryAft.aff.employmentType ?? '正社員'} />
                  <InfoRow label="開始日"   value={primaryAft.aff.startDate} />
                  {primaryAft.aff.isOnLeave && (
                    <div className="text-xs text-orange-600 font-medium">休職中</div>
                  )}
                  {primaryAft.aff.secondmentSourceCompanyId && (
                    <InfoRow
                      label="出向元"
                      value={companies.find(c => c.id === primaryAft.aff.secondmentSourceCompanyId)?.name
                        ?? primaryAft.aff.secondmentSourceCompanyId}
                    />
                  )}
                  {primaryAft.aff.secondmentSourceEmployeeId && (
                    <InfoRow label="出向元番号" value={primaryAft.aff.secondmentSourceEmployeeId} />
                  )}
                </div>
                {concurrentAft.filter(d => d.aff.concurrentReason).map(d => (
                  <div key={d.aff.id} className="mt-0.5">
                    <InfoRow label="兼務理由" value={d.aff.concurrentReason!} />
                  </div>
                ))}
              </div>
            )}

            {/* ── 3. 個人情報 ── */}
            <div className="px-3 pt-3">
              <SecHeader>個人情報</SecHeader>
              <div className="space-y-0.5">
                <InfoRow label="氏名" value={person.name} />
                {person.sfPersonId && <InfoRow label="SF社員番号" value={person.sfPersonId} />}
              </div>
            </div>

            {/* ── 4. 発令による変更 ── */}
            {allCompanyIds.some(cid => {
              const bef = beforeDetails.find(d => d.company.id === cid)
              const aft = afterDetails.find(d => d.company.id === cid)
              return !bef || !aft || bef.org.id !== aft.org.id
                || (bef.aff.individualBand ?? bef.pos.band) !== (aft.aff.individualBand ?? aft.pos.band)
            }) && (
              <div className="px-3 pt-3">
                <SecHeader>発令による変更</SecHeader>
                <div className="space-y-1">
                  {allCompanyIds.map(cid => {
                    const company = companies.find(c => c.id === cid)
                    const bef = beforeDetails.find(d => d.company.id === cid)
                    const aft = afterDetails.find(d => d.company.id === cid)
                    const isNew     = !bef && !!aft
                    const isEnded   = !!bef && !aft
                    const isChanged = !!bef && !!aft && (
                      bef.org.id !== aft.org.id ||
                      (bef.aff.individualBand ?? bef.pos.band) !== (aft.aff.individualBand ?? aft.pos.band)
                    )
                    if (!isNew && !isEnded && !isChanged) return null
                    return (
                      <div key={cid} className={`text-xs rounded px-2 py-1 border ${
                        isNew   ? 'bg-green-50 border-green-200' :
                        isEnded ? 'bg-red-50 border-red-200'     : 'bg-yellow-50 border-yellow-200'
                      }`}>
                        <div className="text-gray-500 mb-0.5 truncate">{company?.name}</div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {bef && (
                            <span className={`truncate max-w-[70px] ${isEnded || isChanged ? 'line-through text-gray-400' : ''}`}>
                              {bef.org.name} {bef.aff.individualBand ?? bef.pos.band}
                            </span>
                          )}
                          {(isChanged || isNew) && aft && (
                            <>
                              {isChanged && <span className="text-gray-400 flex-shrink-0">→</span>}
                              <span className={`truncate max-w-[80px] font-medium ${isNew ? 'text-green-700' : 'text-yellow-700'}`}>
                                {aft.org.name} {aft.aff.individualBand ?? aft.pos.band}
                              </span>
                            </>
                          )}
                          <span className={`ml-auto flex-shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                            isNew   ? 'bg-green-100 text-green-700' :
                            isEnded ? 'bg-red-100 text-red-700'     : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {isNew ? '新規' : isEnded ? '終了' : '変更'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 5. 積み重ね手順 ── */}
            <div className="px-3 pt-3 pb-3">
              <SecHeader>
                積み重ね手順 <span className="text-gray-300 font-normal normal-case tracking-normal">({personOps.length}件)</span>
              </SecHeader>
              {personOps.length === 0 ? (
                <div className="text-xs text-gray-400">手順なし</div>
              ) : (
                <div className="space-y-1">
                  {personOps.map((op, idx) => {
                    const colorClass = OP_COLORS[op.kind] ?? 'bg-gray-50 border-gray-200 text-gray-800'
                    return (
                      <div key={op.id} className={`flex items-start gap-1.5 border rounded px-2 py-1 text-xs ${colorClass}`}>
                        <span className="opacity-40 w-3 text-center flex-shrink-0 pt-0.5">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold flex-shrink-0">{OP_LABELS[op.kind] ?? op.kind}</span>
                            <span className="truncate opacity-70">{op.label}</span>
                          </div>
                          {(op.transferReason || op.memo) && (
                            <div className="flex gap-2 mt-0.5 opacity-60">
                              {op.transferReason && <span className="bg-white bg-opacity-60 px-1 rounded">{op.transferReason}</span>}
                              {op.memo && <span className="truncate">{op.memo}</span>}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeOperation(op.id)}
                          className="opacity-30 hover:opacity-80 hover:text-red-600 flex-shrink-0 pt-0.5"
                        >✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* ── Right: form panel (unchanged) ───────────────────────── */}
      <div className="flex-1 overflow-y-auto min-w-0 p-3">
        {!person ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-400">
            <span className="text-3xl">👤</span>
            <span className="text-sm">人物を選択してください</span>
          </div>
        ) : !selectedAction ? (
          <>
            <div className="text-xs font-semibold text-gray-500 mb-2">手順を追加</div>
            <div className="grid grid-cols-3 gap-1.5 xl:grid-cols-6">
              {ACTIONS.map(({ kind, label, desc, symbol, color }) => (
                <button
                  key={kind}
                  onClick={() => setSelectedAction(kind)}
                  className={`border rounded px-2 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors ${color}`}
                >
                  <span className="text-base leading-none flex-shrink-0">{symbol}</span>
                  <div className="text-left min-w-0">
                    <div className="leading-tight">{label}</div>
                    <div className="text-xs opacity-60 leading-tight truncate">{desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm">
            <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-100">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${activeAction?.color ?? ''}`}>
                {activeAction?.symbol} {activeAction?.label}
              </span>
              <span className="text-gray-500 text-xs truncate flex-1">{person.name}</span>
            </div>

            {selectedAction === 'MoveToOrg'            && <MoveToOrgForm           key="move"    {...formProps} />}
            {selectedAction === 'SendOnSecondment'      && <SendOnSecondmentForm     key="send"    {...formProps} />}
            {selectedAction === 'RecallFromSecondment'  && <RecallFromSecondmentForm key="recall"  {...formProps} />}
            {selectedAction === 'AddConcurrent'         && <AddConcurrentForm        key="add"     {...formProps} />}
            {selectedAction === 'RemoveConcurrent'      && <RemoveConcurrentForm     key="remove"  {...formProps} />}
            {selectedAction === 'Promote'               && <PromoteForm              key="promote" {...formProps} />}
          </div>
        )}
      </div>

    </div>
  )
}
