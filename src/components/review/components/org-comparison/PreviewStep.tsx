import { useState, useMemo } from 'react'
import { flattenOrgTree } from '../../../../domain/choices/orgTree'
import { detectChanges } from '../../../../domain/patterns/changeDetection'
import type { Organization } from '../../../../domain/schemas'
import type { AllocationRow } from '../../../../domain/allocationRow'
import { computeDirectBeforeMembers, computeDirectAfterMembers } from './helpers'
import type { OrgMapping } from './types'

// ── PreviewMemberRow ──────────────────────────────────────────────────────────

function PreviewMemberRow({ row }: { row: AllocationRow }) {
  const { kinds, bandMismatch } = useMemo(() => detectChanges(row), [row])
  const bandChanged = (row.band ?? '') !== (row.prevBand ?? '')
  const bandN  = (s: string) => parseInt(s, 10)
  const bandUp = bandChanged && !isNaN(bandN(row.band ?? '')) && !isNaN(bandN(row.prevBand ?? ''))
    && bandN(row.band!) > bandN(row.prevBand!)
  const bandDown = bandChanged && !isNaN(bandN(row.band ?? '')) && !isNaN(bandN(row.prevBand ?? ''))
    && bandN(row.band!) < bandN(row.prevBand!)

  return (
    <div className="flex items-center gap-2 px-4 py-1 hover:bg-gray-50 text-xs border-b border-gray-50">
      <span className="font-medium text-gray-700 w-16 flex-shrink-0 truncate">{row.lastName}{row.firstName}</span>
      <span className="text-gray-400 text-[10px] w-20 flex-shrink-0 truncate">{row.userId}</span>
      {bandChanged ? (
        <span className="flex-shrink-0 text-[10px]">
          <span className="text-gray-400">{row.prevBand}</span>
          <span className="text-gray-300 mx-0.5">→</span>
          <span className={bandUp ? 'text-green-600 font-semibold' : bandDown ? 'text-orange-600 font-semibold' : 'text-blue-600'}>{row.band}</span>
        </span>
      ) : row.band ? (
        <span className="flex-shrink-0 text-[10px] text-gray-400">{row.band}</span>
      ) : null}
      <div className="flex flex-wrap gap-0.5 flex-1">
        {kinds.has('transfer')    && <span className="px-1 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600">異動</span>}
        {kinds.has('promotion')   && <span className="px-1 py-0.5 rounded text-[10px] bg-green-50 text-green-700 font-semibold">↑昇格</span>}
        {kinds.has('demotion')    && <span className="px-1 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700 font-semibold">↓降格</span>}
        {kinds.has('titleChange') && <span className="px-1 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600">職位変更</span>}
        {kinds.has('newHire')     && <span className="px-1 py-0.5 rounded text-[10px] bg-teal-50 text-teal-700">新規</span>}
        {kinds.has('termination') && <span className="px-1 py-0.5 rounded text-[10px] bg-red-50 text-red-600">退職</span>}
        {kinds.has('concurrent')  && <span className="px-1 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-600">兼務</span>}
        {bandMismatch             && <span className="px-1 py-0.5 rounded text-[10px] bg-amber-50 text-amber-600">⚠Band</span>}
      </div>
      {row.localJobTitle && <span className="flex-shrink-0 text-[10px] text-gray-400 truncate max-w-[100px]">{row.localJobTitle}</span>}
    </div>
  )
}

// ── MemberGroup ───────────────────────────────────────────────────────────────

function MemberGroup({ label, count, labelCls, rows }: {
  label:    string
  count:    number
  labelCls: string
  rows:     AllocationRow[]
}) {
  const [open, setOpen] = useState(true)
  if (count === 0) return null
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-4 py-1 text-left hover:bg-gray-50"
      >
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${labelCls}`}>{label} {count}名</span>
        <span className="text-[9px] text-gray-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && rows.map(r => <PreviewMemberRow key={r.rowId} row={r} />)}
    </div>
  )
}

// ── PreviewOrgSection ─────────────────────────────────────────────────────────

function PreviewOrgSection({ org, depth, newOrgIds, afterOrgs, allocationList, beforeOrgs }: {
  org:            Organization
  depth:          number
  newOrgIds:      string[] | undefined
  afterOrgs:      Organization[]
  allocationList: AllocationRow[]
  beforeOrgs:     Organization[]
}) {
  const [expanded, setExpanded] = useState(true)
  const afterOrgMap = useMemo(() => new Map(afterOrgs.map(o => [o.id, o])), [afterOrgs])

  const isMapped    = newOrgIds !== undefined
  const isAbandoned = isMapped && newOrgIds.length === 0
  const newOrgLabel = !isMapped ? '未マッピング'
    : isAbandoned   ? '廃止'
    : newOrgIds.map(id => afterOrgMap.get(id)?.name ?? id).join(' + ')

  const beforeMembers = useMemo(
    () => computeDirectBeforeMembers(org.id, allocationList, beforeOrgs),
    [org.id, allocationList, beforeOrgs]
  )
  const afterMembers = useMemo(
    () => isMapped ? computeDirectAfterMembers(newOrgIds, allocationList, afterOrgs) : [],
    [isMapped, newOrgIds, allocationList, afterOrgs]
  )

  const afterUserIds  = useMemo(() => new Set(afterMembers.map(r => r.userId!)), [afterMembers])
  const beforeUserIds = useMemo(() => new Set(beforeMembers.map(r => r.userId!)), [beforeMembers])

  const changed   = afterMembers.filter(r => beforeUserIds.has(r.userId!) && detectChanges(r).diffCount > 0)
  const unchanged = afterMembers.filter(r => beforeUserIds.has(r.userId!) && detectChanges(r).diffCount === 0)
  const arriving  = afterMembers.filter(r => !beforeUserIds.has(r.userId!))
  const departing = beforeMembers.filter(r => !afterUserIds.has(r.userId!))

  return (
    <div style={{ marginLeft: `${depth * 16}px` }}>
      <button
        onClick={() => isMapped && setExpanded(v => !v)}
        className={`w-full flex items-center gap-2 px-2 py-2 border-b border-gray-100 text-left transition-colors bg-white ${isMapped ? 'hover:bg-gray-50' : ''}`}
      >
        <span className="text-gray-400 text-[10px] w-3 flex-shrink-0">{isMapped ? (expanded ? '▾' : '▸') : ''}</span>
        <span className="text-xs font-semibold text-gray-700 truncate">{org.name}</span>
        <span className="text-gray-300 text-[10px] flex-shrink-0">→</span>
        <span className={`text-xs truncate ${isAbandoned ? 'text-red-500' : !isMapped ? 'text-gray-400 italic' : 'text-blue-700'}`}>
          {newOrgLabel}
        </span>
        {isMapped && (
          <div className="ml-auto flex-shrink-0 flex gap-2 text-[10px]">
            {changed.length   > 0 && <span className="text-orange-600 font-medium">変更 {changed.length}</span>}
            {unchanged.length > 0 && <span className="text-gray-500">継続 {unchanged.length}</span>}
            {arriving.length  > 0 && <span className="text-green-600 font-medium">+着任 {arriving.length}</span>}
            {departing.length > 0 && <span className="text-red-500 font-medium">-離任 {departing.length}</span>}
          </div>
        )}
      </button>

      {isMapped && expanded && (
        <div className="border-b border-gray-100 bg-white">
          <MemberGroup label="変更あり" count={changed.length}   labelCls="bg-orange-100 text-orange-700" rows={changed} />
          <MemberGroup label="変更なし" count={unchanged.length} labelCls="bg-gray-100 text-gray-600"    rows={unchanged} />
          <MemberGroup label="着任予定" count={arriving.length}  labelCls="bg-green-100 text-green-700"  rows={arriving} />
          <MemberGroup label="離任予定" count={departing.length} labelCls="bg-red-100 text-red-700"      rows={departing} />
          {changed.length === 0 && unchanged.length === 0 && arriving.length === 0 && departing.length === 0 && (
            <div className="px-4 py-3 text-xs text-gray-400">この組織に直属メンバーがいません</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── PreviewStep ───────────────────────────────────────────────────────────────

interface Props {
  mapping:        OrgMapping
  beforeOrgs:     Organization[]
  afterOrgs:      Organization[]
  allocationList: AllocationRow[]
  onBack:         () => void
}

export function PreviewStep({ mapping, beforeOrgs, afterOrgs, allocationList, onBack }: Props) {
  const flatOrgs    = useMemo(() => flattenOrgTree(beforeOrgs), [beforeOrgs])
  const mappedCount = mapping.size

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-gray-200 bg-white flex-wrap">
        <button onClick={onBack} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
          ← マッピング編集
        </button>
        <span className="text-gray-300">|</span>
        <span className="text-xs font-semibold text-gray-600">比較プレビュー</span>
        <span className="text-[10px] text-gray-400">{mappedCount}/{beforeOrgs.length} 組織マッピング済</span>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {flatOrgs.map(({ org, depth }) => (
          <PreviewOrgSection
            key={org.id}
            org={org}
            depth={depth}
            newOrgIds={mapping.get(org.id)}
            afterOrgs={afterOrgs}
            allocationList={allocationList}
            beforeOrgs={beforeOrgs}
          />
        ))}
      </div>
    </div>
  )
}
