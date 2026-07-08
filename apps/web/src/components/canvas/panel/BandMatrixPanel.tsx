import { useMemo, useState, useCallback, useRef } from 'react'
import { appService }              from '../../../application/HRApplicationService'
import { useStore }                from '../../../store/useStore'
import { useCanvasDisplayStore }   from '../../../store/canvasDisplayStore'
import { useOrgView }              from '../OrgViewContext'
import type { DragData }           from '../OrgViewContext'
import { NameChip }                from './NameChip'
import type { PositionEntry }      from '../OrgViewContext'
import { isVacantRow }             from '@personnel/domain/allocationRow'
import { COMPACT_GROUP_DEFS, DEFAULT_COMPACT_GROUP_ID, sortGroupsByLineAndBand } from './compactGroupDefs'

interface Props {
  orgId:   string
  panelId: string
}

export function BandMatrixPanel({ orgId, panelId }: Props) {
  const masters             = useStore(s => s.masters)
  const allocationList      = useStore(s => s.allocationList)
  const compactGroupById    = useCanvasDisplayStore(s => s.compactGroupById)
  const {
    positionTreeByOrgId,
    organizations,
    openBandDrop,
    openGroupFormDrop,
    setConfirmDialog,
    isHistoryPreviewMode,
    topPositionCodeOfOrg,
  } = useOrgView()

  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  const entries = positionTreeByOrgId.get(orgId) ?? []

  const groupDef = COMPACT_GROUP_DEFS.find(d => d.id === compactGroupById)
    ?? COMPACT_GROUP_DEFS.find(d => d.id === DEFAULT_COMPACT_GROUP_ID)!

  const hasDropBehavior = !!groupDef.dropBehavior && !isHistoryPreviewMode

  // positionCode → AllocationRow（O(1)引き当て。resolveSubLabel / sortGroupsWithContext 共用）
  const positionCodeToRow = useMemo(
    () => new Map(allocationList.flatMap(r => {
      const pc = r.positionCode as string | undefined
      return pc ? [[pc, r]] : []
    })),
    [allocationList]
  )

  // externalCode → Organization（O(1)引き当て。resolveSubLabel / sortGroupsWithContext 共用）
  const orgByExternalCode = useMemo(
    () => new Map(organizations.flatMap(o => o.externalCode ? [[o.externalCode, o]] : [])),
    [organizations]
  )

  const groups = useMemo(() => {
    const visible = entries  // compact mode always shows vacant positions

    const map = new Map<string, PositionEntry[]>()
    for (const entry of visible) {
      const key = groupDef.getKey(entry.row)
      const arr = map.get(key)
      if (arr) arr.push(entry)
      else map.set(key, [entry])
    }

    // ── ソート: ライン長を含むグループが先頭 → 残りはグループ内バンドMAXの降順（全グループ共通） ──
    const linePositionCode = topPositionCodeOfOrg(orgId)
    const groupsForSort = [...map.entries()].map(([key, items]) => ({
      key,
      rows: items.map(e => e.row),
    }))
    const sortedKeys = sortGroupsByLineAndBand(groupsForSort, masters, linePositionCode)

    // ── サブラベル（上司の所属組織名など）・見出しラベル ──
    return sortedKeys.map(key => {
      const items = map.get(key)!

      let sublabel: string | undefined
      if (groupDef.resolveSubLabel && items.length > 0) {
        const meta = groupDef.resolveSubLabel(key, items[0].row)
        if (meta) {
          const managerRow = positionCodeToRow.get(meta.positionCodeToLookup)
          if (managerRow) {
            const deptCode = managerRow.departmentCode as string | undefined
            sublabel = deptCode ? (orgByExternalCode.get(deptCode)?.name ?? undefined) : undefined
          }
        }
      }

      const label = groupDef.formatGroupLabel && items.length > 0
        ? groupDef.formatGroupLabel(key, items[0].row, false)
        : key

      return { key, label, items, sublabel }
    })
  }, [entries, groupDef, masters, orgByExternalCode, orgId, positionCodeToRow, topPositionCodeOfOrg])

  const handleGroupDrop = useCallback((e: React.DragEvent, toKey: string) => {
    e.preventDefault()
    setDragOverKey(null)

    const behavior = groupDef.dropBehavior
    if (!behavior || isHistoryPreviewMode) return

    let data: DragData
    try { data = JSON.parse(e.dataTransfer.getData('application/json')) as DragData } catch { return }
    if (data.dragType !== 'person' || !data.rowId || data.fromOrgId !== orgId) return
    e.stopPropagation()

    const row = allocationList.find(r => r.rowId === data.rowId)
    if (!row || isVacantRow(row)) return

    if (behavior.kind === 'band-wizard') {
      const groupSample = groupsRef.current.find(g => g.key === toKey)?.items[0]?.row
      if (!behavior.canDrop(row, toKey, masters, groupSample)) return
      openBandDrop({
        def:             behavior.getDef(row, toKey, masters, groupSample),
        row,
        overrideInitial: behavior.buildInitial(row, toKey, masters, groupSample),
      })
    } else if (behavior.kind === 'form') {
      if (!behavior.canDrop(row, toKey)) return
      openGroupFormDrop({
        def:             behavior.def,
        row,
        overrideInitial: behavior.buildInitial(row, toKey),
      })
    } else if (behavior.kind === 'confirm') {
      if (!behavior.canDrop(row, toKey)) return
      const groupSample = groupsRef.current.find(g => g.key === toKey)?.items[0]?.row
      const command = behavior.buildCommand(row, toKey, groupSample)
      setConfirmDialog({
        message:   behavior.confirmMessage(row, toKey, groupSample),
        onConfirm: () => { appService.executeOperation(command) },
      })
    }
  }, [allocationList, groupDef, isHistoryPreviewMode, masters, openBandDrop, openGroupFormDrop, orgId, setConfirmDialog])

  // handleGroupDrop 内で最新の groups を stale closure なしに参照するための ref
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  if (groups.length === 0) return null

  return (
    <div className="p-1.5 space-y-1.5">
      {groups.map(({ key, label, items, sublabel }) => (
        <div
          key={key}
          onDragOver={hasDropBehavior ? e => {
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            setDragOverKey(key)
          } : undefined}
          onDragLeave={hasDropBehavior ? e => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null)
          } : undefined}
          onDrop={hasDropBehavior ? e => handleGroupDrop(e, key) : undefined}
          className={`rounded transition-colors ${dragOverKey === key ? 'bg-blue-50 ring-1 ring-blue-300' : ''}`}
        >
          <div className={`text-[9px] font-semibold tracking-wider mb-0.5 px-0.5 leading-none transition-colors flex items-baseline gap-1 ${
            dragOverKey === key ? 'text-blue-500' : 'text-gray-400'
          }`}>
            <span className="whitespace-pre-line leading-tight">{label}</span>
            {sublabel && (
              <span className="font-normal tracking-normal text-gray-400">{sublabel}</span>
            )}
            {dragOverKey === key && (
              <span className="text-[8px] font-normal text-blue-400">← ここにドロップ</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1 px-0.5 pb-0.5">
            {items.map((entry: PositionEntry) => (
              <NameChip key={entry.row.rowId} entry={entry} orgId={orgId} panelId={panelId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
