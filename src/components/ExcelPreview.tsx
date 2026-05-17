import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { toAllocationRows } from '../utils/allocationListMapper'
import type { AllocationRow } from '../utils/allocationListMapper'
import { exportToXlsx } from '../utils/excelIO'
import { getLastWorkbook, getLastFileName } from '../infrastructure/excelImport'

// ── Display columns: after/prev key pairs shown side-by-side ──────────────────
type DisplayField = {
  label:   string
  afterKey: keyof AllocationRow
  prevKey:  keyof AllocationRow
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

// ── Component ─────────────────────────────────────────────────────────────────
export function ExcelPreview() {
  const store = useStore()

  // ── 検索 ──────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('')
  const [matchIdx,   setMatchIdx]   = useState(0)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  // ── 右クリックコンテキストメニュー ──────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; personId: string } | null>(null)

  // コンテキストメニューを外クリックで閉じる
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [contextMenu])

  const allOrgs = useMemo(() => [
    ...store.organizations,
    ...store.afterOrganizations.filter(o => !store.organizations.find(b => b.id === o.id)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [store.organizations, store.afterOrganizations])

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
    rawImportedRows:    store.rawImportedRows,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [store.beforeAffiliations, store.beforePositions, store.afterAffiliations, store.afterPositions,
       store.effectiveDate, store.operations, store.afterOrganizations, store.rawImportedRows])

  // 検索マッチするインデックス
  const matchIndices = useMemo(() => {
    if (!searchTerm.trim()) return []
    const lower = searchTerm.toLowerCase()
    return rows.reduce<number[]>((acc, row, i) => {
      const hit = Object.values(row).some(v => typeof v === 'string' && v.toLowerCase().includes(lower))
      if (hit) acc.push(i)
      return acc
    }, [])
  }, [rows, searchTerm])

  // matchIdx を matchIndices 範囲内に収める
  const safeMatchIdx = matchIndices.length > 0 ? matchIdx % matchIndices.length : 0

  // Enter で次へ
  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || matchIndices.length === 0) return
    e.preventDefault()
    const next = (safeMatchIdx + 1) % matchIndices.length
    setMatchIdx(next)
    rowRefs.current[matchIndices[next]]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [matchIndices, safeMatchIdx])

  // 検索語が変わったら先頭マッチに戻る
  useEffect(() => {
    setMatchIdx(0)
    if (matchIndices.length > 0) {
      rowRefs.current[matchIndices[0]]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  const handleExport = () =>
    exportToXlsx(rows, store.effectiveDate, getLastWorkbook() ?? undefined, getLastFileName() ?? undefined)

  const N   = DISPLAY_FIELDS.length
  const thM = 'px-2 py-2 text-left whitespace-nowrap bg-gray-700 text-white text-xs'
  const thA = 'px-2 py-2 text-left whitespace-nowrap bg-green-900 text-white text-xs'
  const thB = 'px-2 py-2 text-left whitespace-nowrap bg-blue-900 text-white text-xs'
  const thX = 'px-2 py-2 text-left whitespace-nowrap bg-red-900 text-white text-xs'

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600 flex-shrink-0">発令一覧</span>
        <span className="text-xs text-gray-400 flex-shrink-0">{rows.length} 件</span>

        {/* 検索バー */}
        <div className="flex items-center gap-1 flex-1 max-w-xs">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="🔍 検索（Enter で次へ）"
            className="flex-1 border border-gray-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:border-blue-400"
          />
          {searchTerm && (
            <span className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">
              {matchIndices.length > 0
                ? `${safeMatchIdx + 1}/${matchIndices.length}`
                : '0件'}
            </span>
          )}
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0"
            >✕</button>
          )}
        </div>

        <div className="ml-auto">
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-blue-300 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
          >
            📤 エクスポート
          </button>
        </div>
      </div>

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 100 }}
          className="bg-white shadow-lg border border-gray-200 rounded py-1 text-xs min-w-[6rem]"
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={() => { store.selectPerson(contextMenu.personId); setContextMenu(null) }}
            className="block w-full text-left px-3 py-1.5 hover:bg-blue-50 text-gray-700"
          >
            編集
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            {/* Group row */}
            <tr>
              <th colSpan={11} className="px-2 py-1 text-center bg-gray-600 text-white border-r border-gray-500 text-xs font-bold">本人情報 / 変更区分</th>
              <th colSpan={N}  className="px-2 py-1 text-center bg-green-800 text-white border-r border-green-700 text-xs font-bold">After（発令後）</th>
              <th colSpan={N}  className="px-2 py-1 text-center bg-blue-800 text-white border-r border-blue-700 text-xs font-bold">Before（発令前）</th>
              <th colSpan={1}  className="px-2 py-1 text-center bg-red-800 text-white text-xs font-bold">除外</th>
            </tr>
            {/* Column header row — Excel 列順に準拠 */}
            <tr>
              <th className={thM}>No</th>
              <th className={thM}>ユーザー/社員ID</th>
              <th className={thM}>グループ社員ID</th>
              <th className={thM}>社員番号</th>
              <th className={thM}>姓</th>
              <th className={thM}>名</th>
              <th className={`${thM} border-l border-gray-500`}>申請区分(異動事由)</th>
              <th className={thM}>メモ</th>
              <th className={thM}>昇降格サイン</th>
              <th className={thM}>降格理由</th>
              <th className={`${thM} border-r border-gray-500`}>給与等級変更サイン</th>
              {DISPLAY_FIELDS.map(f => <th key={`a_${String(f.afterKey)}`} className={thA}>{f.label}</th>)}
              {DISPLAY_FIELDS.map(f => <th key={`b_${String(f.prevKey)}`}  className={thB}>{f.label}</th>)}
              <th className={thX}>除外理由</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={12 + N * 2} className="px-4 py-8 text-center text-gray-400">
                  データがありません
                </td>
              </tr>
            )}
            {rows.map((row, i) => {
              const changed = row._meta.operationType !== '変更なし'
              const isMatch = matchIndices.includes(i)
              const isCurrent = isMatch && matchIndices[safeMatchIdx] === i
              const baseBg  = changed
                ? (i % 2 === 0 ? 'bg-orange-50' : 'bg-orange-100/60')
                : (i % 2 === 0 ? 'bg-white' : 'bg-gray-50')
              const tdM = `px-2 py-1.5 whitespace-nowrap text-xs ${baseBg}`
              const tdA = `px-2 py-1.5 whitespace-nowrap text-xs bg-green-50`
              const tdB = `px-2 py-1.5 whitespace-nowrap text-xs bg-blue-50`
              const v   = (val: string | undefined | null) =>
                val ? val : <span className="text-gray-300">—</span>

              return (
                <tr
                  key={`${row._meta.personId}_${row._meta.companyId}`}
                  ref={el => { rowRefs.current[i] = el }}
                  onContextMenu={e => {
                    if (!row._meta.personId) return
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, personId: row._meta.personId })
                  }}
                  className={`border-b border-gray-200 ${isCurrent ? 'ring-2 ring-inset ring-yellow-400' : isMatch ? 'ring-1 ring-inset ring-yellow-200' : ''}`}
                >
                  <td className={`${tdM} text-gray-400`}>{row.no}</td>
                  <td className={`${tdM} font-mono text-gray-500`}>{v(row.userId)}</td>
                  <td className={`${tdM} font-mono text-gray-400`}>{v(row.groupEmployeeId)}</td>
                  <td className={`${tdM} font-mono text-gray-400`}>{v(row.employeeNumber)}</td>
                  <td className={`${tdM} font-medium`}>{v(row.lastName)}</td>
                  <td className={tdM}>{v(row.firstName)}</td>
                  <td className={`${tdM} border-l border-gray-200`}>
                    {row.transferReason ?? (changed ? row._meta.operationType : '')}
                    {!row._meta.hasSF && <span className="ml-1 text-gray-400">(SF外)</span>}
                  </td>
                  <td className={`${tdM} max-w-32 truncate`}>{v(row.memo)}</td>
                  <td className={`${tdM} text-center`}>{row.promotionSign ?? ''}</td>
                  <td className={`${tdM} text-red-600`}>{v(row.demotionReason)}</td>
                  <td className={`${tdM} text-center border-r border-gray-200`}>{row.payGradeChangeSign ?? ''}</td>
                  {DISPLAY_FIELDS.map(f => {
                    const val = row[f.afterKey]
                    return (
                      <td key={`a_${String(f.afterKey)}`} className={tdA}>
                        {val !== undefined && val !== null && val !== '' ? String(val) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                  {DISPLAY_FIELDS.map(f => {
                    const val = row[f.prevKey]
                    return (
                      <td key={`b_${String(f.prevKey)}`} className={tdB}>
                        {val !== undefined && val !== null && val !== '' ? String(val) : <span className="text-gray-300">—</span>}
                      </td>
                    )
                  })}
                  <td className={`px-2 py-1.5 whitespace-nowrap text-xs text-red-600 ${baseBg}`}>
                    {v(row.exclusionReason)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
