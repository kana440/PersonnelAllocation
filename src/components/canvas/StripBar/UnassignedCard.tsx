import { useState }  from 'react'
import { useStore }  from '../../../store/useStore'
import { appService }       from '../../../application/HRApplicationService'
import { OrgPickerModal }   from '../../common/OrgPickerModal'
import { useUnassignedRows } from './useUnassignedRows'
import type { UnassignedGroup as GroupType } from './useUnassignedRows'

export function UnassignedCard() {
  const groups    = useUnassignedRows()
  const total     = groups.reduce((s, g) => s + g.rowIds.length, 0)
  const [collapsed, setCollapsed] = useState(false)

  if (total === 0) {
    return (
      <div className="flex-shrink-0 flex items-center px-3 h-full border-2 border-green-200 rounded-lg bg-green-50 text-xs text-green-600 font-medium gap-1.5">
        <span>✓</span><span>組織未設定なし</span>
      </div>
    )
  }

  return (
    <div className="bg-orange-50 border-t border-orange-200">
      {/* Header */}
      <button
        className="w-full flex items-center gap-1 px-2 py-1.5 hover:bg-orange-100 transition-colors"
        onClick={() => setCollapsed(o => !o)}
      >
        <span className="text-orange-500 text-xs">⚠</span>
        <span className="flex-1 text-left text-xs font-semibold text-orange-700">
          組織未設定（{total}）
        </span>
        <span className="text-orange-400 text-xs">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="max-h-64 overflow-y-auto px-2 pb-2 space-y-1.5">
          {groups.map(g => (
            <UnassignedGroupCard
              key={g.groupKey}
              group={g}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── グループ行 ────────────────────────────────────────────────────────────────

interface GroupProps {
  group: GroupType
}

function UnassignedGroupCard({ group }: GroupProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [modalOpen,   setModalOpen]   = useState(false)

  const toggleRow = (rowId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const targetIds = selectedIds.size > 0 ? [...selectedIds] : group.rowIds

  const moveToOrg = (orgId: string) => {
    const { afterOrganizations } = useStore.getState() as ReturnType<typeof useStore.getState>
    const org = afterOrganizations.find((o: { id: string }) => o.id === orgId)
    if (!org) return
    const extCode = org.externalCode ?? org.id
    for (const rowId of targetIds) {
      appService.saveRow(rowId, { departmentCode: extCode })
    }
    setSelectedIds(new Set())
  }

  return (
    <div className="text-[10px] border border-orange-200 rounded bg-white p-1.5">
      <GroupLabel group={group} />
      <div className="flex flex-wrap gap-1 mb-1.5 mt-1">
        {group.names.map((name, i) => (
          <button
            key={group.rowIds[i]}
            onClick={() => toggleRow(group.rowIds[i])}
            className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
              selectedIds.has(group.rowIds[i])
                ? 'bg-blue-100 border-blue-400 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-blue-50'
            }`}
          >
            {name || '（名称不明）'}
          </button>
        ))}
      </div>
      <div>
        <button
          onClick={() => setModalOpen(true)}
          className="w-full text-center py-0.5 rounded border border-orange-300 text-orange-600 hover:bg-orange-100 transition-colors text-[10px]"
        >
          {selectedIds.size > 0
            ? `${selectedIds.size}人を移動先に指定 ▶`
            : `まとめて移動先を選択 ▶`}
        </button>
        <OrgPickerModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSelect={moveToOrg}
          title="移動先の組織を選択"
        />
      </div>
    </div>
  )
}

// ── グループラベル ─────────────────────────────────────────────────────────────

function GroupLabel({ group }: { group: GroupType }) {
  const { code, orgName, orgPath, textPath, isMismatch } = group

  if (isMismatch) {
    // departmentCode あり but 新組織マスタに対応なし
    const displayName = orgName ?? code ?? '（不明）'
    const displayPath = orgPath ?? textPath
    const fullTitle   = [displayName, displayPath].filter(Boolean).join(' / ')
    return (
      <div title={fullTitle}>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="font-semibold text-gray-600 truncate">{displayName}</span>
          <span className="flex-shrink-0 text-[9px] bg-orange-100 text-orange-600 border border-orange-200 rounded px-1">
            対応新組織なし
          </span>
        </div>
        {displayPath && (
          <div className="text-[9px] text-gray-400 truncate mt-0.5 pl-0.5">{displayPath}</div>
        )}
      </div>
    )
  }

  if (!code) {
    return (
      <div className="font-semibold text-gray-500">旧: なし（新入社員）</div>
    )
  }

  // prevDepartmentCode あり
  const displayName = orgName ?? code
  // orgPath は「会社 > BU > 部門名」形式。textPath はフォールバック
  const displayPath = orgPath ?? textPath
  const fullTitle   = displayPath ?? displayName

  return (
    <div title={fullTitle}>
      <div className="font-semibold text-gray-500 truncate">旧: {displayName}</div>
      {displayPath && displayPath !== displayName && (
        <div className="text-[9px] text-gray-400 truncate mt-0.5 pl-0.5">{displayPath}</div>
      )}
    </div>
  )
}
