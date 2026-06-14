import type { EditOperation } from '@personnel/domain/commands/defs/index'

export type PanelView = 'summary' | { def: EditOperation; rowId: number }
