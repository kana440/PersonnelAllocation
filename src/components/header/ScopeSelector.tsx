import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { ScopeMappingDialog } from './ScopeMappingDialog'

export function ScopeSelector() {
  const { beforeScopeOrgId, beforeOrganizations } = useStore()
  const [dialogOpen, setDialogOpen] = useState(false)

  const scopeName = beforeScopeOrgId
    ? (beforeOrganizations.find(o => o.id === beforeScopeOrgId)?.name ?? '—')
    : '全組織'

  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <label className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">スコープ組織</label>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-700 text-gray-200 text-xs hover:bg-gray-600 transition-colors max-w-[180px]"
          title="スコープ・組織マッピングを変更"
        >
          <span className="truncate">{scopeName}</span>
          <span className="flex-shrink-0 text-gray-400 text-[10px]">✎</span>
        </button>
      </div>
      {dialogOpen && <ScopeMappingDialog onClose={() => setDialogOpen(false)} />}
    </>
  )
}
