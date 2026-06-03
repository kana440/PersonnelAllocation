import type { OperationDef } from '../../../domain/commands/defs/index'

export type PanelView = 'summary' | { def: OperationDef; rowId: number }
