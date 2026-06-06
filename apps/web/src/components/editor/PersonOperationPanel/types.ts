import type { OperationDef } from '@personnel/domain/commands/defs/index'

export type PanelView = 'summary' | { def: OperationDef; rowId: number }
