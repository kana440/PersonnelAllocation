import { useState, useEffect } from 'react'
import { useStore } from '../../../store/useStore'
import { useUICommandStore } from '../../../store/uiCommandStore'
import { useFormStateStore } from '../../../store/formStateStore'
import { ALL_EDIT_OPERATIONS } from '@personnel/domain/commands/defs'
import { SummaryView } from './SummaryView'
import { OperationFormView } from './OperationFormView'
import { DirectEditView } from './DirectEditView'
import { MultiRowFormView } from './MultiRowFormView'
import type { PanelView } from './types'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Props {
  rowId: number
}

export function PersonOperationPanel({ rowId }: Props) {
  const { allocationList, operationPanelInitialView } = useStore()
  const [view,    setView]    = useState<PanelView>(() =>
    operationPanelInitialView === 'directEdit' ? 'directEdit' : 'summary'
  )
  const [prefill, setPrefill] = useState<Partial<AllocationRow> | null>(null)

  const command      = useUICommandStore(s => s.command)
  const clearCommand = useUICommandStore(s => s.clear)
  const clearForm    = useFormStateStore(s => s.clear)

  // AI からの openOperation コマンドを受け取り、該当フォームを開く
  useEffect(() => {
    if (command?.type !== 'openOperation' || command.rowId !== rowId) return
    const def = ALL_EDIT_OPERATIONS.find(d => d.id === command.operationId)
    if (!def) { clearCommand(); return }
    setPrefill(command.prefill as Partial<AllocationRow> ?? null)
    setView({ def, rowId })
    clearCommand()
  }, [command, rowId, clearCommand])

  const row = allocationList.find(r => r.rowId === rowId)
  if (!row) return <div className="p-4 text-xs text-gray-400">行が見つかりません</div>

  const handleBack = () => {
    setView('summary')
    setPrefill(null)
    clearForm()
  }

  if (view === 'directEdit') {
    return <DirectEditView row={row} onBack={handleBack} />
  }

  if (view !== 'summary') {
    if ('multiRowDef' in view) {
      return <MultiRowFormView def={view.multiRowDef} anchor={row} onBack={handleBack} />
    }
    return (
      <OperationFormView
        def={view.def}
        row={row}
        onBack={handleBack}
        overrideInitial={prefill ?? undefined}
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
