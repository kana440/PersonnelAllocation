import { useShallow } from 'zustand/react/shallow'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { OrgPanel } from './panel'

export function MultiOrgCanvas() {
  const { panels, removePanel } = useCanvasLayoutStore(useShallow(s => ({
    panels:      s.panels,
    removePanel: s.removePanel,
  })))

  if (panels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        ← 左サイドバーの「組織パネル」タブから組織を追加してください
      </div>
    )
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex gap-4 p-3 h-full items-start min-w-max">
        {panels.map((panel, i) => (
          <OrgPanel
            key={panel.id}
            orgId={panel.orgId}
            panelId={panel.id}
            colorIndex={i}
            onRemove={() => removePanel(panel.id)}
          />
        ))}
      </div>
    </div>
  )
}
