import { useState } from 'react'
import type { BaseFormProps } from './types'
import { BandSelector, CompanyBtn, FormFooter, FromCard, MetaSection, OrgSelect, TitleRow } from './parts'

export function AddConcurrentForm({
  person, primaryAft, concurrentAft, companies, afterOrganizations,
  bands, transferReasons, onSubmit, onCancel,
}: BaseFormProps) {
  const [targetCompanyId,        setTargetCompanyId]        = useState(primaryAft?.company.id ?? '')
  const [targetOrgId,            setTargetOrgId]            = useState('')
  const [targetBand,             setTargetBand]             = useState(primaryAft?.aff.individualBand ?? primaryAft?.pos.band ?? 'B4')
  const [targetTitle,            setTargetTitle]            = useState('兼務')
  const [targetFreeTitle,        setTargetFreeTitle]        = useState('')
  const [targetConcurrentReason, setTargetConcurrentReason] = useState('')
  const [transferReason,         setTransferReason]         = useState('')
  const [memo,                   setMemo]                   = useState('')

  const currentBand = primaryAft?.aff.individualBand ?? primaryAft?.pos.band
  const orgs = afterOrganizations.filter(o =>
    o.companyId === targetCompanyId && o.parentId !== null && !o.isAbandoned
  )

  const selectCompany = (id: string) => { setTargetCompanyId(id); setTargetOrgId('') }

  const handleSubmit = () => {
    const org = afterOrganizations.find(o => o.id === targetOrgId)
    const companyId = org?.companyId ?? targetCompanyId
    onSubmit({
      kind: 'AddConcurrent',
      label: `兼務追加：${org?.name ?? ''}`,
      params: {
        personId: person.id, orgId: targetOrgId, companyId,
        band: targetBand, title: targetTitle,
        ...(targetConcurrentReason && { concurrentReason: targetConcurrentReason }),
        ...(targetFreeTitle && { freeTitle: targetFreeTitle }),
      },
      transferReason: transferReason || undefined,
      memo: memo || undefined,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FromCard title="本務（引継元）" items={primaryAft ? [primaryAft] : []} />
          {concurrentAft.length > 0 && <FromCard title="既存兼務" items={concurrentAft} />}
          <div>
            <div className="text-gray-500 mb-1 text-xs">+ 兼務先会社</div>
            <div className="flex flex-wrap gap-1">
              {companies.map(c => (
                <CompanyBtn
                  key={c.id} company={c}
                  selected={targetCompanyId === c.id}
                  onSelect={() => selectCompany(c.id)}
                  activeColor="border-purple-400 bg-purple-100 text-purple-700"
                />
              ))}
            </div>
          </div>
          {targetCompanyId && (
            <OrgSelect label="兼務先組織" value={targetOrgId} onChange={setTargetOrgId} orgs={orgs} />
          )}
        </div>
        <div className="space-y-2">
          {targetOrgId ? (
            <>
              <TitleRow
                title={targetTitle} onTitle={setTargetTitle}
                freeTitle={targetFreeTitle} onFreeTitle={setTargetFreeTitle}
                showFree
              />
              <div>
                <div className="text-gray-500 mb-1 text-xs">バンド <span className="text-gray-300 text-xs">↑本務引継</span></div>
                <BandSelector
                  value={targetBand} onChange={setTargetBand}
                  activeColor="border-purple-400 bg-purple-100 text-purple-700"
                  currentBand={currentBand}
                  bands={bands}
                />
              </div>
              <div>
                <div className="text-gray-500 mb-1 text-xs">兼務理由</div>
                <input
                  value={targetConcurrentReason}
                  onChange={e => setTargetConcurrentReason(e.target.value)}
                  placeholder="例：プロジェクト対応"
                  className="w-full border rounded px-2 py-1 text-xs"
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-400 italic pt-6 text-center">← 組織を選択</div>
          )}
        </div>
      </div>
      <MetaSection
        transferReason={transferReason} onTransferReason={setTransferReason}
        memo={memo} onMemo={setMemo}
        promotionSign={false} onPromotionSign={() => {}}
        transferReasons={transferReasons}
      />
      <FormFooter onCancel={onCancel} onSubmit={handleSubmit} disabled={!targetCompanyId || !targetOrgId} />
    </div>
  )
}
