import { useState } from 'react'
import { useStore } from '../store/useStore'
import type { OperationKind } from '../types/domain'

type ActionKind = Extract<OperationKind,
  'MoveToOrg' | 'AddConcurrent' | 'RemoveConcurrent' |
  'SendOnSecondment' | 'RecallFromSecondment' | 'Promote'
>

const BANDS = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']

const BAND_GRADE: Record<string, string> = {
  B7: '7等級', B6: '6等級', B5: '5等級', B4: '4等級', B3: '3等級', B2: '2等級', B1: '1等級',
}

const TRANSFER_REASONS = ['組織異動', '昇格', '降格', '出向', '出向解除', '兼務追加', '兼務解除', '採用', '退職', 'その他']

const ACTIONS: { kind: ActionKind; label: string; desc: string; symbol: string; color: string }[] = [
  { kind: 'MoveToOrg',            label: '分掌異動',  desc: '組織間移動',    symbol: '→', color: 'border-blue-200   bg-blue-50   text-blue-700   hover:bg-blue-100' },
  { kind: 'SendOnSecondment',     label: '出向',      desc: '他社出向',      symbol: '↗', color: 'border-green-200  bg-green-50  text-green-700  hover:bg-green-100' },
  { kind: 'RecallFromSecondment', label: '出向解除',  desc: '出向終了',      symbol: '↙', color: 'border-red-200    bg-red-50    text-red-700    hover:bg-red-100' },
  { kind: 'AddConcurrent',        label: '兼務追加',  desc: '兼務ポジション', symbol: '+', color: 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100' },
  { kind: 'RemoveConcurrent',     label: '兼務解除',  desc: '兼務終了',      symbol: '−', color: 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { kind: 'Promote',              label: '昇降格',    desc: 'バンド変更',    symbol: '↕', color: 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100' },
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
    persons, companies, organizations,
    beforeAffiliations, beforePositions,
    afterAffiliations, afterPositions,
    selectedPersonId, operations,
    effectiveDate, addOperation, removeOperation,
    focusOrg, selectPerson, clearPersonSelection,
  } = useStore()

  const [search, setSearch] = useState('')
  const [selectedAction, setSelectedAction] = useState<ActionKind | null>(null)
  const [targetCompanyId, setTargetCompanyId] = useState('')
  const [targetOrgId, setTargetOrgId] = useState('')
  const [targetBand, setTargetBand] = useState('B4')
  const [targetTitle, setTargetTitle] = useState('担当')
  const [targetFreeTitle, setTargetFreeTitle] = useState('')
  const [targetConcurrentReason, setTargetConcurrentReason] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [memo, setMemo] = useState('')
  const [promotionSign, setPromotionSign] = useState(false)

  const person = persons.find(p => p.id === selectedPersonId)
  const searchLower = search.toLowerCase()
  const matchedPersons = searchLower
    ? persons.filter(p => p.name.toLowerCase().includes(searchLower) && p.id !== selectedPersonId)
    : []

  const getAffDetails = (personId: string, affs: typeof beforeAffiliations, positions: typeof beforePositions) =>
    affs
      .filter(a => a.personId === personId && a.status === 'active')
      .flatMap(a => {
        const pos     = positions.find(p => p.id === a.positionId)
        const org     = organizations.find(o => o.id === pos?.orgId)
        const company = companies.find(c => c.id === pos?.companyId)
        if (!pos || !org || !company) return []
        return [{ aff: a, pos, org, company }]
      })

  type AffDetail = ReturnType<typeof getAffDetails>[number]

  const beforeDetails = person ? getAffDetails(person.id, beforeAffiliations, beforePositions) : []
  const afterDetails  = person ? getAffDetails(person.id, afterAffiliations,  afterPositions)  : []

  const allCompanyIds    = [...new Set([...beforeDetails.map(d => d.company.id), ...afterDetails.map(d => d.company.id)])]
  const activeCompanyIds = afterDetails.map(d => d.company.id)

  const primaryAft    = afterDetails.find(d => d.aff.type === 'primary')
  const concurrentAft = afterDetails.filter(d => d.aff.type === 'concurrent')

  const personOps = operations
    .filter(op => op.params.personId === selectedPersonId)
    .sort((a, b) => a.order - b.order)

  // ── form state helpers ──────────────────────────────────────
  const resetForm = (kind: ActionKind) => {
    setSelectedAction(kind)
    setMemo('')
    setTransferReason('')
    setTargetFreeTitle('')
    setTargetConcurrentReason('')
    setTargetOrgId('')

    const band  = primaryAft?.aff.individualBand ?? primaryAft?.pos.band ?? 'B4'
    const title = primaryAft?.aff.freeTitle ?? primaryAft?.pos.title ?? '担当'

    switch (kind) {
      case 'MoveToOrg':
        setTargetCompanyId(primaryAft?.company.id ?? ''); setTargetBand(band); setTargetTitle(title); setPromotionSign(false); break
      case 'AddConcurrent':
        setTargetCompanyId(primaryAft?.company.id ?? ''); setTargetBand(band); setTargetTitle('兼務'); setPromotionSign(false); break
      case 'SendOnSecondment':
        setTargetCompanyId(''); setTargetBand(band); setTargetTitle('担当'); setPromotionSign(false); break
      case 'Promote':
        setTargetCompanyId(primaryAft?.company.id ?? ''); setTargetBand(band); setPromotionSign(true); break
      default:
        setTargetCompanyId(''); setTargetBand('B4'); setTargetTitle('担当'); setPromotionSign(false)
    }
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
        params = { personId: selectedPersonId, toCompanyId: targetCompanyId, orgId: targetOrgId, band: targetBand, title: targetTitle,
          ...(targetFreeTitle && { freeTitle: targetFreeTitle }) }
        label = `出向：${cName} / ${oName}`
        break
      case 'MoveToOrg': {
        const companyId = targetCompanyId || (primaryAft?.company.id ?? '')
        params = { personId: selectedPersonId, toOrgId: targetOrgId, companyId, band: targetBand, title: targetTitle,
          ...(targetFreeTitle && { freeTitle: targetFreeTitle }) }
        label = `分掌異動：${oName}`
        break
      }
      case 'AddConcurrent': {
        const companyId = organizations.find(o => o.id === targetOrgId)?.companyId ?? targetCompanyId
        params = { personId: selectedPersonId, orgId: targetOrgId, companyId, band: targetBand, title: targetTitle,
          ...(targetConcurrentReason && { concurrentReason: targetConcurrentReason }),
          ...(targetFreeTitle && { freeTitle: targetFreeTitle }) }
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
        label = `昇降格：${cName} → ${targetBand}`
        break
    }
    addOperation({ kind, label, params, effectiveDate,
      transferReason: transferReason || undefined,
      memo: memo || undefined,
      promotionSign: promotionSign || undefined,
    })
    setSelectedAction(null)
  }

  // ── form sub-components ────────────────────────────────────
  const targetCompanyOrgs = organizations.filter(o => o.companyId === targetCompanyId && o.parentId !== null)

  // Shows a person's current affiliation state
  const FromCard = ({ title, items }: { title: string; items: AffDetail[] }) => (
    <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs">
      <div className="text-gray-400 mb-0.5 font-medium">{title}</div>
      {items.length === 0
        ? <span className="text-gray-400 italic">なし</span>
        : items.map(d => (
          <div key={d.aff.id} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-gray-400">{d.company.name}</span>
            <span className="font-semibold text-gray-700">{d.org.name}</span>
            <span className="text-gray-500">{d.aff.freeTitle ?? d.pos.title}</span>
            <span className="font-mono font-medium text-blue-600">{d.aff.individualBand ?? d.pos.band}</span>
            {d.aff.salaryGrade && <span className="text-gray-400">({d.aff.salaryGrade})</span>}
            {d.aff.employmentType === '出向' && <span className="bg-orange-100 text-orange-600 px-1 rounded">出向</span>}
            {d.aff.type === 'concurrent' && <span className="text-purple-400">兼務</span>}
          </div>
        ))
      }
    </div>
  )

  const CompanyBtn = ({ id, activeColor }: { id: string; activeColor: string }) => {
    const c = companies.find(x => x.id === id)!
    return (
      <button
        onClick={() => { setTargetCompanyId(id); setTargetOrgId('') }}
        className={`px-2.5 py-1.5 border rounded text-xs font-medium transition-colors ${
          targetCompanyId === id ? activeColor : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {c.name}{!c.hasSF && <span className="ml-1 text-gray-400 font-normal text-xs">(SF外)</span>}
      </button>
    )
  }

  const OrgSelect = ({ label }: { label: string }) => (
    <div>
      <div className="text-gray-500 mb-1 text-xs">{label}</div>
      <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)}
        className="w-full border rounded px-2 py-1.5 text-xs">
        <option value="">— 選択してください —</option>
        {targetCompanyOrgs.map(o => (
          <option key={o.id} value={o.id}>{'　'.repeat(o.level - 2)}{o.name}</option>
        ))}
      </select>
    </div>
  )

  const BandSelector = ({ activeColor, currentBand }: { activeColor: string; currentBand?: string }) => (
    <div className="flex gap-1 flex-wrap">
      {BANDS.map(b => (
        <button key={b} onClick={() => setTargetBand(b)}
          className={`px-2 py-0.5 border rounded text-xs font-medium transition-colors leading-none ${
            targetBand === b ? activeColor :
            b === currentBand ? 'border-gray-400 bg-gray-100 text-gray-500' :
            'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {b}
          {b === currentBand && <span className="block text-xs text-gray-400 leading-none">現在</span>}
        </button>
      ))}
    </div>
  )

  const TitleRow = ({ showFree = false }: { showFree?: boolean }) => (
    <div className={`grid gap-2 ${showFree ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <div>
        <div className="text-gray-500 mb-1 text-xs">役職 <span className="text-gray-300 text-xs">↑引継</span></div>
        <input value={targetTitle} onChange={e => setTargetTitle(e.target.value)}
          className="w-full border rounded px-2 py-1 text-xs" />
      </div>
      {showFree && (
        <div>
          <div className="text-gray-500 mb-1 text-xs">フリータイトル</div>
          <input value={targetFreeTitle} onChange={e => setTargetFreeTitle(e.target.value)}
            placeholder="個別役職名" className="w-full border rounded px-2 py-1 text-xs" />
        </div>
      )}
    </div>
  )

  const MetaSection = () => (
    <div className="border-t border-gray-100 pt-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-gray-500 mb-1 text-xs">申請区分</div>
          <select value={transferReason} onChange={e => setTransferReason(e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs">
            <option value="">— 自動判定 —</option>
            {TRANSFER_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={promotionSign} onChange={e => setPromotionSign(e.target.checked)} className="rounded" />
            昇降格サイン
          </label>
        </div>
      </div>
      <div>
        <div className="text-gray-500 mb-1 text-xs">メモ</div>
        <input value={memo} onChange={e => setMemo(e.target.value)}
          placeholder="任意メモ..." className="w-full border rounded px-2 py-1 text-xs" />
      </div>
    </div>
  )

  // ── operation-specific forms ───────────────────────────────
  const renderForm = () => {
    const currentBandPrimary = primaryAft?.aff.individualBand ?? primaryAft?.pos.band

    switch (selectedAction) {

      // ── 分掌異動 ──────────────────────────────────────────
      case 'MoveToOrg':
        return (
          <div className="space-y-2">
            <FromCard title="現在（異動前）" items={primaryAft ? [primaryAft] : []} />
            <div className="text-xs text-gray-400 pl-1 flex items-center gap-1">↓ 異動先</div>
            <OrgSelect label="異動先組織" />
            {targetOrgId && (
              <>
                <TitleRow showFree />
                <div>
                  <div className="text-gray-500 mb-1 text-xs">バンド <span className="text-gray-300 text-xs">↑引継</span></div>
                  <BandSelector activeColor="border-blue-400 bg-blue-100 text-blue-700" currentBand={currentBandPrimary} />
                </div>
              </>
            )}
            <MetaSection />
          </div>
        )

      // ── 出向 ─────────────────────────────────────────────
      case 'SendOnSecondment':
        return (
          <div className="space-y-2">
            <FromCard title="現在（出向前）" items={primaryAft ? [primaryAft] : []} />
            <div className="text-xs text-gray-400 pl-1">↗ 出向先</div>
            <div>
              <div className="text-gray-500 mb-1 text-xs">出向先会社</div>
              <div className="flex flex-wrap gap-1">
                {companies.map(c => <CompanyBtn key={c.id} id={c.id} activeColor="border-green-400 bg-green-100 text-green-700" />)}
              </div>
            </div>
            {targetCompanyId && <OrgSelect label="出向先組織" />}
            {targetOrgId && (
              <>
                <TitleRow showFree />
                <div>
                  <div className="text-gray-500 mb-1 text-xs">バンド <span className="text-gray-300 text-xs">↑引継</span></div>
                  <BandSelector activeColor="border-green-400 bg-green-100 text-green-700" currentBand={currentBandPrimary} />
                </div>
              </>
            )}
            <MetaSection />
          </div>
        )

      // ── 出向解除 ─────────────────────────────────────────
      case 'RecallFromSecondment': {
        const secondments = afterDetails.filter(d => {
          return d.aff.employmentType === '出向' || d.aff.secondmentSourceCompanyId
        })
        return (
          <div className="space-y-2">
            <FromCard title="現在の出向先" items={secondments.length ? secondments : afterDetails.filter(d => d.aff.type === 'primary')} />
            <div className="text-xs text-gray-400 pl-1">↙ 解除する出向先会社を選択</div>
            <div className="flex flex-wrap gap-1">
              {activeCompanyIds.map(id => (
                <CompanyBtn key={id} id={id} activeColor="border-red-400 bg-red-100 text-red-700" />
              ))}
            </div>
            <MetaSection />
          </div>
        )
      }

      // ── 兼務追加 ─────────────────────────────────────────
      case 'AddConcurrent':
        return (
          <div className="space-y-2">
            <FromCard title="本務（引継元）" items={primaryAft ? [primaryAft] : []} />
            {concurrentAft.length > 0 && (
              <FromCard title="既存兼務" items={concurrentAft} />
            )}
            <div className="text-xs text-gray-400 pl-1">+ 兼務先</div>
            <div>
              <div className="text-gray-500 mb-1 text-xs">兼務先会社</div>
              <div className="flex flex-wrap gap-1">
                {companies.map(c => <CompanyBtn key={c.id} id={c.id} activeColor="border-purple-400 bg-purple-100 text-purple-700" />)}
              </div>
            </div>
            {targetCompanyId && <OrgSelect label="兼務先組織" />}
            {targetOrgId && (
              <>
                <TitleRow showFree />
                <div>
                  <div className="text-gray-500 mb-1 text-xs">バンド <span className="text-gray-300 text-xs">↑本務引継</span></div>
                  <BandSelector activeColor="border-purple-400 bg-purple-100 text-purple-700" currentBand={currentBandPrimary} />
                </div>
                <div>
                  <div className="text-gray-500 mb-1 text-xs">兼務理由</div>
                  <input value={targetConcurrentReason} onChange={e => setTargetConcurrentReason(e.target.value)}
                    placeholder="例：プロジェクト対応" className="w-full border rounded px-2 py-1 text-xs" />
                </div>
              </>
            )}
            <MetaSection />
          </div>
        )

      // ── 兼務解除 ─────────────────────────────────────────
      case 'RemoveConcurrent':
        return (
          <div className="space-y-2">
            <div className="text-xs text-gray-500">解除する兼務を選んでください</div>
            {concurrentAft.length === 0
              ? <div className="text-xs text-gray-400 italic pl-2">兼務はありません</div>
              : (
                <div className="space-y-1">
                  {concurrentAft.map(d => (
                    <button key={d.aff.id}
                      onClick={() => setTargetOrgId(d.org.id)}
                      className={`w-full text-left px-2 py-1.5 border rounded text-xs transition-colors ${
                        targetOrgId === d.org.id
                          ? 'border-orange-400 bg-orange-50 text-orange-800'
                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">{d.company.name}</span>
                        <span className="font-medium">{d.org.name}</span>
                        <span className="text-gray-500">{d.pos.title}</span>
                        <span className="font-mono text-purple-600">{d.pos.band}</span>
                        {d.aff.concurrentReason && <span className="text-gray-400 ml-auto truncate">{d.aff.concurrentReason}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )
            }
            <MetaSection />
          </div>
        )

      // ── 昇降格 ───────────────────────────────────────────
      case 'Promote': {
        const currD    = afterDetails.find(d => d.company.id === targetCompanyId && d.aff.type === 'primary')
        const currBand = currD ? (currD.aff.individualBand ?? currD.pos.band) : undefined
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
            {targetCompanyId && (
              <>
                {currD && (
                  <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs flex items-center gap-2">
                    <span className="text-gray-400">現在:</span>
                    <span className="font-mono font-semibold text-gray-700">{currBand}</span>
                    {currD.aff.salaryGrade && <span className="text-gray-500">({currD.aff.salaryGrade})</span>}
                    <span className="text-gray-300 mx-1">→</span>
                    {targetBand !== currBand
                      ? <>
                          <span className={`font-mono font-semibold ${targetBand > (currBand ?? '') ? 'text-green-600' : 'text-red-600'}`}>{targetBand}</span>
                          <span className="text-gray-500">({BAND_GRADE[targetBand] ?? ''})</span>
                          <span className="ml-1 text-xs text-gray-400">給与等級 自動更新</span>
                        </>
                      : <span className="text-gray-400 italic">変更なし</span>
                    }
                  </div>
                )}
                <div>
                  <div className="text-gray-500 mb-1 text-xs">昇降格後バンド</div>
                  <BandSelector activeColor="border-yellow-400 bg-yellow-100 text-yellow-700" currentBand={currBand} />
                </div>
                {targetBand < (currBand ?? 'B8') && (
                  <div>
                    <div className="text-gray-500 mb-1 text-xs">降格理由</div>
                    <input value={memo} onChange={e => setMemo(e.target.value)}
                      placeholder="降格理由を入力..." className="w-full border border-red-200 rounded px-2 py-1 text-xs" />
                  </div>
                )}
              </>
            )}
            <MetaSection />
          </div>
        )
      }

      default: return null
    }
  }

  // ── render helpers for affiliations display ────────────────
  const AffLine = ({ d }: { d: AffDetail }) => (
    <div className="text-xs">
      <span className="text-gray-400 mr-1">{d.company.name}</span>
      <button onClick={() => focusOrg(d.org.id)}
        className="text-blue-600 hover:text-blue-800 hover:underline font-medium">
        {d.org.name}
      </button>
      <span className="text-gray-500 ml-1">{d.aff.freeTitle ?? d.pos.title}</span>
      <span className={`ml-1 font-medium ${d.aff.type === 'primary' ? 'text-blue-600' : 'text-green-600'}`}>
        {d.aff.individualBand ?? d.pos.band}
      </span>
      {d.aff.salaryGrade && <span className="text-gray-400 ml-0.5 text-xs">({d.aff.salaryGrade})</span>}
      {d.aff.type === 'concurrent' && <span className="ml-1 text-purple-500 text-xs">兼務</span>}
      {d.aff.employmentType && d.aff.employmentType !== '正社員' &&
        <span className="ml-1 text-orange-500 text-xs">{d.aff.employmentType}</span>}
    </div>
  )

  const actionItem = selectedAction ? ACTIONS.find(a => a.kind === selectedAction) : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 mb-2">
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
          <button onClick={clearPersonSelection} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0 px-1" title="閉じる">✕</button>
        </div>
        <div className="relative">
          <input type="text" placeholder="別の人を検索..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
          {matchedPersons.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-lg z-10 mt-1">
              {matchedPersons.map(p => (
                <button key={p.id} onClick={() => { selectPerson(p.id); setSearch(''); setSelectedAction(null) }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 hover:text-blue-700">
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!person ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-xs text-center px-4">
          組織図の人カードをクリックするか、上の検索で人名を入力してください
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">

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
                    before.org.id !== after.org.id || before.pos.band !== after.pos.band || before.pos.title !== after.pos.title
                  )
                  if (!isNew && !isEnded && !isChanged) return null
                  return (
                    <div key={cid} className={`flex items-center gap-2 text-xs rounded px-2 py-1 mb-1 ${
                      isNew ? 'bg-green-50' : isEnded ? 'bg-red-50' : 'bg-yellow-50'
                    }`}>
                      <span className="text-gray-500 flex-shrink-0">{company?.name}</span>
                      <div className="flex-1 min-w-0">
                        {before && <span className={isEnded || isChanged ? 'line-through text-gray-400' : ''}>{before.org.name} {before.aff.individualBand ?? before.pos.band}</span>}
                        {(isChanged || isNew) && after && (
                          <>{isChanged && <span className="mx-1 text-gray-400">→</span>}
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
          <div className="px-3 pt-3">
            <div className="text-xs font-semibold text-gray-500 mb-1.5">
              積み重ね手順 <span className="text-gray-300 font-normal">({personOps.length}件)</span>
            </div>
            {personOps.length === 0
              ? <div className="text-xs text-gray-400 pl-3 pb-2">手順なし</div>
              : (
                <div className="space-y-1 mb-2">
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
                        <button onClick={() => removeOperation(op.id)} className="opacity-30 hover:opacity-80 hover:text-red-600 flex-shrink-0 pt-0.5">✕</button>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </div>

          {/* Operation form */}
          <div className="px-3 pb-3 border-t border-gray-100 pt-2">
            {!selectedAction ? (
              <>
                <div className="text-xs font-semibold text-gray-500 mb-1.5">手順を追加</div>
                <div className="grid grid-cols-3 gap-1">
                  {ACTIONS.map(({ kind, label, desc, symbol, color }) => (
                    <button key={kind} onClick={() => resetForm(kind)}
                      className={`border rounded px-1 py-2 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors ${color}`}
                    >
                      <span className="text-base leading-none">{symbol}</span>
                      <span className="leading-tight">{label}</span>
                      <span className="text-xs opacity-60 leading-tight">{desc}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="border border-gray-200 rounded-lg p-2.5 bg-white text-xs space-y-2.5 shadow-sm">
                {/* Form header */}
                <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ACTIONS.find(a => a.kind === selectedAction)?.color ?? ''}`}>
                    {actionItem?.symbol} {actionItem?.label}
                  </span>
                  <span className="text-gray-400 truncate flex-1">{person.name}</span>
                </div>

                {renderForm()}

                <div className="flex gap-2 justify-end pt-1 border-t border-gray-100">
                  <button onClick={() => setSelectedAction(null)}
                    className="px-3 py-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50">
                    キャンセル
                  </button>
                  <button onClick={handleSubmit} disabled={!isSubmittable()}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    手順に追加
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
