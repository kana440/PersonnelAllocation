import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { OperationKind } from '../types/domain'

type ActionKind = Extract<OperationKind,
  'MoveToOrg' | 'AddConcurrent' | 'RemoveConcurrent' |
  'SendOnSecondment' | 'RecallFromSecondment' | 'Promote'
>

const ACTIONS: { kind: ActionKind; label: string; symbol: string; color: string }[] = [
  { kind: 'MoveToOrg',            label: '組織異動',  symbol: '→',  color: 'border-blue-200   bg-blue-50   text-blue-700   hover:bg-blue-100' },
  { kind: 'SendOnSecondment',     label: '出向',      symbol: '↗',  color: 'border-green-200  bg-green-50  text-green-700  hover:bg-green-100' },
  { kind: 'RecallFromSecondment', label: '出向解除',  symbol: '↙',  color: 'border-red-200    bg-red-50    text-red-700    hover:bg-red-100' },
  { kind: 'AddConcurrent',        label: '兼務追加',  symbol: '+',  color: 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100' },
  { kind: 'RemoveConcurrent',     label: '兼務解除',  symbol: '−',  color: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { kind: 'Promote',              label: '昇格',      symbol: '↑',  color: 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
]

const BANDS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']

export function PersonActionPanel() {
  const {
    persons, companies, organizations,
    beforeAffiliations, beforePositions,
    afterAffiliations, afterPositions,
    selectedPersonId, effectiveDate,
    addOperation,
  } = useStore()

  const [selectedAction, setSelectedAction] = useState<ActionKind | null>(null)
  const [targetCompanyId, setTargetCompanyId] = useState('')
  const [targetOrgId, setTargetOrgId] = useState('')
  const [targetBand, setTargetBand] = useState('B4')
  const [targetTitle, setTargetTitle] = useState('担当')

  const person = persons.find(p => p.id === selectedPersonId)

  // Helper: get affiliation details for a person
  const getAffDetails = (personId: string, affs: typeof beforeAffiliations, positions: typeof beforePositions) =>
    affs
      .filter(a => a.personId === personId && a.status === 'active')
      .flatMap(a => {
        const pos = positions.find(p => p.id === a.positionId)
        const org = organizations.find(o => o.id === pos?.orgId)
        const company = companies.find(c => c.id === pos?.companyId)
        const manager = persons.find(p => p.id === a.managerId)
        if (!pos || !org || !company) return []
        return [{ aff: a, pos, org, company, manager }]
      })

  const beforeDetails = getAffDetails(selectedPersonId ?? '', beforeAffiliations, beforePositions)
  const afterDetails  = getAffDetails(selectedPersonId ?? '', afterAffiliations,  afterPositions)

  // All companies this person touches (before or after)
  const allCompanyIds = [...new Set([
    ...beforeDetails.map(d => d.company.id),
    ...afterDetails.map(d => d.company.id),
  ])]

  // Companies with active afterAffiliations (for contextual options)
  const activeCompanyIds = afterDetails.map(d => d.company.id)

  // Orgs in the target company (level > root)
  const targetCompanyOrgs = organizations.filter(
    o => o.companyId === targetCompanyId && o.parentId !== null
  )

  const resetForm = (kind: ActionKind) => {
    setSelectedAction(kind)
    setTargetCompanyId('')
    setTargetOrgId('')
    setTargetBand('B4')
    setTargetTitle('担当')
  }

  const isSubmittable = (): boolean => {
    if (!selectedAction) return false
    if (selectedAction === 'RecallFromSecondment') return !!targetCompanyId
    if (selectedAction === 'Promote')              return !!targetCompanyId && !!targetBand
    if (selectedAction === 'RemoveConcurrent')     return !!targetOrgId
    return !!targetCompanyId && !!targetOrgId
  }

  const handleSubmit = () => {
    if (!selectedAction || !selectedPersonId) return
    const kind: OperationKind = selectedAction
    let label = ''
    let params: Record<string, string> = { personId: selectedPersonId }

    const cName = companies.find(c => c.id === targetCompanyId)?.name ?? ''
    const oName = organizations.find(o => o.id === targetOrgId)?.name ?? ''

    switch (selectedAction) {
      case 'RecallFromSecondment':
        params = { personId: selectedPersonId, companyId: targetCompanyId }
        label = `出向解除：${cName}`
        break
      case 'SendOnSecondment':
        params = { personId: selectedPersonId, toCompanyId: targetCompanyId, orgId: targetOrgId, band: targetBand, title: targetTitle }
        label = `出向：${cName} / ${oName}`
        break
      case 'MoveToOrg': {
        const companyId = targetCompanyId || (afterDetails.find(d => d.aff.type === 'primary')?.company.id ?? '')
        params = { personId: selectedPersonId, toOrgId: targetOrgId, companyId, band: targetBand, title: targetTitle }
        label = `組織異動：${oName}`
        break
      }
      case 'AddConcurrent': {
        const companyId = organizations.find(o => o.id === targetOrgId)?.companyId ?? targetCompanyId
        params = { personId: selectedPersonId, orgId: targetOrgId, companyId, band: targetBand, title: targetTitle }
        label = `兼務追加：${oName}`
        break
      }
      case 'RemoveConcurrent': {
        const companyId = organizations.find(o => o.id === targetOrgId)?.companyId ?? ''
        params = { personId: selectedPersonId, orgId: targetOrgId, companyId }
        label = `兼務解除：${oName}`
        break
      }
      case 'Promote':
        params = { personId: selectedPersonId, companyId: targetCompanyId, band: targetBand }
        label = `昇格：${cName} → ${targetBand}`
        break
    }
    addOperation({ kind, label, params, effectiveDate })
    setSelectedAction(null)
  }

  // ── Company button helper ──────────────────────────────────
  const CompanyBtn = ({ id, activeColor }: { id: string; activeColor: string }) => {
    const c = companies.find(x => x.id === id)!
    return (
      <button
        onClick={() => { setTargetCompanyId(id); setTargetOrgId('') }}
        className={`px-3 py-1.5 border rounded text-xs font-medium transition-colors ${
          targetCompanyId === id ? activeColor : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {c.name}{!c.hasSF && <span className="ml-1 text-gray-400">(SF外)</span>}
      </button>
    )
  }

  const OrgSelect = ({ label }: { label: string }) => (
    <div>
      <div className="text-gray-500 mb-1">{label}</div>
      <select
        value={targetOrgId}
        onChange={e => setTargetOrgId(e.target.value)}
        className="w-full border rounded px-2 py-1.5 text-xs"
      >
        <option value="">— 選択してください —</option>
        {targetCompanyOrgs.map(o => (
          <option key={o.id} value={o.id}>
            {'　'.repeat(o.level - 2)}{o.name}
          </option>
        ))}
      </select>
    </div>
  )

  const BandRow = ({ activeColor }: { activeColor: string }) => (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="text-gray-500 mb-1">バンド</div>
        <div className="flex gap-1 flex-wrap">
          {BANDS.map(b => (
            <button key={b} onClick={() => setTargetBand(b)}
              className={`px-2 py-1 border rounded text-xs font-medium transition-colors ${
                targetBand === b ? activeColor : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >{b}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-gray-500 mb-1">役職</div>
        <input value={targetTitle} onChange={e => setTargetTitle(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-xs" />
      </div>
    </div>
  )

  // ── Action form by kind ─────────────────────────────────────
  const renderForm = () => {
    switch (selectedAction) {
      case 'RecallFromSecondment':
        return (
          <div>
            <div className="text-gray-500 mb-2 text-xs">解除する出向先会社を選んでください</div>
            <div className="flex flex-wrap gap-1">
              {activeCompanyIds.map(id => (
                <CompanyBtn key={id} id={id} activeColor="border-red-400 bg-red-100 text-red-700" />
              ))}
            </div>
          </div>
        )

      case 'SendOnSecondment':
        return (
          <div className="space-y-2">
            <div>
              <div className="text-gray-500 mb-1 text-xs">出向先会社</div>
              <div className="flex flex-wrap gap-1">
                {companies.map(c => (
                  <CompanyBtn key={c.id} id={c.id} activeColor="border-green-400 bg-green-100 text-green-700" />
                ))}
              </div>
            </div>
            {targetCompanyId && <OrgSelect label="出向先組織" />}
            {targetOrgId && <BandRow activeColor="border-green-400 bg-green-100 text-green-700" />}
          </div>
        )

      case 'MoveToOrg':
        return (
          <div className="space-y-2">
            <div>
              <div className="text-gray-500 mb-1 text-xs">会社</div>
              <div className="flex flex-wrap gap-1">
                {companies.filter(c => activeCompanyIds.includes(c.id)).map(c => (
                  <CompanyBtn key={c.id} id={c.id} activeColor="border-blue-400 bg-blue-100 text-blue-700" />
                ))}
              </div>
            </div>
            {targetCompanyId && <OrgSelect label="移動先組織" />}
            {targetOrgId && <BandRow activeColor="border-blue-400 bg-blue-100 text-blue-700" />}
          </div>
        )

      case 'AddConcurrent':
        return (
          <div className="space-y-2">
            <div>
              <div className="text-gray-500 mb-1 text-xs">兼務先会社</div>
              <div className="flex flex-wrap gap-1">
                {companies.map(c => (
                  <CompanyBtn key={c.id} id={c.id} activeColor="border-purple-400 bg-purple-100 text-purple-700" />
                ))}
              </div>
            </div>
            {targetCompanyId && <OrgSelect label="兼務先組織" />}
            {targetOrgId && <BandRow activeColor="border-purple-400 bg-purple-100 text-purple-700" />}
          </div>
        )

      case 'RemoveConcurrent': {
        const concurrents = afterDetails.filter(d => d.aff.type === 'concurrent')
        return (
          <div>
            <div className="text-gray-500 mb-2 text-xs">解除する兼務を選んでください</div>
            {concurrents.length === 0
              ? <div className="text-gray-400 text-xs">兼務はありません</div>
              : (
                <div className="flex flex-wrap gap-1">
                  {concurrents.map(d => (
                    <button key={d.aff.id}
                      onClick={() => setTargetOrgId(d.org.id)}
                      className={`px-3 py-1.5 border rounded text-xs font-medium transition-colors ${
                        targetOrgId === d.org.id
                          ? 'border-orange-400 bg-orange-100 text-orange-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {d.company.name} / {d.org.name}
                    </button>
                  ))}
                </div>
              )
            }
          </div>
        )
      }

      case 'Promote':
        return (
          <div className="space-y-2">
            <div>
              <div className="text-gray-500 mb-1 text-xs">対象会社</div>
              <div className="flex flex-wrap gap-1">
                {companies.filter(c => activeCompanyIds.includes(c.id)).map(c => (
                  <CompanyBtn key={c.id} id={c.id} activeColor="border-yellow-400 bg-yellow-100 text-yellow-700" />
                ))}
              </div>
            </div>
            <div>
              <div className="text-gray-500 mb-1 text-xs">昇格後バンド</div>
              <div className="flex gap-1 flex-wrap">
                {BANDS.map(b => (
                  <button key={b} onClick={() => setTargetBand(b)}
                    className={`px-2.5 py-1.5 border rounded text-xs font-medium transition-colors ${
                      targetBand === b ? 'border-yellow-400 bg-yellow-100 text-yellow-700' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >{b}</button>
                ))}
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // ── No person selected ──────────────────────────────────────
  if (!person) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
        <div className="text-3xl">←</div>
        <div className="text-sm">組織図から人を選んでください</div>
      </div>
    )
  }

  // ── Main render ─────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-y-auto gap-3">
      {/* Person header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-gray-800">{person.name}</span>
          <span className="ml-2 text-xs text-gray-400">SF: {person.sfPersonId ?? '—'}</span>
        </div>
        <button
          onClick={() => { /* noop, person stays selected */ }}
          className="text-xs text-gray-400 hover:text-gray-600"
        />
      </div>

      {/* Before→After summary */}
      <div className="border border-gray-100 rounded text-xs overflow-hidden">
        {allCompanyIds.map(cid => {
          const company = companies.find(c => c.id === cid)
          const before = beforeDetails.find(d => d.company.id === cid)
          const after  = afterDetails.find(d => d.company.id === cid)

          const isNew     = !before && !!after
          const isEnded   = !!before && !after
          const isChanged = !!before && !!after && (
            before.org.id !== after.org.id ||
            before.pos.band !== after.pos.band ||
            before.pos.title !== after.pos.title
          )

          const rowBg = isNew ? 'bg-green-50' : isEnded ? 'bg-red-50' : isChanged ? 'bg-yellow-50' : ''

          return (
            <div key={cid} className={`flex items-center border-b last:border-b-0 px-2 py-1.5 gap-2 ${rowBg}`}>
              <span className="text-gray-500 w-10 flex-shrink-0 font-medium">{company?.name}</span>
              <div className="flex-1 min-w-0">
                {before && (
                  <span className={isEnded || isChanged ? 'line-through text-gray-400' : 'text-gray-700'}>
                    {before.org.name} / {before.pos.title} / {before.pos.band}
                    {before.aff.type === 'concurrent' && <span className="ml-1 text-purple-500">兼務</span>}
                  </span>
                )}
                {(isChanged || isNew) && (
                  <>
                    {isChanged && <span className="mx-1.5 text-gray-400">→</span>}
                    {after && (
                      <span className={isNew ? 'text-green-700 font-medium' : 'text-yellow-700 font-medium'}>
                        {after.org.name} / {after.pos.title} / {after.pos.band}
                        {after.aff.type === 'concurrent' && <span className="ml-1 text-purple-500">兼務</span>}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="flex-shrink-0">
                {isNew     && <span className="bg-green-100  text-green-700  text-xs px-1.5 py-0.5 rounded">新規</span>}
                {isEnded   && <span className="bg-red-100    text-red-700    text-xs px-1.5 py-0.5 rounded">終了</span>}
                {isChanged && <span className="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded">変更</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Action buttons or form */}
      {!selectedAction ? (
        <div>
          <div className="text-xs text-gray-500 mb-2">この人への操作を選択</div>
          <div className="grid grid-cols-3 gap-1.5">
            {ACTIONS.map(({ kind, label, symbol, color }) => (
              <button
                key={kind}
                onClick={() => resetForm(kind)}
                className={`border rounded px-2 py-2.5 text-xs font-medium flex flex-col items-center gap-1 transition-colors ${color}`}
              >
                <span className="text-lg leading-none">{symbol}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded p-3 bg-gray-50 text-xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-700">
              {ACTIONS.find(a => a.kind === selectedAction)?.label}
            </span>
            <span className="text-gray-400">— {person.name}</span>
          </div>
          {renderForm()}
          <div className="flex gap-2 justify-end pt-1 border-t border-gray-200">
            <button
              onClick={() => setSelectedAction(null)}
              className="px-3 py-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isSubmittable()}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              手順に追加
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
