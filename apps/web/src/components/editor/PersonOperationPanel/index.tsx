import { useState } from 'react'
import { useStore } from '../../../store/useStore'
import { SummaryView } from './SummaryView'
import { OperationFormView } from './OperationFormView'
import { DirectEditView } from './DirectEditView'
import { MultiRowFormView } from './MultiRowFormView'
import type { PanelView } from './types'

interface Props {
  rowId: number
}

export function PersonOperationPanel({ rowId }: Props) {
  const { allocationList, operationPanelInitialView } = useStore()
  const [view, setView] = useState<PanelView>(() =>
    operationPanelInitialView === 'directEdit' ? 'directEdit' : 'summary'
  )

  const row = allocationList.find(r => r.rowId === rowId)
  if (!row) return <div className="p-4 text-xs text-gray-400">行が見つかりません</div>

  if (view === 'directEdit') {
    return <DirectEditView row={row} onBack={() => setView('summary')} />
  }

  if (view !== 'summary') {
    if ('multiRowDef' in view) {
      return <MultiRowFormView def={view.multiRowDef} anchor={row} onBack={() => setView('summary')} />
    }
    return (
      <OperationFormView
        def={view.def}
        row={row}
        onBack={() => setView('summary')}
      />
    )
  }

  return (
    <SummaryView
      row={row}
      onSelect={setView}
    />
  )
}
