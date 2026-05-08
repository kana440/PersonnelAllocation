import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { translateToExcel } from '../utils/translator'
import { exportToXlsx, parseXlsx, buildBaseState } from '../utils/excelIO'
import type { PositionSnapshot } from '../types/domain'

const SNAPSHOT_FIELDS: { key: keyof PositionSnapshot; label: string; boolean?: boolean }[] = [
  { key: 'employmentType',               label: '雇用タイプ' },
  { key: 'concurrentType',               label: '本務兼務区分' },
  { key: 'concurrentReason',             label: '兼務理由' },
  { key: 'secondmentSourceCompany',      label: '出向元会社' },
  { key: 'secondmentSourceEmployeeId',   label: '出向元社員番号' },
  { key: 'isOnLeave',                    label: '休職者サイン',    boolean: true },
  { key: 'positionCode',                 label: 'ポジションコード' },
  { key: 'orgCode',                      label: '組織コード' },
  { key: 'jobTitle',                     label: '役職' },
  { key: 'freeTitle',                    label: 'フリータイトル' },
  { key: 'secondmentDestCompany',        label: '出向先会社' },
  { key: 'workLocation',                 label: '勤務場所' },
  { key: 'costCenter',                   label: 'コストセンター' },
  { key: 'managerPositionCode',          label: '上司ポジションコード' },
  { key: 'managerName',                  label: '上司氏名' },
  { key: 'jobFamily',                    label: 'ジョブファミリー' },
  { key: 'jobType',                      label: 'ジョブタイプ' },
  { key: 'positionBand',                label: 'ポジションのバンド' },
  { key: 'individualBand',             label: 'バンド' },
  { key: 'salaryGrade',                  label: '給与等級' },
  { key: 'isTrainingPosition',           label: '業務研修PF',       boolean: true },
  { key: 'isNonUnionAgreement',          label: '非組合協定対象',   boolean: true },
  { key: 'isUnionPosition',            label: 'PF組合員FG',       boolean: true },
  { key: 'isUnionMember',              label: '組合員',           boolean: true },
  { key: 'isDiscretionaryLaborPosition', label: 'PF裁量労働FG',     boolean: true },
  { key: 'isDiscretionaryLabor',       label: '裁量労働対象',     boolean: true },
]

function SnapCell({ snap, field, bg }: { snap: PositionSnapshot | null; field: keyof PositionSnapshot; bg: string }) {
  const cls = `px-2 py-1.5 whitespace-nowrap text-xs ${bg}`
  if (!snap) return <td className={`${cls} text-gray-300`}>—</td>
  const val = snap[field]
  if (val === undefined || val === null) return <td className={cls}>—</td>
  if (typeof val === 'boolean') return <td className={cls}>{val ? '○' : ''}</td>
  return <td className={cls}>{String(val)}</td>
}

type ImportState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'preview'; rows: import('../utils/excelIO').ImportedRow[]; skipped: number }
  | { phase: 'error'; message: string }

export function ExcelPreview() {
  const store = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importState, setImportState] = useState<ImportState>({ phase: 'idle' })

  const allOrgs = [
    ...store.organizations,
    ...store.afterOrganizations.filter(o => !store.organizations.find(b => b.id === o.id)),
  ]

  const rows = useMemo(() => translateToExcel({
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

  const thPerson = 'px-2 py-2 text-left whitespace-nowrap bg-gray-700 text-white'
  const thChange = 'px-2 py-2 text-left whitespace-nowrap bg-orange-800 text-white'
  const thAfter  = 'px-2 py-2 text-left whitespace-nowrap bg-green-900 text-white'
  const thBefore = 'px-2 py-2 text-left whitespace-nowrap bg-blue-900 text-white'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600">Excel申請書</span>
        <span className="text-xs text-gray-400">{rows.length} 件</span>
        <div className="ml-auto flex items-center gap-2">
          {/* Import */}
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
          {/* Export */}
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-blue-300 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            📤 エクスポート
          </button>
        </div>
      </div>

      {/* ── Import feedback banner ───────────────────────────── */}
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
          <button
            onClick={applyImport}
            className="px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            適用
          </button>
          <button
            onClick={() => setImportState({ phase: 'idle' })}
            className="px-2 py-1 border border-amber-300 rounded text-amber-700 hover:bg-amber-100 transition-colors"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th colSpan={6} className="px-2 py-1 text-center bg-gray-600 text-white border-r border-gray-500 text-xs font-bold">本人情報 / 変更区分</th>
              <th colSpan={SNAPSHOT_FIELDS.length} className="px-2 py-1 text-center bg-green-800 text-white border-r border-green-700 text-xs font-bold">After（発令後）</th>
              <th colSpan={SNAPSHOT_FIELDS.length} className="px-2 py-1 text-center bg-blue-800 text-white text-xs font-bold">Before（発令前）</th>
            </tr>
            <tr>
              <th className={thPerson}>社員ID</th>
              <th className={thPerson}>姓</th>
              <th className={thPerson}>名</th>
              <th className={thChange}>申請区分</th>
              <th className={thChange}>メモ</th>
              <th className={thChange}>昇降格</th>
              {SNAPSHOT_FIELDS.map(f => (
                <th key={`a_${f.key}`} className={thAfter}>{f.label}</th>
              ))}
              {SNAPSHOT_FIELDS.map(f => (
                <th key={`b_${f.key}`} className={thBefore}>{f.label}</th>
              ))}
            </tr>
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
                <td colSpan={6 + SNAPSHOT_FIELDS.length * 2} className="px-4 py-8 text-center text-gray-400">
                  変更のある人員がいません
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const baseBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              return (
                <tr key={row.rowId} className={`border-b border-gray-200 ${baseBg}`}>
                  <td className="px-2 py-1.5 whitespace-nowrap font-mono text-gray-500">{row.sfPersonId ?? '—'}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium">{row.lastName}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{row.firstName}</td>
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
                  {SNAPSHOT_FIELDS.map(f => (
                    <SnapCell key={`a_${f.key}`} snap={row.after} field={f.key} bg="bg-green-50" />
                  ))}
                  {SNAPSHOT_FIELDS.map(f => (
                    <SnapCell key={`b_${f.key}`} snap={row.before} field={f.key} bg="bg-blue-50" />
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
