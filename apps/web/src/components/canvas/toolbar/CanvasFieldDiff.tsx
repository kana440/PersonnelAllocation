import { FIELD_METADATA } from '@personnel/domain/allocationRow'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { CANVAS_DISPLAYABLE_FIELDS } from '../../../store/canvasDisplayStore'

// afterKey → prevKey lookup, built once at module load
const PREV_KEY_MAP = new Map<string, string>(
  FIELD_METADATA.map(f => [f.after as string, f.before as string])
)

interface Props {
  row:           AllocationRow
  displayFields: string[]
  isConcurrent:  boolean
}

export function CanvasFieldDiff({ row, displayFields, isConcurrent }: Props) {
  if (displayFields.length === 0) return null
  const r = row as Record<string, unknown>

  return (
    <>
      {displayFields.map(key => {
        const afterStr = String(r[key] ?? '')
        const prevKey  = PREV_KEY_MAP.get(key)
        const prevStr  = prevKey ? String(r[prevKey] ?? '') : afterStr
        const hasChange = afterStr !== prevStr
        const isEmpty   = !afterStr && !prevStr

        const label = CANVAS_DISPLAYABLE_FIELDS.find(f => f.key === key)?.label ?? key

        return (
          <div key={key} className="text-[9px] leading-tight">
            <span className={hasChange ? 'text-blue-400' : 'text-gray-300'}>{label}: </span>
            {isEmpty ? (
              <span className="text-gray-200">—</span>
            ) : hasChange ? (
              <>
                <span className="text-blue-600 font-medium">{afterStr || '—'}</span>
                {prevStr && (
                  <>
                    <span className="text-gray-300 mx-0.5">←</span>
                    <span className="text-gray-400 line-through">{prevStr}</span>
                  </>
                )}
              </>
            ) : (
              <span className={isConcurrent ? 'text-purple-400' : 'text-gray-400'}>{afterStr}</span>
            )}
          </div>
        )
      })}
    </>
  )
}
