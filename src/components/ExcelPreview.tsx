import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { translateToExcel } from '../utils/translator'

export function ExcelPreview() {
  const store = useStore()
  const rows = useMemo(() => translateToExcel({
    persons: store.persons,
    companies: store.companies,
    organizations: store.organizations,
    beforeAffiliations: store.beforeAffiliations,
    beforePositions: store.beforePositions,
    afterAffiliations: store.afterAffiliations,
    afterPositions: store.afterPositions,
    effectiveDate: store.effectiveDate,
  }), [store.beforeAffiliations, store.beforePositions, store.afterAffiliations, store.afterPositions, store.effectiveDate])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-700 text-white">
            <th className="px-2 py-2 text-left whitespace-nowrap">社員名</th>
            <th className="px-2 py-2 text-left whitespace-nowrap">会社</th>
            <th className="px-2 py-2 text-left whitespace-nowrap">異動区分</th>
            <th className="px-2 py-2 text-left whitespace-nowrap">発令日</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-blue-900">Before 組織</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-blue-900">Before 役職</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-blue-900">Before Band</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-blue-900">Before 上司</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-green-900">After 組織</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-green-900">After 役職</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-green-900">After Band</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-green-900">After 上司</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-purple-900">SF Person ID</th>
            <th className="px-2 py-2 text-left whitespace-nowrap bg-purple-900">SF Position ID (After)</th>
            <th className="px-2 py-2 text-left whitespace-nowrap">備考</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={15} className="px-4 py-4 text-center text-gray-400">変更のある人員がいません</td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={row.rowId} className={`border-b border-gray-200 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
              <td className="px-2 py-1.5 font-medium whitespace-nowrap">{row.personName}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">
                {row.companyName}
                {!row.hasSF && <span className="ml-1 text-xs text-gray-400">(SF外)</span>}
              </td>
              <td className="px-2 py-1.5">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                  row.operationType === '変更なし'                                  ? 'bg-gray-100 text-gray-500' :
                  row.operationType === '出向開始'                                  ? 'bg-green-100 text-green-700' :
                  row.operationType === '出向解除'                                  ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {row.operationType}
                </span>
              </td>
              <td className="px-2 py-1.5 whitespace-nowrap">{row.effectiveDate}</td>
              <td className="px-2 py-1.5 bg-blue-50 whitespace-nowrap">{row.beforeOrgName ?? '—'}</td>
              <td className="px-2 py-1.5 bg-blue-50 whitespace-nowrap">{row.beforeTitle ?? '—'}</td>
              <td className="px-2 py-1.5 bg-blue-50 whitespace-nowrap">{row.beforeBand ?? '—'}</td>
              <td className="px-2 py-1.5 bg-blue-50 whitespace-nowrap">{row.beforeManagerName ?? '—'}</td>
              <td className="px-2 py-1.5 bg-green-50 whitespace-nowrap">{row.afterOrgName ?? '—'}</td>
              <td className="px-2 py-1.5 bg-green-50 whitespace-nowrap">{row.afterTitle ?? '—'}</td>
              <td className="px-2 py-1.5 bg-green-50 whitespace-nowrap">{row.afterBand ?? '—'}</td>
              <td className="px-2 py-1.5 bg-green-50 whitespace-nowrap">{row.afterManagerName ?? '—'}</td>
              <td className="px-2 py-1.5 bg-purple-50 whitespace-nowrap font-mono">{row.sfPersonId ?? '—'}</td>
              <td className="px-2 py-1.5 bg-purple-50 whitespace-nowrap font-mono">{row.afterPositionId ?? '(新規)'}</td>
              <td className="px-2 py-1.5 text-gray-400">{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
