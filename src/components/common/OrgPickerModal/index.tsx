import { useMemo }        from 'react'
import { useStore }        from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'
import { OrgTreePicker }   from '../OrgTreePicker'
import { collectTopLevelRelevantOrgIds } from '../../../domain/orgPicker/relevantOrgs'

interface Props {
  open:     boolean
  onClose:  () => void
  onSelect: (orgId: string) => void
  title?:   string
}

export function OrgPickerModal({ open, onClose, onSelect, title = '組織を選択' }: Props) {
  const { allocationList, afterOrganizations } = useStore()
  const { panels } = useCanvasLayoutStore()

  const relevantOrgIds = useMemo(
    () => collectTopLevelRelevantOrgIds(allocationList, afterOrganizations),
    [allocationList, afterOrganizations],
  )

  // すでにパネルに登録済みの org ID セット
  const alreadyAddedOrgIds = useMemo(
    () => new Set(panels.map(p => p.orgId)),
    [panels],
  )

  if (!open) return null

  const handleSelect = (orgId: string) => { onSelect(orgId); onClose() }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl flex flex-col overflow-hidden"
        style={{ width: 440, height: '72vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-base leading-none">✕</button>
        </div>
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <OrgTreePicker
            allOrgs={afterOrganizations}
            allocationList={allocationList}
            onSelect={handleSelect}
            relevantOrgIds={relevantOrgIds}
            alreadyAddedOrgIds={alreadyAddedOrgIds}
          />
        </div>
      </div>
    </div>
  )
}
