import { useState, useCallback, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { buildOrgMatchIndex, orgMatchIndexToMapping } from '../../domain/review/orgMatching'
import { getDescendantOrgIds } from '../../domain/orgScope'
import { OrgSelectStep } from '../setup/OrgSelectStep'
import { MappingStep } from '../review/components/org-comparison/MappingStep'
import type { OrgMapping } from '../review/components/org-comparison/types'
import { EMPTY_CODE_LISTS } from '../../domain/codeLists/aggregate'

type Phase =
  | { kind: 'org-select' }
  | { kind: 'org-mapping'; beforeOrgId: string; beforeOrgName: string; mapping: OrgMapping }

interface Props {
  onClose: () => void
}

export function ScopeMappingDialog({ onClose }: Props) {
  const {
    beforeOrganizations,
    afterOrganizations,
    allocationList,
    codeLists,
    setScopeWithMapping,
  } = useStore()

  const [phase, setPhase] = useState<Phase>({ kind: 'org-select' })

  // Construct a minimal ImportedWorkbookResult shape for OrgSelectStep
  const fakeResult = useMemo(() => ({
    beforeOrganizations,
    afterOrganizations,
    allocationList,
    codeLists: codeLists ?? EMPTY_CODE_LISTS,
    sheetsFound: [],
    sheetsMissing: [],
    orgEntries: [],
    allocationRowCount: allocationList.length,
  }), [beforeOrganizations, afterOrganizations, allocationList, codeLists])

  const handleSelectAll = useCallback(() => {
    const index   = buildOrgMatchIndex(allocationList, beforeOrganizations, afterOrganizations)
    const mapping = orgMatchIndexToMapping(index)
    setScopeWithMapping({ beforeOrgId: null, mapping })
    onClose()
  }, [allocationList, beforeOrganizations, afterOrganizations, setScopeWithMapping, onClose])

  const handleSelectOrg = useCallback((id: string, name: string) => {
    const scopeIds    = getDescendantOrgIds(id, beforeOrganizations)
    const scopeBefore = beforeOrganizations.filter(o => scopeIds.has(o.id))
    const index   = buildOrgMatchIndex(allocationList, scopeBefore, afterOrganizations)
    const mapping = orgMatchIndexToMapping(index)
    setPhase({ kind: 'org-mapping', beforeOrgId: id, beforeOrgName: name, mapping })
  }, [allocationList, beforeOrganizations, afterOrganizations])

  const handleMappingConfirm = useCallback(() => {
    if (phase.kind !== 'org-mapping') return
    setScopeWithMapping({ beforeOrgId: phase.beforeOrgId, mapping: phase.mapping })
    onClose()
  }, [phase, setScopeWithMapping, onClose])

  const handleMappingSetEntry = useCallback((oldId: string, newIds: string[]) => {
    if (phase.kind !== 'org-mapping') return
    setPhase({ ...phase, mapping: new Map([...phase.mapping, [oldId, newIds]]) })
  }, [phase])

  const handleMappingRemoveEntry = useCallback((oldId: string) => {
    if (phase.kind !== 'org-mapping') return
    const next = new Map(phase.mapping)
    next.delete(oldId)
    setPhase({ ...phase, mapping: next })
  }, [phase])

  const handleMappingAutoGenerate = useCallback((orgIds: string[]) => {
    if (phase.kind !== 'org-mapping') return
    const { mapping } = phase
    const index = buildOrgMatchIndex(allocationList, beforeOrganizations, afterOrganizations)
    const next  = new Map(mapping)
    for (const orgId of orgIds) {
      const match = index.get(orgId)
      next.set(orgId, match?.afterOrg ? [match.afterOrg.id] : [])
    }
    setPhase({ ...phase, mapping: next })
  }, [phase, allocationList, beforeOrganizations, afterOrganizations])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className={`bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden ${
          phase.kind === 'org-mapping'
            ? 'w-full max-w-4xl h-[80vh]'
            : 'w-full max-w-lg'
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-800">スコープ・マッピング変更</h2>
            {phase.kind === 'org-select' && (
              <p className="text-xs text-gray-500 mt-0.5">担当する旧組織を選択してください。</p>
            )}
            {phase.kind === 'org-mapping' && (
              <p className="text-xs text-gray-500 mt-0.5">旧組織と新組織の対応を確認・調整してください。</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          >×</button>
        </div>

        {/* Body */}
        <div className={`${phase.kind === 'org-mapping' ? 'flex-1 overflow-hidden min-h-0' : 'p-5'}`}>
          {phase.kind === 'org-select' && (
            <OrgSelectStep
              result={fakeResult}
              onSelectAll={handleSelectAll}
              onSelectOrg={handleSelectOrg}
              hideDetails
            />
          )}
          {phase.kind === 'org-mapping' && (
            <MappingStep
              mapping={phase.mapping}
              beforeOrgs={beforeOrganizations.filter(o =>
                getDescendantOrgIds(phase.beforeOrgId, beforeOrganizations).has(o.id)
              )}
              afterOrgs={afterOrganizations}
              onSetMapping={handleMappingSetEntry}
              onRemoveMapping={handleMappingRemoveEntry}
              onAutoGenerate={handleMappingAutoGenerate}
              onNext={handleMappingConfirm}
              nextLabel="確定して適用 →"
              initialSelectedOrgId={phase.beforeOrgId}
              onBack={() => setPhase({ kind: 'org-select' })}
            />
          )}
        </div>
      </div>
    </div>
  )
}
