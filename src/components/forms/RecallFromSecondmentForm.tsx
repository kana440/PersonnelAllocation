import { useState } from 'react'
import type { BaseFormProps } from './types'
import { CompanyBtn, FormFooter, FromCard, MetaSection } from './parts'

export function RecallFromSecondmentForm({
  person, afterDetails, activeCompanyIds, companies, onSubmit, onCancel,
}: BaseFormProps) {
  const [targetCompanyId, setTargetCompanyId] = useState('')
  const [transferReason,  setTransferReason]  = useState('')
  const [memo,            setMemo]            = useState('')

  const secondments = afterDetails.filter(d =>
    d.aff.employmentType === '出向' || d.aff.secondmentSourceCompanyId
  )
  const displayItems = secondments.length ? secondments : afterDetails.filter(d => d.aff.type === 'primary')

  const handleSubmit = () => {
    const cmp = companies.find(c => c.id === targetCompanyId)
    onSubmit({
      kind: 'RecallFromSecondment',
      label: `出向解除：${cmp?.name ?? ''}`,
      params: { personId: person.id, companyId: targetCompanyId },
      transferReason: transferReason || undefined,
      memo: memo || undefined,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <FromCard title="現在の出向先" items={displayItems} />
        </div>
        <div className="space-y-2">
          <div>
            <div className="text-gray-500 mb-1 text-xs">↙ 解除する出向先会社</div>
            <div className="flex flex-wrap gap-1">
              {activeCompanyIds.map(id => {
                const c = companies.find(x => x.id === id)
                if (!c) return null
                return (
                  <CompanyBtn
                    key={id} company={c}
                    selected={targetCompanyId === id}
                    onSelect={() => setTargetCompanyId(id)}
                    activeColor="border-red-400 bg-red-100 text-red-700"
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <MetaSection
        transferReason={transferReason} onTransferReason={setTransferReason}
        memo={memo} onMemo={setMemo}
        promotionSign={false} onPromotionSign={() => {}}
      />
      <FormFooter onCancel={onCancel} onSubmit={handleSubmit} disabled={!targetCompanyId} />
    </div>
  )
}
