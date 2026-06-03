import type { OperationDef } from '../../../domain/operationDefs'

export type PanelView = 'summary' | { def: OperationDef; rowId: number }
