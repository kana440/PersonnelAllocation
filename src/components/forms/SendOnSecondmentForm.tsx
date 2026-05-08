import { useState } from 'react'
import type { BaseFormProps } from './types'
import { BandSelector, CompanyBtn, FormFooter, FromCard, MetaSection, OrgSelect, TitleRow } from './parts'

export function SendOnSecondmentForm({
  person, primaryAft, companies, afterOrganizations, onSubmit, onCancel,
}: BaseFormProps) {
  const [targetCompanyId, setTargetCompanyId] = useState('')
  const [targetOrgId,     setTargetOrgId]     = useState('')
  const [targetBand,      setTargetBand]      = useState(primaryAft?.aff.individualBand ?? primaryAft?.pos.band ?? 'B4')
  const [targetTitle,     setTargetTitle]     = useState('担当')
  const [targetFreeTitle, setTargetFreeTitle] = useState('')
  const [transferReason,  setTransferReason]  = useState('')
  const [memo,            setMemo]            = useState('')

  const currentBand = primaryAft?.aff.individualBand ?? primaryAft?.pos.band
  const orgs = afterOrganizations.filter(o =>
    o.companyId === targetCompanyId && o.parentId !== null && !o.isAbandoned
  )

  const selectCompany = (id: string) => { setTargetCompanyId(id); setTargetOrgId('') }

  const handleSubmit = () => {
    const org = afterOrganizations.find(o => o.id === targetOrgId)
    const cmp = companies.find(c => c.id === targetCompanyId)
    onSubmit({
      kind: 'SendOnSecondment',
      label: `出向：${cmp?.name ?? ''} / ${org?.name ?? ''}`,
      params: {
        personId: person.id, toCompanyId: targetCompanyId, orgId: targetOrgId,
        band: targetBand, title: targetTitle,
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
          <FromCard title="現在（出向前）" items={primaryAft ? [primaryAft] : []} />
          <div>
            <div className="text-gray-500 mb-1 text-xs">↗ 出向先会社</div>
            <div className="flex flex-wrap gap-1">
              {companies.map(c => (
                <CompanyBtn
                  key={c.id} company={c}
                  selected={targetCompanyId === c.id}
                  onSelect={() => selectCompany(c.id)}
                  activeColor="border-green-400 bg-green-100 text-green-700"
                />
              ))}
            </div>
          </div>
          {targetCompanyId && (
            <OrgSelect label="出向先組織" value={targetOrgId} onChange={setTargetOrgId} orgs={orgs} />
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
                <div className="text-gray-500 mb-1 text-xs">バンド <span className="text-gray-300 text-xs">↑引継</span></div>
                <BandSelector
                  value={targetBand} onChange={setTargetBand}
                  activeColor="border-green-400 bg-green-100 text-green-700"
                  currentBand={currentBand}
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-400 italic pt-6 text-center">← 会社・組織を選択</div>
          )}
        </div>
      </div>
      <MetaSection
        transferReason={transferReason} onTransferReason={setTransferReason}
        memo={memo} onMemo={setMemo}
        promotionSign={false} onPromotionSign={() => {}}
      />
      <FormFooter
        onCancel={onCancel} onSubmit={handleSubmit}
        disabled={!targetCompanyId || !targetOrgId}
      />
    </div>
  )
}
