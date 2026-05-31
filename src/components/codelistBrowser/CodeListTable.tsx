import { useState, useMemo } from 'react'
import { FIELD_LABELS } from './tableRegistry'

interface Props {
  data: Record<string, unknown>[]
}

type SortDir = 'asc' | 'desc'

function cellText(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (typeof v === 'boolean') return v ? '✓' : '—'
  return String(v)
}

function cellClass(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'text-green-700 font-medium' : 'text-gray-300'
  if (typeof v === 'number')  return 'tabular-nums text-right'
  return ''
}

export function CodeListTable({ data }: Props) {
  const [search,  setSearch]  = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const columns = useMemo(
    () => (data.length > 0 ? Object.keys(data[0]) : []),
    [data],
  )

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = q
      ? data.filter(row =>
          columns.some(c => {
            const v = row[c]
            return typeof v === 'string' && v.toLowerCase().includes(q)
          })
        )
      : data

    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        const cmp = String(av).localeCompare(String(bv), 'ja', { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return list
  }, [data, search, sortCol, sortDir, columns])

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-32 text-sm text-gray-400">データがありません</div>
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <input
          type="text"
          placeholder="検索…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-2 py-0.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <span className="text-[10px] text-gray-400 ml-auto">{filtered.length} / {data.length} 件</span>
        {search && (
          <button onClick={() => setSearch('')} className="text-[10px] text-gray-400 hover:text-gray-600">クリア</button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-100 z-10">
            <tr>
              {columns.map(col => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  className="px-2 py-1.5 text-left font-medium text-gray-600 border-b border-gray-200 whitespace-nowrap cursor-pointer hover:bg-gray-200 select-none"
                >
                  {FIELD_LABELS[col] ?? col}
                  {sortCol === col && <span className="ml-0.5 text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="hover:bg-blue-50 border-b border-gray-100">
                {columns.map(col => (
                  <td key={col} className={`px-2 py-1 whitespace-nowrap ${cellClass(row[col])}`}>
                    {cellText(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
