import { useState, useMemo, useCallback } from 'react'
import { flattenOrgTree, getDescendantOrgIds } from '../../../../domain/orgScope'
import type { Organization } from '../../../../domain/schemas'
import { OrgTreePanel } from '../OrgTreePanel'
import type { OrgMapping } from './types'

// ── MappingTreeRow ────────────────────────────────────────────────────────────

function MappingTreeRow({ org, depth, hasChild, isCollapsed, newOrgIds, flatAfterOrgs, afterOrgMap, onToggle, onAdd, onRemove, onReset }: {
  org:          Organization
  depth:        number
  hasChild:     boolean
  isCollapsed:  boolean
  newOrgIds:    string[] | undefined
  flatAfterOrgs: { org: Organization; depth: number }[]
  afterOrgMap:  Map<string, Organization>
  onToggle:     () => void
  onAdd:        (id: string) => void
  onRemove:     (id: string) => void
  onReset:      () => void
}) {
  const assigned    = newOrgIds !== undefined
  const isAbandoned = assigned && newOrgIds.length === 0
  const assignedSet = useMemo(() => new Set(newOrgIds ?? []), [newOrgIds])
  const available   = useMemo(() => flatAfterOrgs.filter(e => !assignedSet.has(e.org.id)), [flatAfterOrgs, assignedSet])

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 border-b border-gray-50 min-h-[34px]">
      {/* 左: インデント + 展開 + 組織名 */}
      <div className="flex items-center gap-1 flex-1 min-w-0" style={{ paddingLeft: `${depth * 14}px` }}>
        {hasChild
          ? <button onClick={onToggle} className="flex-shrink-0 text-gray-400 hover:text-gray-600 w-3.5 text-[10px]">{isCollapsed ? '▸' : '▾'}</button>
          : <span className="flex-shrink-0 w-3.5" />}
        <span className="text-xs text-gray-700 truncate">{org.name}</span>
        {org.externalCode && <span className="flex-shrink-0 text-[9px] text-gray-300 ml-0.5">[{org.externalCode}]</span>}
        {assigned && !isAbandoned && <span className="flex-shrink-0 text-[9px] text-green-600 font-semibold ml-1">✓</span>}
        {isAbandoned && <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-red-50 text-red-500 border border-red-200 ml-1">廃止</span>}
      </div>

      {/* 右: 新組織チップ + 追加ドロップダウン */}
      <div className="flex-shrink-0 flex flex-wrap items-center gap-1 max-w-[52%]">
        {assigned && newOrgIds.map(id => (
          <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-[10px] text-blue-700">
            {afterOrgMap.get(id)?.name ?? id}
            <button onClick={() => onRemove(id)} className="text-blue-400 hover:text-red-500 leading-none">×</button>
          </span>
        ))}
        <select
          value=""
          onChange={e => { if (e.target.value) onAdd(e.target.value) }}
          className="text-[10px] border border-dashed border-blue-300 rounded px-1 py-0.5 text-blue-500 focus:outline-none cursor-pointer hover:border-blue-500 bg-white"
        >
          <option value="">+ 新組織</option>
          {available.map(({ org: o, depth: d }) => (
            <option key={o.id} value={o.id}>
              {'　'.repeat(d)}{o.name}{o.externalCode ? ` [${o.externalCode}]` : ''}
            </option>
          ))}
        </select>
        {assigned && (
          <button onClick={onReset} title="マッピングをリセット" className="text-[9px] text-gray-300 hover:text-red-400 transition-colors">✕</button>
        )}
      </div>
    </div>
  )
}

// ── MappingStep ───────────────────────────────────────────────────────────────

interface Props {
  mapping:                OrgMapping
  beforeOrgs:             Organization[]
  afterOrgs:              Organization[]
  onSetMapping:           (oldOrgId: string, newOrgIds: string[]) => void
  onRemoveMapping:        (oldOrgId: string) => void
  onAutoGenerate:         (orgIds: string[]) => void
  onNext:                 () => void
  nextLabel?:             string
  onBack?:                () => void
  initialSelectedOrgId?:  string
}

export function MappingStep({ mapping, beforeOrgs, afterOrgs, onSetMapping, onRemoveMapping, onAutoGenerate, onNext, nextLabel = '比較プレビュー →', onBack, initialSelectedOrgId }: Props) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(initialSelectedOrgId ?? null)
  const [collapsed,     setCollapsed]     = useState<Set<string>>(new Set())

  const flatAfterOrgs = useMemo(() => flattenOrgTree(afterOrgs), [afterOrgs])
  const afterOrgMap   = useMemo(() => new Map(afterOrgs.map(o => [o.id, o])), [afterOrgs])

  const subtreeFlat = useMemo(() => {
    if (!selectedOrgId) return []
    const orgById = new Map(beforeOrgs.map(o => [o.id, o]))
    const descIds = getDescendantOrgIds(selectedOrgId, beforeOrgs)
    // beforeOrgs is a subtree slice whose root may have a non-null parentId,
    // so flattenOrgTree (which starts from parentId=null) returns nothing.
    // Build the DFS list directly from selectedOrgId instead.
    const childrenOf = new Map<string, Organization[]>()
    for (const org of beforeOrgs) {
      if (!descIds.has(org.id) || org.id === selectedOrgId) continue
      const pid = org.parentId && descIds.has(org.parentId) ? org.parentId : selectedOrgId
      const arr = childrenOf.get(pid) ?? []
      arr.push(org)
      childrenOf.set(pid, arr)
    }
    const result: { org: Organization; depth: number }[] = []
    const visit = (id: string, depth: number) => {
      const org = orgById.get(id)
      if (!org) return
      result.push({ org, depth })
      for (const child of childrenOf.get(id) ?? []) visit(child.id, depth + 1)
    }
    visit(selectedOrgId, 0)
    return result
  }, [selectedOrgId, beforeOrgs])

  const hasChildrenSet = useMemo(() => {
    const set = new Set<string>()
    for (let i = 0; i < subtreeFlat.length - 1; i++) {
      if (subtreeFlat[i + 1].depth > subtreeFlat[i].depth) set.add(subtreeFlat[i].org.id)
    }
    return set
  }, [subtreeFlat])

  const visibleRows = useMemo(() => {
    const result: typeof subtreeFlat = []
    let skipDepth: number | null = null
    for (const row of subtreeFlat) {
      if (skipDepth !== null) {
        if (row.depth > skipDepth) continue
        else skipDepth = null
      }
      result.push(row)
      if (collapsed.has(row.org.id)) skipDepth = row.depth
    }
    return result
  }, [subtreeFlat, collapsed])

  const toggleCollapse = useCallback((orgId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(orgId) ? next.delete(orgId) : next.add(orgId)
      return next
    })
  }, [])

  const selectedOrgName = selectedOrgId
    ? beforeOrgs.find(o => o.id === selectedOrgId)?.name
    : null

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左: 旧組織検索・選択 */}
      <div className="flex-shrink-0 w-56 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 bg-white">
          <div className="text-[11px] font-semibold text-gray-500">旧組織</div>
          <div className="text-[10px] text-gray-400 mt-0.5">選択してマッピングを設定</div>
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          <OrgTreePanel
            orgs={beforeOrgs}
            selectedId={selectedOrgId ?? undefined}
            onSelectOrg={setSelectedOrgId}
            placeholder="🔍 旧組織名で検索"
            renderOrgRow={org => {
              const m = mapping.get(org.id)
              if (m === undefined) return null
              if (m.length === 0) return <span className="flex-shrink-0 text-[9px] px-1 py-0.5 rounded bg-red-50 text-red-400 border border-red-200">廃止</span>
              return <span className="flex-shrink-0 text-[9px] text-green-600">✓</span>
            }}
          />
        </div>
      </div>

      {/* 右: マッピングテーブル */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white flex-wrap">
          {selectedOrgName
            ? <span className="text-xs font-semibold text-gray-700 truncate max-w-[40%]">{selectedOrgName}</span>
            : <span className="text-xs text-gray-400">← 旧組織を選択してください</span>}
          {selectedOrgId && (
            <button
              onClick={() => onAutoGenerate(subtreeFlat.map(e => e.org.id))}
              className="text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >⚡ 自動生成</button>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >← 戻る</button>
          )}
          <button
            onClick={onNext}
            className="ml-auto text-xs px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
          >{nextLabel}</button>
        </div>

        {selectedOrgId ? (
          <div className="flex-1 overflow-y-auto">
            <div className="flex items-center px-2 py-1 bg-gray-100 border-b border-gray-200 sticky top-0">
              <span className="flex-1 text-[10px] font-semibold text-gray-400">旧組織</span>
              <span className="flex-shrink-0 text-[10px] font-semibold text-gray-400 pr-2">新組織割り当て</span>
            </div>
            {visibleRows.map(({ org, depth }) => (
              <MappingTreeRow
                key={org.id}
                org={org}
                depth={depth}
                hasChild={hasChildrenSet.has(org.id)}
                isCollapsed={collapsed.has(org.id)}
                newOrgIds={mapping.get(org.id)}
                flatAfterOrgs={flatAfterOrgs}
                afterOrgMap={afterOrgMap}
                onToggle={() => toggleCollapse(org.id)}
                onAdd={id => onSetMapping(org.id, [...(mapping.get(org.id) ?? []), id])}
                onRemove={id => onSetMapping(org.id, (mapping.get(org.id) ?? []).filter(x => x !== id))}
                onReset={() => onRemoveMapping(org.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center space-y-2">
              <div className="text-4xl opacity-20">⇐</div>
              <div className="text-sm">左の一覧から旧組織を選択</div>
              <div className="text-xs">選択した組織の子・孫組織も含めてマッピングを設定できます</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
