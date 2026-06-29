import { useState, useMemo } from 'react'
import { useStore } from '../../../../store/useStore'
import { appService } from '../../../../application/HRApplicationService'
import { ModalShell } from '../../../common/ModalShell'
import { validateRow } from '@personnel/domain/validation/validateRow'
import { OrgSearchDialog } from '../../../editor/OrgSearchDialog'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Props {
  rowId:   number
  onClose: () => void
}

const FIELD_KEYS = new Set(['departmentCode'])

export function OrgTransferDialog({ rowId, onClose }: Props) {
  const { allocationList, masters, afterOrganizations } = useStore()
  const row = allocationList.find(r => r.rowId === rowId)

  const [deptCode,      setDeptCode]      = useState((row?.departmentCode as string | undefined) ?? '')
  const [orgSearchOpen, setOrgSearchOpen] = useState(false)

  const effectiveRow = useMemo(
    () => (row ? { ...row, departmentCode: deptCode } as AllocationRow : null),
    [row, deptCode]
  )

  const issues = useMemo(() => {
    if (!effectiveRow) return []
    return validateRow({ row: effectiveRow, afterOrganizations, masters, allocationList })
      .filter(i => FIELD_KEYS.has(i.field as string))
  }, [effectiveRow, afterOrganizations, masters, allocationList])

  if (!row || !effectiveRow) return null

  const prevCode = (row.prevDepartmentCode as string | undefined) ?? ''
  const orgName  = afterOrganizations.find(o => o.externalCode === deptCode)?.name ?? ''
  const hasError = issues.some(i => i.level === 'error')

  const handleSave = () => {
    appService.executeOrgTransfer(rowId, deptCode)
    onClose()
  }

  return (
    <>
    <ModalShell onClose={onClose}>
        <div className="px-4 py-3 border-b border-gray-200">
          <p className="text-sm font-semibold text-gray-700">組織異動</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {[row.lastName, row.firstName].filter(Boolean).join(' ')}
          </p>
        </div>

        <div className="px-4 py-4 space-y-1">
          <label className="text-xs text-gray-500 block mb-1">組織コード（発令後）</label>
          <div className={`rounded px-1 py-0.5 ${hasError ? 'bg-red-50' : deptCode !== prevCode ? 'bg-blue-50' : ''}`}>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={deptCode}
                onChange={e => setDeptCode(e.target.value)}
                className={`flex-1 border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 ${
                  hasError ? 'border-red-300' : 'border-gray-200'
                }`}
                placeholder="組織コード"
              />
              <button
                onClick={() => setOrgSearchOpen(true)}
                className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                title="組織を検索"
              >🔍</button>
            </div>
            {orgName && (
              <p className="text-[10px] text-blue-600 mt-0.5 truncate">{orgName}</p>
            )}
          </div>
          {issues.map(issue => (
            <div key={`${issue.field}-${issue.message}`} className={`text-[10px] ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
              {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
            </div>
          ))}
          <p className="text-[10px] text-gray-400 pt-1">現在: {prevCode || '―'}</p>
        </div>

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >キャンセル</button>
          <button
            onClick={handleSave}
              className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >保存</button>
        </div>
      </ModalShell>

      {orgSearchOpen && (
        <OrgSearchDialog
          afterOrganizations={afterOrganizations}
          orgMasterEntries={masters.orgMasterEntries}
          onSelect={(code) => { setDeptCode(code); setOrgSearchOpen(false) }}
          onClose={() => setOrgSearchOpen(false)}
        />
      )}
    </>
  )
}
