import { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { translateToExcel } from '../utils/translator'
import type { PositionSnapshot } from '../types/domain'

// ── snapshot field definitions (After/Before共通) ────────────
const SNAPSHOT_FIELDS: { key: keyof PositionSnapshot; label: string; boolean?: boolean }[] = [
  { key: 'employmentType',              label: '雇用タイプ' },
  { key: 'concurrentType',              label: '本務兼務区分' },
  { key: 'concurrentReason',            label: '兼務理由' },
  { key: 'secondmentSourceCompany',     label: '出向元会社' },
  { key: 'secondmentSourceEmployeeId',  label: '出向元社員番号' },
  { key: 'isOnLeave',                   label: '休職者サイン',    boolean: true },
  { key: 'positionCode',                label: 'ポジションコード' },
  { key: 'orgCode',                     label: '組織コード' },
  { key: 'jobTitle',                    label: '役職' },
  { key: 'freeTitle',                   label: 'フリータイトル' },
  { key: 'secondmentDestCompany',       label: '出向先会社' },
  { key: 'workLocation',                label: '勤務場所' },
  { key: 'costCenter',                  label: 'コストセンター' },
  { key: 'managerPositionCode',         label: '上司ポジションコード' },
  { key: 'managerName',                 label: '上司氏名' },
  { key: 'jobFamily',                   label: 'ジョブファミリー' },
  { key: 'jobType',                     label: 'ジョブタイプ' },
  { key: 'positionBand',                label: 'ポジションのバンド' },
  { key: 'individualBand',              label: 'バンド' },
  { key: 'salaryGrade',                 label: '給与等級' },
  { key: 'isTrainingPosition',          label: '業務研修PF',       boolean: true },
  { key: 'isNonUnionAgreement',         label: '非組合協定対象',   boolean: true },
  { key: 'isUnionPosition',             label: 'PF組合員FG',       boolean: true },
  { key: 'isUnionMember',               label: '組合員',           boolean: true },
  { key: 'isDiscretionaryLaborPosition',label: 'PF裁量労働FG',     boolean: true },
  { key: 'isDiscretionaryLabor',        label: '裁量労働対象',     boolean: true },
]

function SnapCell({ snap, field, bg }: { snap: PositionSnapshot | null; field: keyof PositionSnapshot; bg: string }) {
  const cls = `px-2 py-1.5 whitespace-nowrap text-xs ${bg}`
  if (!snap) return <td className={`${cls} text-gray-300`}>—</td>
  const val = snap[field]
  if (val === undefined || val === null) return <td className={cls}>—</td>
  if (typeof val === 'boolean') return <td className={cls}>{val ? '○' : ''}</td>
  return <td className={cls}>{String(val)}</td>
}

export function ExcelPreview() {
  const store = useStore()
  // Use afterOrganizations so new orgs created by CreateOrg are included
  const allOrgs = [...store.organizations, ...store.afterOrganizations.filter(o => !store.organizations.find(b => b.id === o.id))]
  const rows = useMemo(() => translateToExcel({
    persons:           store.persons,
    companies:         store.companies,
    organizations:     allOrgs,
    operations:        store.operations,
    beforeAffiliations: store.beforeAffiliations,
    beforePositions:   store.beforePositions,
    afterAffiliations: store.afterAffiliations,
    afterPositions:    store.afterPositions,
    effectiveDate:     store.effectiveDate,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [store.beforeAffiliations, store.beforePositions, store.afterAffiliations, store.afterPositions, store.effectiveDate, store.operations, store.afterOrganizations])

  const thPerson = 'px-2 py-2 text-left whitespace-nowrap bg-gray-700 text-white'
  const thChange = 'px-2 py-2 text-left whitespace-nowrap bg-orange-800 text-white'
  const thAfter  = 'px-2 py-2 text-left whitespace-nowrap bg-green-900 text-white'
  const thBefore = 'px-2 py-2 text-left whitespace-nowrap bg-blue-900 text-white'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          {/* Group header row */}
          <tr>
            <th colSpan={6} className="px-2 py-1 text-center bg-gray-600 text-white border-r border-gray-500 text-xs font-bold">本人情報 / 変更区分</th>
            <th colSpan={SNAPSHOT_FIELDS.length} className="px-2 py-1 text-center bg-green-800 text-white border-r border-green-700 text-xs font-bold">After（発令後）</th>
            <th colSpan={SNAPSHOT_FIELDS.length} className="px-2 py-1 text-center bg-blue-800 text-white text-xs font-bold">Before（発令前）</th>
          </tr>
          {/* Column names */}
          <tr>
            {/* 本人情報 */}
            <th className={thPerson}>社員ID</th>
            <th className={thPerson}>姓</th>
            <th className={thPerson}>名</th>
            {/* 変更区分 */}
            <th className={thChange}>申請区分</th>
            <th className={thChange}>メモ</th>
            <th className={thChange}>昇降格</th>
            {/* After */}
            {SNAPSHOT_FIELDS.map(f => (
              <th key={`a_${f.key}`} className={thAfter}>{f.label}</th>
            ))}
            {/* Before */}
            {SNAPSHOT_FIELDS.map(f => (
              <th key={`b_${f.key}`} className={thBefore}>{f.label}</th>
            ))}
          </tr>
          {/* Sub-header: company / op type / SF / date */}
          <tr className="bg-gray-100 text-gray-600">
            <td colSpan={3} className="px-2 py-0.5 text-xs">会社 / 異動区分 / 発令日</td>
            <td colSpan={3} className="px-2 py-0.5 text-xs">給与等級変更 / 降格理由</td>
            <td colSpan={SNAPSHOT_FIELDS.length} className="px-2 py-0.5 text-xs bg-green-50" />
            <td colSpan={SNAPSHOT_FIELDS.length} className="px-2 py-0.5 text-xs bg-blue-50" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6 + SNAPSHOT_FIELDS.length * 2} className="px-4 py-4 text-center text-gray-400">変更のある人員がいません</td>
            </tr>
          )}
          {rows.map((row, i) => {
            const baseBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
            return (
              <tr key={row.rowId} className={`border-b border-gray-200 ${baseBg}`}>
                {/* 本人情報 */}
                <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-500">{row.sfPersonId ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap font-medium">{row.lastName}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row.firstName}</td>
                {/* 変更区分 */}
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                    row.operationType === '変更なし' ? 'bg-gray-100 text-gray-500' :
                    row.operationType === '出向開始' ? 'bg-green-100 text-green-700' :
                    row.operationType === '出向解除' ? 'bg-red-100 text-red-700' :
                    row.operationType === '昇格'     ? 'bg-yellow-100 text-yellow-700' :
                    'bg-orange-100 text-orange-700'
                  }`}>
                    {row.transferReason ?? row.operationType}
                  </span>
                  <span className="ml-1 text-gray-400 text-xs">{row.companyName} {row.effectiveDate}</span>
                  {!row.hasSF && <span className="ml-1 text-gray-400 text-xs">(SF外)</span>}
                </td>
                <td className="px-2 py-1.5 text-gray-500">{row.memo ?? ''}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-center">
                  {row.promotionSign && <span className="text-green-600 font-bold">↑</span>}
                  {row.salaryGradeChangeSign && <span className="ml-0.5 text-yellow-600 font-bold">¥</span>}
                  {row.demotionReason && <span className="ml-0.5 text-red-500 text-xs">{row.demotionReason}</span>}
                </td>
                {/* After */}
                {SNAPSHOT_FIELDS.map(f => (
                  <SnapCell key={`a_${f.key}`} snap={row.after} field={f.key} bg="bg-green-50" />
                ))}
                {/* Before */}
                {SNAPSHOT_FIELDS.map(f => (
                  <SnapCell key={`b_${f.key}`} snap={row.before} field={f.key} bg="bg-blue-50" />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
