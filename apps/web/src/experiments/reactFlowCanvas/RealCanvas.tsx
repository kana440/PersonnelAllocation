import { useMemo, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../store/useStore'
import { useScopedStore } from '../../store/useScopedStore'
import { useOrgViewData } from '../../components/canvas/hooks/useOrgViewData'
import { usePersonSelection } from '../../components/canvas/OrgOperationView/usePersonSelection'
import { OrgViewContext } from '../../components/canvas/OrgViewContext'
import type { OrgViewContextValue } from '../../components/canvas/OrgViewContext'
import { buildFlowLayout, NODE_MAX_HEIGHT } from './buildFlowLayout'
import { createNoOpOrgViewHandlers } from './noOpOrgViewHandlers'
import { ReactFlowCanvas } from './ReactFlowCanvas'
import { RealOrgNode } from './RealOrgNode'
import type { RealOrgNodeData } from './RealOrgNode'

const nodeTypes = { realOrgNode: RealOrgNode }

/**
 * Phase 1: 合成データを本物の store に注入した後、本物の RowCard・useOrgViewData・
 * usePersonSelection を使って React Flow キャンバスを構築する。
 * ドラッグ&ドロップの実際の異動処理は no-op（createNoOpOrgViewHandlers 参照。console.log でイベント発火のみ確認）。
 *
 * [検証] 画面上部のボタンから本物の appService.saveRow（＝ DirectEditOperation 経由の
 * 実際のドメイン変更）を1件発火できる。ドラッグUIは再現せず、変更後の再描画コストだけを
 * render body / render→commit ログで測る（Phase 1 で未検証だった「編集が絡んだ場合」の確認）。
 */
export function RealCanvas() {
  // [perf] render開始 → 実際に DOM へ commit されるまでの実測
  const renderStartRef = useRef(performance.now())
  renderStartRef.current = performance.now()

  const { beforeOrganizations, orgMapping, masters, saveRow } = useStore(useShallow(s => ({
    beforeOrganizations: s.beforeOrganizations,
    orgMapping:          s.orgMapping,
    masters:             s.masters,
    saveRow:             s.saveRow,
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

  // 組織ID → 子 Organization[]（実測後の高さ差分を子孫に反映する際に使う。RealOrgNode 参照）
  const childrenByOrgId = useMemo(() => {
    const map = new Map<string, typeof afterOrganizations>()
    for (const org of afterOrganizations) {
      if (!org.parentId) continue
      const arr = map.get(org.parentId)
      if (arr) arr.push(org)
      else map.set(org.parentId, [org])
    }
    return map
  }, [afterOrganizations])

  const { nodes, edges, rootNodeIds } = useMemo(() => {
    const orgById = new Map(afterOrganizations.map(o => [o.id, o]))
    return buildFlowLayout<RealOrgNodeData>({
      orgIds, orgById,
      nodeType:      'realOrgNode',
      defaultHeight: NODE_MAX_HEIGHT,
      buildData:     orgId => ({ name: orgById.get(orgId)?.name ?? orgId }),
    })
  }, [orgIds, afterOrganizations])
  const t3 = performance.now()
  // eslint-disable-next-line no-console
  console.log(`[perf] RealCanvas render body: useOrgViewData=${(t1 - t0).toFixed(1)}ms usePersonSelection=${(t2 - t1).toFixed(1)}ms buildFlowLayout=${(t3 - t2).toFixed(1)}ms (${allocationList.length} rows, ${orgIds.length} orgs)`)

  const ctxValue: OrgViewContextValue = useMemo(() => ({
    ...createNoOpOrgViewHandlers(),
    organizations:       afterOrganizations,
    orgById:             new Map(afterOrganizations.map(o => [o.id, o])),
    childrenByOrgId,
    positionTreeByOrgId,
    subtreeCountByOrgId: new Map(),
    afterMembersByOrgId: new Map(),
    afterOrgByCode,
    beforeOrgByCode:     afterOrgByCode, // Phase 1簡略化: before比較機能は使わない
    isSelectMode, selectedPersonIds,
    handlePersonClick,
    selectCard,
  }), [afterOrganizations, childrenByOrgId, positionTreeByOrgId, afterOrgByCode, isSelectMode, selectedPersonIds, handlePersonClick, selectCard])

  // [perf] このレンダーが実際に DOM へ commit されるまでの所要時間
  useEffect(() => {
    const elapsed = performance.now() - renderStartRef.current
    // eslint-disable-next-line no-console
    console.log(`[perf] RealCanvas render→commit: ${elapsed.toFixed(1)}ms (${nodes.length} nodes)`)
  })

  if (allocationList.length === 0) return <div>データ読み込み中...</div>

  // [検証用] 本物の saveRow(=DirectEditOperation経由の実ドメイン変更)を1件だけ発火する。
  // 変更後の再描画コストは上の render body / render→commit ログにそのまま出る。
  const handleTestMutation = () => {
    const row = allocationList[Math.floor(Math.random() * allocationList.length)]
    if (!row) return
    const fromOrg = afterOrgByCode.get(row.departmentCode ?? '')
    const candidates = afterOrganizations.filter(o => o.id !== fromOrg?.id)
    const target = candidates[Math.floor(Math.random() * candidates.length)]
    if (!target) return
    // eslint-disable-next-line no-console
    console.log(`[perf] mutation trigger: rowId=${row.rowId} ${row.lastName}${row.firstName} 「${fromOrg?.name ?? row.departmentCode}」→「${target.name}」`)
    saveRow(row.rowId, { departmentCode: target.externalCode ?? target.id })
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <button
        onClick={handleTestMutation}
        style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, padding: '6px 10px', background: '#c0392b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}
      >
        テスト編集を1件実行（コンソールで render→commit を確認）
      </button>
      <OrgViewContext.Provider value={ctxValue}>
        <ReactFlowCanvas initialNodes={nodes} initialEdges={edges} nodeTypes={nodeTypes} rootNodeIds={rootNodeIds} />
      </OrgViewContext.Provider>
    </div>
  )
}
