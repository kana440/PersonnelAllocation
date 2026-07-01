import { useMemo }        from 'react'
import type { Organization } from '@personnel/domain/schemas'
import { useStore }        from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { OrgTreePicker }   from '../OrgTreePicker'
import { collectTopLevelRelevantOrgIds } from '@personnel/domain/choices/relevantOrgs'

interface Props {
  open:     boolean
  onClose:  () => void
  onSelect: (orgId: string) => void
  title?:         string
  confirmLabel?:  string
  /** 渡した場合はこちらを優先して使う（比較モードで before-org 一覧を渡す用途） */
  orgs?:            Organization[]
  /** 渡した場合はこちらを優先して使う（比較モードで追加済み ID を渡す用途） */
  alreadyAddedIds?: Set<string>
}

export function OrgPickerModal({ open, onClose, onSelect, title = '組織を選択', confirmLabel, orgs, alreadyAddedIds }: Props) {
  const { allocationList, afterOrganizations } = useStore()
  const { panels } = useCanvasLayoutStore()

  const defaultRelevantOrgIds = useMemo(
    () => collectTopLevelRelevantOrgIds(allocationList, afterOrganizations),
    [allocationList, afterOrganizations],
  )

  const defaultAlreadyAddedOrgIds = useMemo(
    () => new Set(panels.map(p => p.orgId)),
    [panels],
  )

  if (!open) return null

  const displayOrgs      = orgs ?? afterOrganizations
  const addedIds         = alreadyAddedIds ?? defaultAlreadyAddedOrgIds
  // orgs を外部から渡した場合は relevantOrgIds によるフィルタは使わない
  const relevantOrgIds   = orgs ? undefined : defaultRelevantOrgIds

  const handleSelect = (orgId: string) => { onSelect(orgId); onClose() }

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-xl flex flex-col overflow-hidden"
        style={{ width: 440, height: '72vh' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-base leading-none">✕</button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <OrgTreePicker
            allOrgs={displayOrgs}
            allocationList={allocationList}
            onSelect={handleSelect}
            relevantOrgIds={relevantOrgIds}
            alreadyAddedOrgIds={addedIds}
            confirmLabel={confirmLabel}
          />
        </div>
      </div>
    </div>
  )
}
