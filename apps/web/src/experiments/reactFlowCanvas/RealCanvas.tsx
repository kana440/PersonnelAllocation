import { useMemo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../store/useStore'
import { useScopedStore } from '../../store/useScopedStore'
import { useOrgViewData } from '../../components/canvas/hooks/useOrgViewData'
import { usePersonSelection } from '../../components/canvas/OrgOperationView/usePersonSelection'
import { OrgViewContext } from '../../components/canvas/OrgViewContext'
import type { OrgViewContextValue } from '../../components/canvas/OrgViewContext'
import { estimateTreeBodyHeight, EST_HEADER_H } from '../../components/canvas/panel/heightEstimate'
import { buildFlowLayout } from './buildFlowLayout'
import { createNoOpOrgViewHandlers } from './noOpOrgViewHandlers'
import { ReactFlowCanvas } from './ReactFlowCanvas'
import { RealOrgNode } from './RealOrgNode'
import type { RealOrgNodeData } from './RealOrgNode'

const nodeTypes = { realOrgNode: RealOrgNode }

/**
 * Phase 1: 合成データを本物の store に注入した後、本物の RowCard・useOrgViewData・
 * usePersonSelection を使って React Flow キャンバスを構築する。
 * ドラッグ&ドロップの実際の異動処理は no-op（createNoOpOrgViewHandlers 参照。console.log でイベント発火のみ確認）。
 */
export function RealCanvas() {
  // [perf] render開始 → 実際に DOM へ commit されるまでの実測
  const renderStartRef = useRef(performance.now())
  renderStartRef.current = performance.now()

  const { beforeOrganizations, orgMapping, masters } = useStore(useShallow(s => ({
    beforeOrganizations: s.beforeOrganizations,
    orgMapping:          s.orgMapping,
    masters:             s.masters,
  })))
  const { allocationList, afterOrganizations, persons, selectPerson, selectCard } = useScopedStore()

  const t0 = performance.now()
  const { positionTreeByOrgId, afterOrgByCode } = useOrgViewData({
    allAfterOrgs: afterOrganizations, beforeOrganizations, persons, allocationList, masters, orgMapping,
  })
  const t1 = performance.now()

  const { isSelectMode, selectedPersonIds, handlePersonClick } = usePersonSelection({
    persons, allocationList, selectPerson, selectCard,
  })
  const t2 = performance.now()

  const orgIds = useMemo(() => [...positionTreeByOrgId.keys()], [positionTreeByOrgId])

  const { nodes, edges } = useMemo(() => {
    const orgById = new Map(afterOrganizations.map(o => [o.id, o]))
    return buildFlowLayout<RealOrgNodeData>({
      orgIds, orgById,
      nodeType:       'realOrgNode',
      estimateHeight: orgId => EST_HEADER_H + estimateTreeBodyHeight(positionTreeByOrgId.get(orgId)?.length ?? 0),
      buildData:      orgId => ({ name: orgById.get(orgId)?.name ?? orgId }),
    })
  }, [orgIds, positionTreeByOrgId, afterOrganizations])
  const t3 = performance.now()
  // eslint-disable-next-line no-console
  console.log(`[perf] RealCanvas render body: useOrgViewData=${(t1 - t0).toFixed(1)}ms usePersonSelection=${(t2 - t1).toFixed(1)}ms buildFlowLayout=${(t3 - t2).toFixed(1)}ms (${allocationList.length} rows, ${orgIds.length} orgs)`)

  const ctxValue: OrgViewContextValue = useMemo(() => ({
    ...createNoOpOrgViewHandlers(),
    organizations:       afterOrganizations,
    orgById:             new Map(afterOrganizations.map(o => [o.id, o])),
    childrenByOrgId:     new Map(),
    positionTreeByOrgId,
    subtreeCountByOrgId: new Map(),
    afterMembersByOrgId: new Map(),
    afterOrgByCode,
    beforeOrgByCode:     afterOrgByCode, // Phase 1簡略化: before比較機能は使わない
    isSelectMode, selectedPersonIds,
    handlePersonClick,
    selectCard,
  }), [afterOrganizations, positionTreeByOrgId, afterOrgByCode, isSelectMode, selectedPersonIds, handlePersonClick, selectCard])

  // [perf] このレンダーが実際に DOM へ commit されるまでの所要時間
  useEffect(() => {
    const elapsed = performance.now() - renderStartRef.current
    // eslint-disable-next-line no-console
    console.log(`[perf] RealCanvas render→commit: ${elapsed.toFixed(1)}ms (${nodes.length} nodes)`)
  })

  if (allocationList.length === 0) return <div>データ読み込み中...</div>

  return (
    <OrgViewContext.Provider value={ctxValue}>
      <ReactFlowCanvas initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} />
    </OrgViewContext.Provider>
  )
}
