import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { toAllocationRows, type AllocationRow } from '../utils/allocationListMapper'
import { exportToXlsx, parseXlsx, buildBaseState } from '../utils/excelIO'
import type { AllocationList } from '../domain/csvImport/allocationList/schema'

// ── Display columns: after/prev key pairs shown side-by-side ──────────────────
type DisplayField = {
  label:   string
  afterKey: keyof AllocationList
  prevKey:  keyof AllocationList
}

const DISPLAY_FIELDS: DisplayField[] = [
  { label: '雇用タイプ',         afterKey: 'employmentType',                prevKey: 'prevEmploymentType' },
  { label: '本務兼務区分',        afterKey: 'concurrentType',                prevKey: 'prevConcurrentType' },
  { label: '兼務理由',           afterKey: 'concurrentReason',              prevKey: 'prevConcurrentReason' },
  { label: '出向元会社',         afterKey: 'secondmentFromCompany',         prevKey: 'prevSecondmentFromCompany' },
  { label: '出向元社員番号',      afterKey: 'secondmentFromEmployeeNumber',  prevKey: 'prevSecondmentFromEmployeeNumber' },
  { label: '休職者サイン',        afterKey: 'leaveFlag',                     prevKey: 'prevLeaveFlag' },
  { label: 'ポジションコード',    afterKey: 'positionCode',                  prevKey: 'prevPositionCode' },
  { label: '組織コード',         afterKey: 'departmentCode',                prevKey: 'prevDepartmentCode' },
  { label: 'BU',               afterKey: 'businessUnit',                  prevKey: 'prevBusinessUnit' },
  { label: '部門',              afterKey: 'division',                      prevKey: 'prevDivision' },
  { label: '統括部',            afterKey: 'subDivision',                   prevKey: 'prevSubDivision' },
  { label: 'グループ',           afterKey: 'group',                         prevKey: 'prevGroup' },
  { label: 'チーム',            afterKey: 'team',                          prevKey: 'prevTeam' },
  { label: '役職',              afterKey: 'officialPositionCode',          prevKey: 'prevOfficialPositionCode' },
  { label: 'フリータイトル',      afterKey: 'localJobTitle',                 prevKey: 'prevLocalJobTitle' },
  { label: '出向先会社',         afterKey: 'secondmentToCompany',           prevKey: 'prevSecondmentToCompany' },
  { label: '勤務場所',           afterKey: 'location',                      prevKey: 'prevLocation' },
  { label: 'コストセンター',      afterKey: 'costCenter',                    prevKey: 'prevCostCenter' },
  { label: '上司PFコード',       afterKey: 'managerPositionCode',           prevKey: 'prevManagerPositionCode' },
  { label: '上司氏名',           afterKey: 'managerName',                   prevKey: 'prevManagerName' },
  { label: 'ジョブファミリー',    afterKey: 'jobFamily',                     prevKey: 'prevJobFamily' },
  { label: 'ジョブタイプ',        afterKey: 'jobType',                       prevKey: 'prevJobType' },
  { label: 'PFバンド',          afterKey: 'positionBand',                  prevKey: 'prevPositionBand' },
  { label: 'バンド',            afterKey: 'band',                          prevKey: 'prevBand' },
  { label: '給与等級',           afterKey: 'payGrade',                      prevKey: 'prevPayGrade' },
  { label: '業務研修PF',         afterKey: 'trainingPositionFlag',          prevKey: 'prevTrainingPositionFlag' },
  { label: '非組合協定',         afterKey: 'nonUnionAgreementFlag',         prevKey: 'prevNonUnionAgreementFlag' },
  { label: 'PF組合員FG',        afterKey: 'positionUnionFlag',             prevKey: 'prevPositionUnionFlag' },
  { label: '組合員',            afterKey: 'unionFlag',                     prevKey: 'prevUnionFlag' },
  { label: 'PF裁量労働FG',      afterKey: 'positionDiscretionaryWorkFlag', prevKey: 'prevPositionDiscretionaryWorkFlag' },
  { label: '裁量労働',           afterKey: 'discretionaryWorkFlag',         prevKey: 'prevDiscretionaryWorkFlag' },
]

function AllocCell({ row, field, isAfter, bg }: {
  row: AllocationRow; field: DisplayField; isAfter: boolean; bg: string
}) {
  const key = isAfter ? field.afterKey : field.prevKey
  const val = row[key]
  return (
    <td className={`px-2 py-1.5 whitespace-nowrap text-xs ${bg}`}>
      {val !== undefined && val !== null && val !== '' ? String(val) : <span className="text-gray-300">—</span>}
    </td>
  )
}

// ── Import state ──────────────────────────────────────────────────────────────
type ImportState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'preview'; rows: AllocationList[]; skipped: number }
  | { phase: 'error'; message: string }

// ── Component ─────────────────────────────────────────────────────────────────
export function ExcelPreview() {
  const store = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' })

  const allOrgs = [
    ...store.organizations,
    ...store.afterOrganizations.filter(o => !store.organizations.find(b => b.id === o.id)),
  ]

  const rows = useMemo(() => toAllocationRows({
    persons:            store.persons,
    companies:          store.companies,
    organizations:      allOrgs,
    operations:         store.operations,
    beforeAffiliations: store.beforeAffiliations,
    beforePositions:    store.beforePositions,
    afterAffiliations:  store.afterAffiliations,
    afterPositions:     store.afterPositions,
    effectiveDate:      store.effectiveDate,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [store.beforeAffiliations, store.beforePositions, store.afterAffiliations, store.afterPositions,
       store.effectiveDate, store.operations, store.afterOrganizations])

  const handleExport = () => exportToXlsx(rows, store.effectiveDate)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportState({ phase: 'loading' })
    const result = await parseXlsx(file)
    if (result.error) {
      setImportState({ phase: 'error', message: result.error })
    } else {
      const base = buildBaseState(result.rows, store.persons, store.companies, store.organizations)
      setImportState({ phase: 'preview', rows: result.rows, skipped: base.skippedRows })
    }
  }

  const applyImport = () => {
    if (importState.phase !== 'preview') return
    const base = buildBaseState(importState.rows, store.persons, store.companies, store.organizations)
    store.loadBaseState({
      persons:       base.persons,
      companies:     base.companies,
      organizations: base.organizations,
      affiliations:  base.affiliations,
      positions:     base.positions,
    })
    setImportState({ phase: 'idle' })
  }

  const N = DISPLAY_FIELDS.length
  const thPerson = 'px-2 py-2 text-left whitespace-nowrap bg-gray-700 text-white text-xs'
  const thChange = 'px-2 py-2 text-left whitespace-nowrap bg-orange-800 text-white text-xs'
  const thAfter  = 'px-2 py-2 text-left whitespace-nowrap bg-green-900 text-white text-xs'
  const thBefore = 'px-2 py-2 text-left whitespace-nowrap bg-blue-900 text-white text-xs'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600">発令一覧</span>
        <span className="text-xs text-gray-400">{rows.length} 件</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importState.phase === 'loading'}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            📥 インポート
          </button>
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-blue-300 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            📤 エクスポート
          </button>
        </div>
      </div>

      {/* ── Import feedback ──────────────────────────────────── */}
      {importState.phase === 'loading' && (
        <div className="flex-shrink-0 bg-blue-50 border-b border-blue-200 px-3 py-2 text-xs text-blue-700">
          ファイルを解析中…
        </div>
      )}
      {importState.phase === 'error' && (
        <div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-3 py-2 text-xs text-red-700 flex items-center gap-2">
          <span>⚠ {importState.message}</span>
          <button onClick={() => setImportState({ phase: 'idle' })} className="ml-auto text-red-500 hover:text-red-700">✕</button>
        </div>
      )}
      {importState.phase === 'preview' && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-3 py-2 text-xs flex items-center gap-3">
          <span className="text-amber-800 font-medium">
            📋 {importState.rows.length} 行を解析しました
            {importState.skipped > 0 && <span className="ml-1 text-amber-600">（{importState.skipped} 行スキップ）</span>}
          </span>
          <span className="text-amber-600 flex-1">
            「適用」するとBefore状態が置き換わり、手順がリセットされます
          </span>
          <button onClick={applyImport} className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors">
            適用
          </button>
          <button onClick={() => setImportState({ phase: 'idle' })} className="px-2 py-1 border border-amber-300 rounded text-amber-700 hover:bg-amber-100 transition-colors">
            キャンセル
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th colSpan={5} className="px-2 py-1 text-center bg-gray-600 text-white border-r border-gray-500 text-xs font-bold">本人情報 / 変更区分</th>
              <th colSpan={N} className="px-2 py-1 text-center bg-green-800 text-white border-r border-green-700 text-xs font-bold">After（発令後）</th>
              <th colSpan={N} className="px-2 py-1 text-center bg-blue-800 text-white text-xs font-bold">Before（発令前）</th>
            </tr>
            <tr>
              <th className={thPerson}>社員ID</th>
              <th className={thPerson}>姓</th>
              <th className={thPerson}>名</th>
              <th className={thChange}>申請区分</th>
              <th className={thChange}>メモ</th>
              {DISPLAY_FIELDS.map(f => <th key={`a_${f.afterKey}`} className={thAfter}>{f.label}</th>)}
              {DISPLAY_FIELDS.map(f => <th key={`b_${f.prevKey}`}  className={thBefore}>{f.label}</th>)}
            </tr>
            <tr className="bg-gray-100 text-gray-600">
              <td colSpan={3} className="px-2 py-0.5 text-xs">会社 / 異動区分 / 発令日</td>
              <td colSpan={2} className="px-2 py-0.5 text-xs">昇降格 / 降格理由 / 給与等級変更</td>
              <td colSpan={N} className="px-2 py-0.5 text-xs bg-green-50" />
              <td colSpan={N} className="px-2 py-0.5 text-xs bg-blue-50" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5 + N * 2} className="px-4 py-8 text-center text-gray-400">
                  変更のある人員がいません
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const baseBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              const opType = row._meta.operationType
              return (
                <tr key={`${row._meta.personId}_${row._meta.companyId}`} className={`border-b border-gray-200 ${baseBg}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-500">{row.userId ?? '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium">{row.lastName ?? ''}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.firstName ?? ''}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      opType === '変更なし' ? 'bg-gray-100 text-gray-500' :
                      opType === '出向開始' ? 'bg-green-100 text-green-700' :
                      opType === '出向解除' ? 'bg-red-100 text-red-700' :
                      opType === '昇格'     ? 'bg-yellow-100 text-yellow-700' :
                                             'bg-orange-100 text-orange-700'
                    }`}>
                      {row.transferReason ?? opType}
                    </span>
                    <span className="ml-1 text-gray-400 text-xs">{row._meta.companyName}</span>
                    {!row._meta.hasSF && <span className="ml-1 text-gray-400 text-xs">(SF外)</span>}
                    {row.exclusionReason && (
                      <span className="ml-1 text-red-400 text-xs">[{row.exclusionReason}]</span>
                    )}
                    {row.promotionSign && <span className="ml-1 text-green-600 font-bold">↑</span>}
                    {row.payGradeChangeSign && <span className="ml-0.5 text-yellow-600 font-bold">¥</span>}
                    {row.demotionReason && <span className="ml-0.5 text-red-500 text-xs">{row.demotionReason}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 max-w-32 truncate">{row.memo ?? ''}</td>
                  {DISPLAY_FIELDS.map(f => (
                    <AllocCell key={`a_${f.afterKey}`} row={row} field={f} isAfter={true}  bg="bg-green-50" />
                  ))}
                  {DISPLAY_FIELDS.map(f => (
                    <AllocCell key={`b_${f.prevKey}`}  row={row} field={f} isAfter={false} bg="bg-blue-50"  />
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
