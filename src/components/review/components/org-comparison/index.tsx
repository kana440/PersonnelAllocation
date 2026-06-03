import { useState, useCallback } from 'react'
import { useStore } from '../../../../store/useStore'
import type { OrgMatch } from '../../../../domain/patterns/orgMatching'
import { MappingStep } from './MappingStep'
import { PreviewStep } from './PreviewStep'
import type { OrgMapping } from './types'

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${
          step >= 1 ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-400'
        }`}>1</span>
        <span className={`text-xs font-semibold transition-colors ${step === 1 ? 'text-blue-700' : 'text-gray-400'}`}>
          マッピング定義
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <div className={`w-4 h-0.5 rounded transition-colors ${step >= 2 ? 'bg-blue-400' : 'bg-gray-200'}`} />
        <div className={`w-4 h-0.5 rounded transition-colors ${step >= 2 ? 'bg-blue-400' : 'bg-gray-200'}`} />
        <div className={`w-4 h-0.5 rounded transition-colors ${step >= 2 ? 'bg-blue-400' : 'bg-gray-200'}`} />
      </div>
      <div className="flex items-center gap-2">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-colors ${
          step >= 2 ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-gray-400'
        }`}>2</span>
        <span className={`text-xs font-semibold transition-colors ${step === 2 ? 'text-blue-700' : 'text-gray-400'}`}>
          比較プレビュー
        </span>
      </div>
    </div>
  )
}

// ── OrgComparison ─────────────────────────────────────────────────────────────

interface Props {
  orgMatches: Map<string, OrgMatch>
}

export function OrgComparison({ orgMatches }: Props) {
  const { allocationList, beforeOrganizations, afterOrganizations, orgMapping, setOrgMapping: storeSetOrgMapping } = useStore()

  const [step, setStep] = useState<1 | 2>(1)

  const mapping: OrgMapping = orgMapping

  const setOrgMapping = useCallback((oldOrgId: string, newOrgIds: string[]) => {
    storeSetOrgMapping(new Map([...orgMapping, [oldOrgId, newOrgIds]]))
  }, [orgMapping, storeSetOrgMapping])

  const removeOrgMapping = useCallback((oldOrgId: string) => {
    const next = new Map(orgMapping)
    next.delete(oldOrgId)
    storeSetOrgMapping(next)
  }, [orgMapping, storeSetOrgMapping])

  const autoGenerate = useCallback((orgIds: string[]) => {
    const next = new Map(orgMapping)
    for (const orgId of orgIds) {
      const match = orgMatches.get(orgId)
      next.set(orgId, match?.afterOrg ? [match.afterOrg.id] : [])
    }
    storeSetOrgMapping(next)
  }, [orgMapping, orgMatches, storeSetOrgMapping])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Stepper step={step} />

      {step === 1 ? (
        <MappingStep
          mapping={mapping}
          beforeOrgs={beforeOrganizations}
          afterOrgs={afterOrganizations}
          onSetMapping={setOrgMapping}
          onRemoveMapping={removeOrgMapping}
          onAutoGenerate={autoGenerate}
          onNext={() => setStep(2)}
        />
      ) : (
        <PreviewStep
          mapping={mapping}
          beforeOrgs={beforeOrganizations}
          afterOrgs={afterOrganizations}
          allocationList={allocationList}
          onBack={() => setStep(1)}
        />
      )}
    </div>
  )
}
