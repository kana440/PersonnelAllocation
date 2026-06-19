import { createPortal } from 'react-dom'
import type { EditOperation } from '@personnel/domain/commands/defs/index'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { OperationFormView } from '../editor/PersonOperationPanel/OperationFormView'

interface Props {
  def:             EditOperation
  row:             AllocationRow
  overrideInitial?: Partial<AllocationRow>
  onClose:         () => void
}

export function DropOperationModal({ def, row, overrideInitial, onClose }: Props) {
  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/30 flex items-center justify-center select-text"
      onClick={onClose}
      onMouseDown={e => e.stopPropagation()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[520px] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <OperationFormView
          def={def}
          row={row}
          overrideInitial={overrideInitial}
          onBack={onClose}
        />
      </div>
    </div>,
    document.body,
  )
}
