// 要員配置リストシートを unknown[][] から解析する純粋関数（ライブラリ非依存）

import { ALLOCATION_LIST_FIELDS }                     from '@personnel/domain/csvImport/allocationList/labels'
import { AllocationListSchema }                       from '@personnel/domain/csvImport/allocationList/schema'
import type { AllocationList }                        from '@personnel/domain/csvImport/allocationList/schema'
import type { ColumnWarning }                         from '../types'

const headerToKey = new Map<string, keyof AllocationList>(
  ALLOCATION_LIST_FIELDS.flatMap(f => {
    const key    = f.key as keyof AllocationList
    const header = f.header ?? f.key
    return [[header, key], [header.trim(), key]]
  })
)

export function findHeaderRowIndex(raw: unknown[][]): number {
  const headerSet = new Set(ALLOCATION_LIST_FIELDS.map(f => (f.header ?? f.key).trim()))
  let bestIdx = -1, bestScore = 1
  const limit = Math.min(10, raw.length)
  for (let i = 0; i < limit; i++) {
    const row = raw[i]
    if (!Array.isArray(row)) continue
    const score = (row as unknown[]).filter(c => typeof c === 'string' && headerSet.has((c as string).trim())).length
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}

export interface ParseAllocationSheetResult {
  rows:           AllocationList[]
  columnWarnings: ColumnWarning[]
}

export function parseAllocationSheet(raw: unknown[][]): ParseAllocationSheetResult {
  const SHEET = '要員配置リスト'
  const columnWarnings: ColumnWarning[] = []
  const headerIdx = findHeaderRowIndex(raw)

  if (headerIdx < 0) {
    return { rows: [], columnWarnings: [{ sheet: SHEET, message: 'ヘッダー行が見つかりません。列のマッピングができませんでした。' }] }
  }

  const headers = (raw[headerIdx] as unknown[]).map(c => typeof c === 'string' ? c.trim() : '')

  // A列（index 0）がヘッダーなし or 未知の場合、担当者列（assignee）として扱う
  const assigneeColIdx = !headerToKey.has(headers[0]) ? 0 : -1

  const unmapped = headers.filter(h => h && !headerToKey.has(h) && h !== headers[0])
  if (unmapped.length > 0) {
    columnWarnings.push({ sheet: SHEET, message: `認識できない列があります: ${unmapped.slice(0, 5).join(', ')}${unmapped.length > 5 ? ` 他${unmapped.length - 5}列` : ''}` })
  }

  const rows: AllocationList[] = []
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const dataRow = raw[i] as unknown[]
    if (dataRow.every(c => c === '' || c == null)) continue

    const entry: Record<string, string> = {}
    headers.forEach((header, idx) => {
      const key = headerToKey.get(header)
      if (!key) return
      const val = dataRow[idx]
      if (val !== '' && val != null) entry[key] = String(val)
    })

    // A列（担当者）を読み取る
    if (assigneeColIdx >= 0) {
      const val = dataRow[assigneeColIdx]
      if (val !== '' && val != null) entry['assignee'] = String(val)
    }

    if (!entry.no) continue
    rows.push(AllocationListSchema.parse(entry))
  }
  return { rows, columnWarnings }
}
