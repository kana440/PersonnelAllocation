import { useState, useMemo, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../../store/useStore'
import { useReviewFilterStore } from '../../../store/reviewFilterStore'
import { useReviewData } from '../hooks/useReviewData'
import { BEFORE_AFTER_FIELD_PAIRS } from '@personnel/domain/allocationRow'
import { ALLOCATION_LIST_LABEL_MAP } from '@personnel/domain/csvImport/allocationList/labels'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import { appService } from '../../../application/HRApplicationService'
import { buildOrgPathMap } from '../components/BulkFieldEditModal/helpers'
import { BulkFieldEditModal } from '../components/BulkFieldEditModal'
import { filterRows, buildIssueGroups } from './helpers'
import { FilterBar }          from './FilterBar'
import { UnifiedTable }       from './UnifiedTable'
import { SelectionActionBar } from './SelectionActionBar'
import { type DisplayField, type IssueGroupDef, type OrgTableItem } from './types'
import { buildPositionDepthList } from '../../canvas/panel/helpers'

const ALL_DISPLAY_FIELDS: DisplayField[] = BEFORE_AFTER_FIELD_PAIRS.map(([afterKey, prevKey]) => ({
  afterKey: String(afterKey),
  prevKey:  String(prevKey),
  label:    ALLOCATION_LIST_LABEL_MAP[String(afterKey)]?.ja ?? String(afterKey),
}))

const SEARCH_FIELDS = [
  { value: '__all__',        label: 'すべての表示項目' },
  { value: '__name__',       label: '氏名' },
  { value: '__orgPath__',    label: '組織（階層）' },
  { value: 'userId',         label: 'ユーザーID' },
  { value: 'transferReason', label: '異動事由' },
  ...ALL_DISPLAY_FIELDS.map(f => ({ value: f.afterKey, label: f.label })),
]

export function UnifiedReviewView() {
  const data = useReviewData()
  const { afterOrganizations, masters, selectedRowId } = useStore(useShallow(s => ({
    afterOrganizations: s.afterOrganizations,
    masters:            s.masters,
    selectedRowId:      s.selectedRowId,
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

  const { filter, searchInput, viewMode, setFilter, setSearchInput, patchFilter } =
    useReviewFilterStore(useShallow(s => ({
      filter:         s.filter,
      searchInput:    s.searchInput,
      viewMode:       s.viewMode,
      setFilter:      s.setFilter,
      setSearchInput: s.setSearchInput,
      patchFilter:    s.patchFilter,
    })))

  // searchInput → filter.searchText のデバウンス（200ms）
  useEffect(() => {
    const t = setTimeout(() => patchFilter({ searchText: searchInput }), 200)
    return () => clearTimeout(t)
  }, [searchInput, patchFilter])

  const orgPathMap = useMemo(() => buildOrgPathMap(afterOrganizations), [afterOrganizations])

  const filteredRows = useMemo(
    () => filterRows(data.rows, filter, orgPathMap),
    [data.rows, filter, orgPathMap]
  )

  // ── 組織別にグループ化し、キャンバスと同じツリー順でソートした OrgTableItem[] を構築 ──
  const items = useMemo((): OrgTableItem[] => {
    const afterOrgByCode = new Map(
      afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])
    )

    // 全行を org code でグループ化（DFS sort に org 内の全行が必要なため data.rows を使う）
    const allRowsByOrgCode = new Map<string, typeof data.rows>()
    for (const rr of data.rows) {
      const code = rr.row.departmentCode as string | undefined
      if (!code) continue
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
      const code = rr.row.departmentCode as string | undefined
      if (code) usedOrgCodes.add(code)
    }
    const sortedOrgCodes = [...usedOrgCodes].sort((a, b) =>
      (orgPathMap.get(a) ?? a).localeCompare(orgPathMap.get(b) ?? b, 'ja')
    )

    const result: OrgTableItem[] = []

    for (const code of sortedOrgCodes) {
      const allOrgRows = allRowsByOrgCode.get(code) ?? []

      // キャンバスと同じ順序: buildPositionDepthList（マネージャーポジション DFS）
      const depthList = buildPositionDepthList(
        allOrgRows.map(rr => rr.row),
        r => r.positionCode as string | undefined,
        r => r.managerPositionCode as string | undefined,
      )

      // DFS 順でフィルタ後の行だけ抽出
      const sortedFiltered = depthList
        .filter(({ row }) => filteredRowIdSet.has(row.rowId))
        .map(({ row }) => filteredRowById.get(row.rowId)!)
        .filter((rr): rr is NonNullable<typeof rr> => rr != null)

      if (sortedFiltered.length === 0) continue

      const org     = afterOrgByCode.get(code)
      const orgPath = orgPathMap.get(code) ?? code
      const orgName = org?.name ?? code

      result.push({ kind: 'org-header', orgId: org?.id ?? null, orgName, orgPath, rowCount: sortedFiltered.length })
      for (const rr of sortedFiltered) {
        result.push({ kind: 'row', reviewRow: rr })
      }
    }

    // departmentCode 未設定の行を末尾に追加
    const noOrgRows = filteredRows.filter(rr => !(rr.row.departmentCode as string | undefined))
    if (noOrgRows.length > 0) {
      result.push({ kind: 'org-header', orgId: null, orgName: '（組織未設定）', orgPath: '', rowCount: noOrgRows.length })
      for (const rr of noOrgRows) result.push({ kind: 'row', reviewRow: rr })
    }

    return result
  }, [data.rows, filteredRows, afterOrganizations, orgPathMap])

  const issueGroups = useMemo(() => buildIssueGroups(data.rows), [data.rows])

  const transferReasonOptions = useMemo(
    () => masters.transferReasons.map(e => e.label),
    [masters.transferReasons]
  )

  const changedCount = useMemo(
    () => data.rows.filter(r => r.changes.diffCount > 0).length,
    [data.rows]
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        summary={data.summary}
        issueGroups={issueGroups}
        searchFields={SEARCH_FIELDS}
        filteredCount={filteredRows.length}
        totalRows={data.rows.length}
        changedCount={changedCount}
        onOpenBulkModal={(group) => setBulkModal(group)}
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
          resolutionDef={bulkModal.resolutionDef}
          onClose={() => setBulkModal(null)}
        />
      )}
    </div>
  )
}
