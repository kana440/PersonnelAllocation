import { useState } from 'react'
import { useStore } from '../../../store/useStore'
import { SummaryView } from './SummaryView'
import { OperationFormView } from './OperationFormView'
import type { PanelView } from './types'

interface Props {
  rowId: number
}

export function PersonOperationPanel({ rowId }: Props) {
  const { allocationList, enterEditMode } = useStore()
  const [view, setView] = useState<PanelView>('summary')

  const row = allocationList.find(r => r.rowId === rowId)
  if (!row) return <div className="p-4 text-xs text-gray-400">行が見つかりません</div>

  if (view === 'summary') {
    return (
      <SummaryView
        row={row}
        onSelect={setView}
        onDirectEdit={() => enterEditMode(rowId)}
      />
    )
  }

  return (
    <OperationFormView
      def={view.def}
      row={row}
      onBack={() => setView('summary')}
    />
  )
}
