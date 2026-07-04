import { useState, useMemo, useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../../store/useStore'
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
import { DEFAULT_FILTER, type ViewMode, type UnifiedFilter, type DisplayField, type IssueGroupDef } from './types'

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
  const { selectRow, enterOperationPanel, selectPersonAndFocusOrg, persons } = useStore(useShallow(s => ({
    selectRow:               s.selectRow,
    enterOperationPanel:     s.enterOperationPanel,
    selectPersonAndFocusOrg: s.selectPersonAndFocusOrg,
    persons:                 s.persons,
  })))

  const [viewMode,    setViewMode]    = useState<ViewMode>('diff')
  const [filter,      setFilter]      = useState<UnifiedFilter>(DEFAULT_FILTER)
  const [searchInput, setSearchInput] = useState('')
  const [bulkModal,   setBulkModal]   = useState<IssueGroupDef | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setFilter(f => ({ ...f, searchText: searchInput })), 200)
    return () => clearTimeout(t)
  }, [searchInput])

  const orgPathMap = useMemo(() => buildOrgPathMap(afterOrganizations), [afterOrganizations])

  const filteredRows = useMemo(
    () => filterRows(data.rows, filter, orgPathMap),
    [data.rows, filter, orgPathMap]
  )

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        searchInput={searchInput}
        onSearchInputChange={setSearchInput}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
        rows={filteredRows}
        viewMode={viewMode}
        allDisplayFields={ALL_DISPLAY_FIELDS}
        onFieldEdit={handleFieldEdit}
        transferReasonOptions={transferReasonOptions}
        selectedRowId={selectedRowId}
        onRowClick={handleRowClick}
        onRowDoubleClick={handleRowDoubleClick}
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
