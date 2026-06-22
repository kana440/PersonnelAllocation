import type { EditOperation, OperationInput } from '@personnel/domain/commands/defs/types'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { DomainContext } from '@personnel/domain/commands/types'
import { bindOperation, isSectionDivider, isInputRow } from '@personnel/domain/commands/defs'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'

export interface SideEffectSummary {
  /** inputs 外フィールドが値→undefined になるもの（データ消失）のラベル一覧 */
  cleared: string[]
  /** inputs 外フィールドが値→別の値に変わるもの（自動導出）のラベル一覧 */
  changed: string[]
}

/**
 * apply() をドライランして、inputs 外フィールドへの副作用を検出する。
 * suppressSideEffectWarning が true のときは空を返す。
 */
export function computeSideEffects(
  def: EditOperation,
  row: AllocationRow,
  values: Partial<AllocationRow>,
  ctx: DomainContext,
): SideEffectSummary {
  if (def.suppressSideEffectWarning) return { cleared: [], changed: [] }

  try {
    const cmd = bindOperation(def, row.rowId, values)
    const result = cmd.apply(ctx)
    const afterRow = result.updatedList.find(r => r.rowId === row.rowId)
    if (!afterRow) return { cleared: [], changed: [] }

    const inputFields = new Set(def.inputs.flatMap(i => {
      if (isSectionDivider(i)) return []
      if (isInputRow(i)) return i.inputs.map(inp => inp.field as string)
      return [(i as OperationInput).field as string]
    }))
    const cleared: string[] = []
    const changed: string[] = []

    for (const [key, meta] of Object.entries(ALLOCATION_LIST_LABEL_MAP)) {
      if (!meta.ja) continue
      if (inputFields.has(key)) continue

      const before = (row as Record<string, unknown>)[key]
      const after  = (afterRow as Record<string, unknown>)[key]
      if (before === after) continue

      const hadValue = before !== undefined && before !== ''
      const nowEmpty = after === undefined || after === ''

      if (hadValue && nowEmpty) {
        cleared.push(meta.ja)
      } else if (after !== undefined && after !== '') {
        changed.push(meta.ja)
      }
    }

    return { cleared, changed }
  } catch {
    return { cleared: [], changed: [] }
  }
}

export function hasSideEffects(summary: SideEffectSummary): boolean {
  return summary.cleared.length > 0 || summary.changed.length > 0
}
