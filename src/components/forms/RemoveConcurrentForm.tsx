import { useState } from 'react'
import type { BaseFormProps } from './types'
import { FormFooter, MetaSection } from './parts'

export function RemoveConcurrentForm({
  person, concurrentAft, afterOrganizations, transferReasons, onSubmit, onCancel,
}: BaseFormProps) {
  const [targetOrgId,    setTargetOrgId]    = useState('')
  const [transferReason, setTransferReason] = useState('')
  const [memo,           setMemo]           = useState('')

  const handleSubmit = () => {
    const org = afterOrganizations.find(o => o.id === targetOrgId)
    onSubmit({
      kind: 'RemoveConcurrent',
      label: `兼務解除：${org?.name ?? ''}`,
      params: { personId: person.id, orgId: targetOrgId, companyId: org?.companyId ?? '' },
      transferReason: transferReason || undefined,
      memo: memo || undefined,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="text-xs text-gray-500">解除する兼務を選んでください</div>
          {concurrentAft.length === 0 ? (
            <div className="text-xs text-gray-400 italic pl-2">兼務はありません</div>
          ) : (
            <div className="space-y-1">
              {concurrentAft.map(d => (
                <button
                  key={d.aff.id}
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
                    {d.aff.concurrentReason && (
                      <span className="text-gray-400 ml-auto truncate">{d.aff.concurrentReason}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          {targetOrgId && (
            <div className="text-xs text-gray-500 italic pt-2 bg-orange-50 border border-orange-100 rounded px-2 py-1.5">
              解除後はこの兼務が終了します
            </div>
          )}
        </div>
      </div>
      <MetaSection
        transferReason={transferReason} onTransferReason={setTransferReason}
        memo={memo} onMemo={setMemo}
        promotionSign={false} onPromotionSign={() => {}}
        transferReasons={transferReasons}
      />
      <FormFooter onCancel={onCancel} onSubmit={handleSubmit} disabled={!targetOrgId} />
    </div>
  )
}
