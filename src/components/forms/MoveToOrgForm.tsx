import { useState } from 'react'
import type { BaseFormProps } from './types'
import { BandSelector, FormFooter, FromCard, MetaSection, OrgSelect, TitleRow } from './parts'

export function MoveToOrgForm({
  person, primaryAft, afterOrganizations, bands, transferReasons, onSubmit, onCancel,
}: BaseFormProps) {
  const companyId = primaryAft?.company.id ?? ''
  const [targetOrgId,    setTargetOrgId]    = useState('')
  const [targetBand,     setTargetBand]     = useState(primaryAft?.aff.individualBand ?? primaryAft?.pos.band ?? 'B4')
  const [targetTitle,    setTargetTitle]    = useState(primaryAft?.aff.freeTitle ?? primaryAft?.pos.title ?? '担当')
  const [targetFreeTitle, setTargetFreeTitle] = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [memo,           setMemo]           = useState('')
  const [promotionSign,  setPromotionSign]  = useState(false)

  const currentBand = primaryAft?.aff.individualBand ?? primaryAft?.pos.band
  const orgs = afterOrganizations.filter(o =>
    o.companyId === companyId && o.parentId !== null && !o.isAbandoned
  )

  if (!companyId) {
    return (
      <div className="text-xs text-gray-400 italic text-center py-4">
        本務所属がないため異動先を選択できません
      </div>
    )
  }

  const handleSubmit = () => {
    const org = afterOrganizations.find(o => o.id === targetOrgId)
    onSubmit({
      kind: 'MoveToOrg',
      label: `分掌異動：${org?.name ?? ''}`,
      params: {
        personId: person.id, toOrgId: targetOrgId, companyId,
        band: targetBand, title: targetTitle,
        ...(targetFreeTitle && { freeTitle: targetFreeTitle }),
      },
      transferReason: transferReason || undefined,
      memo: memo || undefined,
      promotionSign: promotionSign || undefined,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FromCard title="現在（異動前）" items={primaryAft ? [primaryAft] : []} />
          <OrgSelect label="↓ 異動先組織" value={targetOrgId} onChange={setTargetOrgId} orgs={orgs} />
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
                  activeColor="border-blue-400 bg-blue-100 text-blue-700"
                  currentBand={currentBand}
                  bands={bands}
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
        promotionSign={promotionSign} onPromotionSign={setPromotionSign}
        transferReasons={transferReasons}
      />
      <FormFooter onCancel={onCancel} onSubmit={handleSubmit} disabled={!targetOrgId} />
    </div>
  )
}
