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
  RecallFromSecondment: '出向解除',
}
const OP_COLORS: Partial<Record<OperationKind, string>> = {
  RecallFromSecondment: 'bg-red-50 border-red-200 text-red-800',
  SendOnSecondment:     'bg-green-50 border-green-200 text-green-800',
  MoveToOrg:            'bg-blue-50 border-blue-200 text-blue-800',
  AddConcurrent:        'bg-purple-50 border-purple-200 text-purple-800',
  RemoveConcurrent:     'bg-orange-50 border-orange-200 text-orange-800',
  Promote:              'bg-yellow-50 border-yellow-200 text-yellow-800',
}

export function PersonDetailPanel() {
  const {
    persons, companies, organizations, afterOrganizations,
    beforeAffiliations, beforePositions,
    afterAffiliations, afterPositions,
    selectedPersonId, operations,
    effectiveDate, addOperation, removeOperation,
    focusOrg, clearPersonSelection,
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

  const allCompanyIds    = [...new Set([...beforeDetails.map(d => d.company.id), ...afterDetails.map(d => d.company.id)])]
  const activeCompanyIds = afterDetails.map(d => d.company.id)

  const primaryAft    = afterDetails.find(d => d.aff.type === 'primary')
  const concurrentAft = afterDetails.filter(d => d.aff.type === 'concurrent')

  const personOps = operations
    .filter(op => op.params.personId === selectedPersonId)
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
    activeCompanyIds,
    companies,
    afterOrganizations,
    onSubmit: handleSubmit,
    onCancel: () => setSelectedAction(null),
  }

  const AffLine = ({ d }: { d: AffDetail }) => (
    <div className="text-xs">
      <span className="text-gray-400 mr-1">{d.company.name}</span>
      <button
        onClick={() => focusOrg(d.org.id)}
        className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
      >
        {d.org.name}
      </button>
      <span className="text-gray-500 ml-1">{d.aff.freeTitle ?? d.pos.title}</span>
      <span className={`ml-1 font-medium ${d.aff.type === 'primary' ? 'text-blue-600' : 'text-green-600'}`}>
        {d.aff.individualBand ?? d.pos.band}
      </span>
      {d.aff.salaryGrade && <span className="text-gray-400 ml-0.5">({d.aff.salaryGrade})</span>}
      {d.aff.type === 'concurrent' && <span className="ml-1 text-purple-500">兼務</span>}
      {d.aff.employmentType && d.aff.employmentType !== '正社員' && (
        <span className="ml-1 text-orange-500">{d.aff.employmentType}</span>
      )}
    </div>
  )

  const activeAction = selectedAction ? ACTIONS.find(a => a.kind === selectedAction) : null

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: person info + operations list ─────────────── */}
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
            組織図の人カードをクリックするか<br />左の検索欄で人名を入力してください
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* Before / After affiliations */}
            <div className="px-3 pt-3 space-y-2">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-300 inline-block" />発令前
                </div>
                {beforeDetails.length === 0
                  ? <div className="text-xs text-gray-400 pl-3">所属なし</div>
                  : <div className="space-y-0.5 pl-3">{beforeDetails.map(d => <AffLine key={d.aff.id} d={d} />)}</div>
                }
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />発令後
                </div>
                {afterDetails.length === 0
                  ? <div className="text-xs text-gray-400 pl-3">所属なし</div>
                  : <div className="space-y-0.5 pl-3">{afterDetails.map(d => <AffLine key={d.aff.id} d={d} />)}</div>
                }
              </div>

              {/* Diff summary */}
              {allCompanyIds.length > 0 && (
                <div className="border-t border-gray-100 pt-2">
                  {allCompanyIds.map(cid => {
                    const company = companies.find(c => c.id === cid)
                    const before  = beforeDetails.find(d => d.company.id === cid)
                    const after   = afterDetails.find(d => d.company.id === cid)
                    const isNew     = !before && !!after
                    const isEnded   = !!before && !after
                    const isChanged = !!before && !!after && (
                      before.org.id !== after.org.id ||
                      before.pos.band !== after.pos.band ||
                      before.pos.title !== after.pos.title
                    )
                    if (!isNew && !isEnded && !isChanged) return null
                    return (
                      <div key={cid} className={`flex items-center gap-2 text-xs rounded px-2 py-1 mb-1 ${
                        isNew ? 'bg-green-50' : isEnded ? 'bg-red-50' : 'bg-yellow-50'
                      }`}>
                        <span className="text-gray-500 flex-shrink-0">{company?.name}</span>
                        <div className="flex-1 min-w-0">
                          {before && (
                            <span className={isEnded || isChanged ? 'line-through text-gray-400' : ''}>
                              {before.org.name} {before.aff.individualBand ?? before.pos.band}
                            </span>
                          )}
                          {(isChanged || isNew) && after && (
                            <>
                              {isChanged && <span className="mx-1 text-gray-400">→</span>}
                              <span className={isNew ? 'text-green-700 font-medium' : 'text-yellow-700 font-medium'}>
                                {after.org.name} {after.aff.individualBand ?? after.pos.band}
                              </span>
                            </>
                          )}
                        </div>
                        <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                          isNew ? 'bg-green-100 text-green-700' : isEnded ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>{isNew ? '新規' : isEnded ? '終了' : '変更'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* This person's operations */}
            <div className="px-3 pt-3 pb-3">
              <div className="text-xs font-semibold text-gray-500 mb-1.5">
                積み重ね手順 <span className="text-gray-300 font-normal">({personOps.length}件)</span>
              </div>
              {personOps.length === 0 ? (
                <div className="text-xs text-gray-400 pl-3">手順なし</div>
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

      {/* ── Right: form panel ───────────────────────────────── */}
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
            {/* Form header */}
            <div className="flex items-center gap-2 pb-2 mb-2 border-b border-gray-100">
              <span className={`px-2 py-0.5 rounded text-xs font-semibold ${activeAction?.color ?? ''}`}>
                {activeAction?.symbol} {activeAction?.label}
              </span>
              <span className="text-gray-500 text-xs truncate flex-1">{person.name}</span>
            </div>

            {/* Render the appropriate form component */}
            {selectedAction === 'MoveToOrg'            && <MoveToOrgForm           key="move"   {...formProps} />}
            {selectedAction === 'SendOnSecondment'      && <SendOnSecondmentForm     key="send"   {...formProps} />}
            {selectedAction === 'RecallFromSecondment'  && <RecallFromSecondmentForm key="recall" {...formProps} />}
            {selectedAction === 'AddConcurrent'         && <AddConcurrentForm        key="add"    {...formProps} />}
            {selectedAction === 'RemoveConcurrent'      && <RemoveConcurrentForm     key="remove" {...formProps} />}
            {selectedAction === 'Promote'               && <PromoteForm              key="promote" {...formProps} />}
          </div>
        )}
      </div>

    </div>
  )
}
