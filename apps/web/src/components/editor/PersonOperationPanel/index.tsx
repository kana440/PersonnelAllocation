import { useState, useEffect } from 'react'
import { useStore } from '../../../store/useStore'
import { useUICommandStore } from '../../../store/uiCommandStore'
import { useFormStateStore } from '../../../store/formStateStore'
import { ALL_EDIT_OPERATIONS } from '@personnel/domain/commands/defs'
import { secondmentOutSFDef } from '@personnel/domain/commands/defs/secondmentMainDefs'
import { concurrentSecondmentOutNonSFDef } from '@personnel/domain/commands/defs/secondmentConcurrentDefs'
import { nonSFSecondmentOutDef } from '@personnel/domain/commands/defs/multiRowDefs'
import { SummaryView } from './SummaryView'
import { OperationFormView } from './OperationFormView'
import { DirectEditView } from './DirectEditView'
import { MultiRowFormView } from './MultiRowFormView'
import { SecondmentOutChooser }           from './SecondmentOutChooser'
import { ConcurrentSecondmentOutChooser } from './ConcurrentSecondmentOutChooser'
import type { PanelView } from './types'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Props {
  rowId: number
}

export function PersonOperationPanel({ rowId }: Props) {
  const { allocationList, operationPanelInitialView, masters } = useStore()
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
    if ('chooser' in view && view.chooser === 'secondmentOut') {
      return (
        <SecondmentOutChooser
          row={row}
          masters={masters}
          onSelectSF={(company) => {
            setPrefill({ secondmentToCompany: company as Partial<AllocationRow>['secondmentToCompany'] })
            setView({ def: secondmentOutSFDef, rowId })
          }}
          onSelectNonSF={(company) => {
            setView({
              multiRowDef:         nonSFSecondmentOutDef,
              rowId,
              overrideSectionVals: [{ secondmentToCompany: company }, {}],
            })
          }}
          onBack={handleBack}
        />
      )
    }
    if ('chooser' in view && view.chooser === 'concurrentSecondmentOut') {
      return (
        <ConcurrentSecondmentOutChooser
          row={row}
          masters={masters}
          onSelectNonSF={(company) => {
            setPrefill({ secondmentToCompany: company as Partial<AllocationRow>['secondmentToCompany'] })
            setView({ def: concurrentSecondmentOutNonSFDef, rowId })
          }}
          onBack={handleBack}
        />
      )
    }
    if ('multiRowDef' in view) {
      return (
        <MultiRowFormView
          def={view.multiRowDef}
          anchor={row}
          onBack={handleBack}
          overrideSectionVals={view.overrideSectionVals}
        />
      )
    }
    if ('def' in view) {
      return (
        <OperationFormView
          def={view.def}
          row={row}
          onBack={handleBack}
          overrideInitial={prefill ?? undefined}
        />
      )
    }
    return null
  }

  return (
    <SummaryView
      row={row}
      onSelect={setView}
    />
  )
}
