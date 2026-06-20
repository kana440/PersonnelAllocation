import type { EditOperation }       from '@personnel/domain/commands/defs/index'
import type { MultiRowOperationDef } from '@personnel/domain/commands/defs/index'

export type PanelView =
  | 'summary'
  | 'directEdit'
  | { def:          EditOperation;       rowId: number }
  | { multiRowDef:  MultiRowOperationDef; rowId: number }
