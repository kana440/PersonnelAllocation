import { useStore } from '../../store/useStore'
import { OrgCombobox } from '../common/OrgCombobox'

export function ScopeSelector() {
  const { afterOrganizations, scopeOrgId, setScopeOrgId } = useStore()

  return (
    <div className="flex items-center gap-2 min-w-0">
      <label className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">作業範囲</label>
      <OrgCombobox
        allOrgs={afterOrganizations}
        value={scopeOrgId}
        onChange={setScopeOrgId}
        placeholder="全件（全社）"
        allowClear
        className="w-48"
      />
    </div>
  )
}
