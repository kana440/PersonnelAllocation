import { useState } from 'react'
import type { BaseFormProps } from './types'
import { BAND_GRADE, BandSelector, CompanyBtn, FormFooter, MetaSection } from './parts'

export function PromoteForm({
  person, afterDetails, activeCompanyIds, companies, onSubmit, onCancel,
}: BaseFormProps) {
  const [targetCompanyId, setTargetCompanyId] = useState('')
  const [targetBand,      setTargetBand]      = useState('B4')
  const [memo,            setMemo]            = useState('')
  const [promotionSign,   setPromotionSign]   = useState(true)
  const [transferReason,  setTransferReason]  = useState('')

  const currD    = afterDetails.find(d => d.company.id === targetCompanyId && d.aff.type === 'primary')
  const currBand = currD ? (currD.aff.individualBand ?? currD.pos.band) : undefined

  const handleSubmit = () => {
    const cmp = companies.find(c => c.id === targetCompanyId)
    onSubmit({
      kind: 'Promote',
      label: `昇降格：${cmp?.name ?? ''} → ${targetBand}`,
      params: { personId: person.id, companyId: targetCompanyId, band: targetBand },
      transferReason: transferReason || undefined,
      memo: memo || undefined,
      promotionSign: promotionSign || undefined,
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div>
            <div className="text-gray-500 mb-1 text-xs">対象会社</div>
            <div className="flex flex-wrap gap-1">
              {companies.filter(c => activeCompanyIds.includes(c.id)).map(c => (
                <CompanyBtn
                  key={c.id} company={c}
                  selected={targetCompanyId === c.id}
                  onSelect={() => setTargetCompanyId(c.id)}
                  activeColor="border-yellow-400 bg-yellow-100 text-yellow-700"
                />
              ))}
            </div>
          </div>
          {targetCompanyId && currD && (
            <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs flex items-center gap-2 flex-wrap">
              <span className="text-gray-400">現在:</span>
              <span className="font-mono font-semibold text-gray-700">{currBand}</span>
              {currD.aff.salaryGrade && (
                <span className="text-gray-500">({currD.aff.salaryGrade})</span>
              )}
              <span className="text-gray-300">→</span>
              {targetBand !== currBand ? (
                <>
                  <span className={`font-mono font-semibold ${
                    targetBand > (currBand ?? '') ? 'text-green-600' : 'text-red-600'
                  }`}>{targetBand}</span>
                  <span className="text-gray-500">({BAND_GRADE[targetBand] ?? ''})</span>
                </>
              ) : (
                <span className="text-gray-400 italic">変更なし</span>
              )}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {targetCompanyId && (
            <>
              <div>
                <div className="text-gray-500 mb-1 text-xs">昇降格後バンド</div>
                <BandSelector
                  value={targetBand} onChange={setTargetBand}
                  activeColor="border-yellow-400 bg-yellow-100 text-yellow-700"
                  currentBand={currBand}
                />
              </div>
              {targetBand < (currBand ?? 'B8') && (
                <div>
                  <div className="text-gray-500 mb-1 text-xs">降格理由</div>
                  <input
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                    placeholder="降格理由を入力..."
                    className="w-full border border-red-200 rounded px-2 py-1 text-xs"
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <MetaSection
        transferReason={transferReason} onTransferReason={setTransferReason}
        memo={memo} onMemo={setMemo}
        promotionSign={promotionSign} onPromotionSign={setPromotionSign}
      />
      <FormFooter
        onCancel={onCancel} onSubmit={handleSubmit}
        disabled={!targetCompanyId || !targetBand}
      />
    </div>
  )
}
