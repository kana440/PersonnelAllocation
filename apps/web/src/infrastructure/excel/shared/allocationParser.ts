// 要員配置リストシートを unknown[][] から解析する純粋関数（ライブラリ非依存）

import { ALLOCATION_LIST_FIELDS }                     from '@personnel/domain/csvImport/allocationList/labels'
import { AllocationListSchema }                       from '@personnel/domain/csvImport/allocationList/schema'
import type { AllocationList }                        from '@personnel/domain/csvImport/allocationList/schema'

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

export function parseAllocationSheet(raw: unknown[][]): AllocationList[] {
  const headerIdx = findHeaderRowIndex(raw)
  console.group('[parseAllocationSheet]')
  console.log('total rows in sheet:', raw.length)
  console.log('header row index:', headerIdx)

  if (headerIdx < 0) {
    console.warn('header row not found')
    console.groupEnd()
    return []
  }

  const headers = (raw[headerIdx] as unknown[]).map(c => typeof c === 'string' ? c.trim() : '')

  // A列（index 0）がヘッダーなし or 未知の場合、担当者列（assignee）として扱う
  const assigneeColIdx = !headerToKey.has(headers[0]) ? 0 : -1

  console.log('mapped headers:', headers.filter(h => headerToKey.has(h)).length)
  console.log('unmapped headers (first 10):', headers.filter(h => h && !headerToKey.has(h)).slice(0, 10))
  console.log('assignee column index:', assigneeColIdx)

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

    if (i === headerIdx + 1) {
      console.log('first data row (parsed keys):', Object.keys(entry))
    }

    if (!entry.no) continue
    rows.push(AllocationListSchema.parse(entry))
  }
  console.log('parsed rows:', rows.length)
  console.groupEnd()
  return rows
}
