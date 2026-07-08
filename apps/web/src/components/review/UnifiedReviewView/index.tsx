import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../../store/useStore'
import { useReviewFilterStore } from '../../../store/reviewFilterStore'
import { useReviewData } from '../hooks/useReviewData'
import { BEFORE_AFTER_FIELD_PAIRS } from '@personnel/domain/allocationRow'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import { FIELD_DISPLAY_LABELS, ALLOCATION_LIST_FIELDS } from '@personnel/domain/csvImport/allocationList/labels'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import { appService } from '../../../application/HRApplicationService'
import { buildOrgPathMap } from '../components/BulkFieldEditModal/helpers'
import { BulkFieldEditModal } from '../components/BulkFieldEditModal'
import { filterRows, buildIssueGroups } from './helpers'
import { FilterBar }          from './FilterBar'
import { UnifiedTable }       from './UnifiedTable'
import { SelectionActionBar } from './SelectionActionBar'
import { DEFAULT_FILTER, type DisplayField, type IssueGroupDef, type OrgTableItem } from './types'
import { buildPositionDepthList, makeRowComparator } from '../../canvas/panel/helpers'
import { isSlowPerf } from '../../../utils/perfLog'

// テーブルの列順は Excel の列順（ALLOCATION_LIST_FIELDS の並び）に揃える。
// FIELD_METADATA（→ BEFORE_AFTER_FIELD_PAIRS）は binding 分類順で他用途にも使われているため、
// 定義自体は変えず、表示専用にここで並べ替える。
const EXCEL_COLUMN_ORDER = new Map(ALLOCATION_LIST_FIELDS.map((f, i) => [f.key, i]))
const ALL_DISPLAY_FIELDS: DisplayField[] = [...BEFORE_AFTER_FIELD_PAIRS]
  .sort((a, b) => (EXCEL_COLUMN_ORDER.get(String(a[0])) ?? 0) - (EXCEL_COLUMN_ORDER.get(String(b[0])) ?? 0))
  .map(([afterKey, prevKey]) => ({
    afterKey: String(afterKey),
    prevKey:  String(prevKey),
    label:    FIELD_DISPLAY_LABELS[String(afterKey)] ?? String(afterKey),
  }))


export function UnifiedReviewView() {
  // [perf] render開始 → commit(DOM反映)までの実測
  const renderStartRef = useRef(performance.now())
  renderStartRef.current = performance.now()

  const data = useReviewData()
  const { afterOrganizations, beforeOrganizations, masters, selectedRowId } = useStore(useShallow(s => ({
    afterOrganizations:  s.afterOrganizations,
    beforeOrganizations: s.organizations,
    masters:             s.masters,
    selectedRowId:       s.selectedRowId,
  })))
  const { selectRow, enterOperationPanel, selectPersonAndFocusOrg, selectOrg, persons } = useStore(useShallow(s => ({
    selectRow:               s.selectRow,
    enterOperationPanel:     s.enterOperationPanel,
    selectPersonAndFocusOrg: s.selectPersonAndFocusOrg,
    selectOrg:               s.selectOrg,
    persons:                 s.persons,
  })))

  const [bulkModal, setBulkModal] = useState<IssueGroupDef | null>(null)

  // 組織図→表切替時: キャンバス選択行（selectedCardRowId）を表の selectedRowId に同期する
  useEffect(() => {
    const { selectedCardRowId } = useStore.getState()
    if (selectedCardRowId !== null) selectRow(selectedCardRowId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // マウント時のみ

  const { filter, searchInput, viewMode, showOldOrg, navMode, setFilter, setSearchInput, patchFilter, setShowOldOrg, switchNavMode } =
    useReviewFilterStore(useShallow(s => ({
      filter:         s.filter,
      searchInput:    s.searchInput,
      viewMode:       s.viewMode,
      showOldOrg:     s.showOldOrg,
      navMode:        s.navMode,
      setFilter:      s.setFilter,
      setSearchInput: s.setSearchInput,
      patchFilter:    s.patchFilter,
      setShowOldOrg:  s.setShowOldOrg,
      switchNavMode:  s.switchNavMode,
    })))

  // searchInput → filter.searchText のデバウンス（200ms）
  useEffect(() => {
    const t = setTimeout(() => patchFilter({ searchText: searchInput }), 200)
    return () => clearTimeout(t)
  }, [searchInput, patchFilter])

  const orgPathMap    = useMemo(() => buildOrgPathMap(afterOrganizations),  [afterOrganizations])
  const beforePathMap = useMemo(() => buildOrgPathMap(beforeOrganizations), [beforeOrganizations])

  const filteredRows = useMemo(
    () => filterRows(data.rows, filter, orgPathMap),
    [data.rows, filter, orgPathMap]
  )

  // ── 組織別にグループ化し、キャンバスと同じツリー順でソートした OrgTableItem[] を構築 ──
  // showOldOrg で「主グルーピング軸」と「反対側（フォールバック）」を入れ替える。
  // 主軸の組織が無い/解決できない行も、反対側の組織でグループ化して末尾に表示する
  // （Nav バーと同じ考え方 — 行が消えず、Excel の行数と一致するようにするため）。
  const items = useMemo((): OrgTableItem[] => {
    const t0 = performance.now()

    const afterOrgByCode  = new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o]))
    const beforeOrgByCode = new Map(beforeOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o]))
    const primaryOrgByCode     = showOldOrg ? beforeOrgByCode : afterOrgByCode
    const primaryPathMap       = showOldOrg ? beforePathMap   : orgPathMap
    const counterpartOrgByCode = showOldOrg ? afterOrgByCode  : beforeOrgByCode
    const counterpartPathMap   = showOldOrg ? orgPathMap      : beforePathMap
    const getPrimaryCode     = (row: typeof data.rows[number]['row']) =>
      (showOldOrg ? row.prevDepartmentCode : row.departmentCode) as string | undefined
    const getCounterpartCode = (row: typeof data.rows[number]['row']) =>
      (showOldOrg ? row.departmentCode : row.prevDepartmentCode) as string | undefined
    const getPosCode = (row: typeof data.rows[number]['row']) =>
      (showOldOrg ? row.prevPositionCode : row.positionCode) as string | undefined
    const getMgrCode = (row: typeof data.rows[number]['row']) =>
      (showOldOrg ? row.prevManagerPositionCode : row.managerPositionCode) as string | undefined

    // 全行を主軸の org code でグループ化（DFS sort に org 内の全行が必要なため data.rows を使う）
    const allRowsByOrgCode = new Map<string, typeof data.rows>()
    for (const rr of data.rows) {
      const code = getPrimaryCode(rr.row)
      if (!code || !primaryOrgByCode.has(code)) continue
      const arr = allRowsByOrgCode.get(code)
      if (arr) arr.push(rr)
      else allRowsByOrgCode.set(code, [rr])
    }

    // フィルタ後の rowId セット（高速検索用）
    const filteredRowIdSet = new Set(filteredRows.map(rr => rr.row.rowId))
    const filteredRowById  = new Map(filteredRows.map(rr => [rr.row.rowId, rr]))

    // フィルタ後行が所属する org code 一覧を orgPath 昇順でソート
    const usedOrgCodes = new Set<string>()
    for (const rr of filteredRows) {
      const code = getPrimaryCode(rr.row)
      if (code && primaryOrgByCode.has(code)) usedOrgCodes.add(code)
    }
    const sortedOrgCodes = [...usedOrgCodes].sort((a, b) =>
      (primaryPathMap.get(a) ?? a).localeCompare(primaryPathMap.get(b) ?? b, 'ja')
    )

    const result: OrgTableItem[] = []

    const rowComparator = makeRowComparator(masters, showOldOrg ? 'prevPositionBand' : 'positionBand')

    for (const code of sortedOrgCodes) {
      const allOrgRows = allRowsByOrgCode.get(code) ?? []

      // キャンバスと同じ順序: 同一階層内をバンド降順→氏名かな順でソートしてから
      // buildPositionDepthList（マネージャーポジション DFS）で親子関係を構築する
      const sortedRows = [...allOrgRows].sort((a, b) => rowComparator(a.row, b.row))
      const depthList = buildPositionDepthList(sortedRows.map(rr => rr.row), getPosCode, getMgrCode)

      // DFS 順でフィルタ後の行だけ抽出
      const sortedFiltered = depthList
        .filter(({ row }) => filteredRowIdSet.has(row.rowId))
        .map(({ row }) => filteredRowById.get(row.rowId)!)
        .filter((rr): rr is NonNullable<typeof rr> => rr != null)

      if (sortedFiltered.length === 0) continue

      const org     = primaryOrgByCode.get(code)
      const orgPath = primaryPathMap.get(code) ?? code
      // 「旧」かどうかはバッジで示す（左Navの OrgSection と同じ a11y 方針）。名前文字列への埋め込みはしない
      const orgName = org?.name ?? code

      result.push({
        kind: 'org-header', orgId: org?.id ?? null, orgCode: code, orgName, orgPath,
        rowCount: sortedFiltered.length, isOldSection: showOldOrg, isUnmapped: false,
      })
      for (const rr of sortedFiltered) {
        result.push({ kind: 'row', reviewRow: rr })
      }
    }

    // 主軸の組織が無い/解決できない行は、反対側の組織でグループ化して末尾に追加
    // （例: 新モードで旧組織にしか居ない人 → 「旧: ○○」、旧モードで新組織にしか居ない人 → 「【新のみ】○○」）
    const fallbackRows = filteredRows.filter(rr => {
      const code = getPrimaryCode(rr.row)
      return !code || !primaryOrgByCode.has(code)
    })
    const fallbackByCounterpartCode = new Map<string, typeof filteredRows>()
    const noOrgRows: typeof filteredRows = []
    for (const rr of fallbackRows) {
      const cCode = getCounterpartCode(rr.row)
      if (!cCode) { noOrgRows.push(rr); continue }
      const arr = fallbackByCounterpartCode.get(cCode)
      if (arr) arr.push(rr); else fallbackByCounterpartCode.set(cCode, [rr])
    }
    const sortedCounterpartCodes = [...fallbackByCounterpartCode.keys()].sort((a, b) =>
      (counterpartPathMap.get(a) ?? a).localeCompare(counterpartPathMap.get(b) ?? b, 'ja')
    )
    for (const code of sortedCounterpartCodes) {
      const rows    = fallbackByCounterpartCode.get(code)!
      const org     = counterpartOrgByCode.get(code)
      const sorted  = [...rows].sort((a, b) => rowComparator(a.row, b.row))
      result.push({
        kind: 'org-header', orgId: org?.id ?? null, orgCode: code, orgName: org?.name ?? code,
        orgPath: counterpartPathMap.get(code) ?? code, rowCount: sorted.length,
        isOldSection: !showOldOrg, isUnmapped: true,
      })
      for (const rr of sorted) result.push({ kind: 'row', reviewRow: rr })
    }
    if (noOrgRows.length > 0) {
      result.push({
        kind: 'org-header', orgId: null, orgCode: '', orgName: '（組織未設定）', orgPath: '',
        rowCount: noOrgRows.length, isOldSection: false, isUnmapped: true,
      })
      for (const rr of noOrgRows) result.push({ kind: 'row', reviewRow: rr })
    }

    const elapsed = performance.now() - t0
    if (isSlowPerf(elapsed)) {
      // eslint-disable-next-line no-console
      console.log(`[perf] UnifiedReviewView items build: ${elapsed.toFixed(1)}ms (${data.rows.length} rows, ${filteredRows.length} filtered)`)
    }
    return result
  }, [data.rows, filteredRows, afterOrganizations, beforeOrganizations, orgPathMap, beforePathMap, masters, showOldOrg])

  // タブ・チップの件数バッジ用の母集団: 検索・詳細条件のみ反映し、changedOnly/issuesOnly/
  // activePatterns/activeIssueKey（タブ自体・チップ自体の選択状態）では狭めない。
  // 選択中の他チップ・タブによってさらに件数が狭まるとミスリーディングになるため（左Nav と同じ方針）。
  const rowsForCounts = useMemo(
    () => filterRows(data.rows, { ...DEFAULT_FILTER, searchText: filter.searchText, fieldConditions: filter.fieldConditions }, orgPathMap),
    [data.rows, filter.searchText, filter.fieldConditions, orgPathMap]
  )
  const issueGroups = useMemo(() => buildIssueGroups(rowsForCounts), [rowsForCounts])

  const patternCounts = useMemo(() => {
    const counts = new Map<EditPattern, number>()
    for (const rr of rowsForCounts) {
      for (const p of rr.activePatterns) counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    return counts
  }, [rowsForCounts])

  const transferReasonOptions = useMemo(
    () => masters.transferReasons.map(e => e.label),
    [masters.transferReasons]
  )

  const changedCount = useMemo(
    () => rowsForCounts.filter(r => r.changes.diffCount > 0).length,
    [rowsForCounts]
  )

  const personBySfId = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons]
  )

  const handleFieldEdit = useCallback((rowId: number, field: string, value: string) => {
    appService.executeOperation(
      new DirectEditOperation(rowId, { [field]: value || undefined }, field)
    )
  }, [])

  const handleRowClick = useCallback((rowId: number) => {
    const rr = filteredRows.find(r => r.row.rowId === rowId)
    if (!rr) return
    selectRow(rowId)
    const person = rr.row.userId ? personBySfId.get(rr.row.userId as string) : undefined
    if (person) selectPersonAndFocusOrg(person.id)
  }, [filteredRows, selectRow, selectPersonAndFocusOrg, personBySfId])

  const handleRowDoubleClick = useCallback((rowId: number) => {
    enterOperationPanel(rowId, 'directEdit')
  }, [enterOperationPanel])

  // 組織ヘッダークリック → キャンバス/左ナビの org 選択に同期
  const handleOrgClick = useCallback((orgId: string) => {
    selectOrg(orgId)
  }, [selectOrg])

  // [perf] このレンダーが実際に DOM へ commit されるまでの所要時間
  useEffect(() => {
    const elapsed = performance.now() - renderStartRef.current
    if (isSlowPerf(elapsed)) {
      // eslint-disable-next-line no-console
      console.log(`[perf] UnifiedReviewView render→commit: ${elapsed.toFixed(1)}ms (${items.length} table rows/headers)`)
    }
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        patternCounts={patternCounts}
        issueGroups={issueGroups}
        filteredCount={filteredRows.length}
        totalRows={rowsForCounts.length}
        changedCount={changedCount}
        masters={masters}
        onOpenBulkModal={(group) => setBulkModal(group)}
        navMode={navMode}
        switchNavMode={switchNavMode}
        showOldOrg={showOldOrg}
        setShowOldOrg={setShowOldOrg}
      />
      <SelectionActionBar />
      <UnifiedTable
        items={items}
        viewMode={viewMode}
        allDisplayFields={ALL_DISPLAY_FIELDS}
        onFieldEdit={handleFieldEdit}
        transferReasonOptions={transferReasonOptions}
        selectedRowId={selectedRowId}
        onRowClick={handleRowClick}
        onRowDoubleClick={handleRowDoubleClick}
        onOrgClick={handleOrgClick}
      />
      {bulkModal && (
        <BulkFieldEditModal
          field={bulkModal.field}
          rowIds={bulkModal.rowIds}
          suggestedPatch={bulkModal.suggestedPatch}
          resolutionDefs={bulkModal.resolutionDefs}
          onClose={() => setBulkModal(null)}
        />
      )}
    </div>
  )
}
