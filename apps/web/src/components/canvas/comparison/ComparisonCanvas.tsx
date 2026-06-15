import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { PanelDef } from '../../../store/canvasLayoutStore'
import { ComparisonOrgPanel } from './ComparisonOrgPanel'

interface Props {
  comparisonPanels:     PanelDef[]
  comparisonOrgMapping: Record<string, string>
  afterOrgs:            Organization[]
  beforeOrgs:           Organization[]
  allocationList:       AllocationRow[]
  onRemovePanel:        (panelId: string) => void
  onRequestMap:         (beforeOrgId: string) => void
}

export function ComparisonCanvas({
  comparisonPanels,
  comparisonOrgMapping,
  afterOrgs,
  beforeOrgs,
  allocationList,
  onRemovePanel,
  onRequestMap,
}: Props) {
  if (comparisonPanels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        ← 左の「組織パネル」タブから旧組織をパネルに追加してください
      </div>
    )
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-auto p-3">
      <div className="flex gap-4 h-full items-start">
        {comparisonPanels.map(panel => (
          <ComparisonOrgPanel
            key={panel.id}
            beforeOrgId={panel.orgId}
            beforeOrgs={beforeOrgs}
            afterOrgs={afterOrgs}
            allocationList={allocationList}
            comparisonOrgMapping={comparisonOrgMapping}
            onRemove={() => onRemovePanel(panel.id)}
            onRequestMap={onRequestMap}
          />
        ))}
      </div>
    </div>
  )
}
