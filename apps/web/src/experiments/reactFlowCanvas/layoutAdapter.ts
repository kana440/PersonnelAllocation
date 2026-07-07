import type { Node, Edge } from '@xyflow/react'
import type { Organization } from '@personnel/domain/schemas'
import { estimateTreeBodyHeight, EST_HEADER_H } from '../../components/canvas/panel/heightEstimate'
import { buildFlowLayout } from './buildFlowLayout'
import type { SyntheticOrg, SyntheticRow } from './syntheticData'
import type { OrgNodeData } from './OrgNode'

/**
 * 合成組織ツリー＋行データ → 既存 computeLayout() で座標計算 → React Flow の Node[]/Edge[] に変換する。
 * レイアウトアルゴリズムは新規実装せず、本番キャンバスと同じものを再利用する（buildFlowLayout 経由）。
 */
export function buildNodesAndEdges(
  orgs: SyntheticOrg[],
  rows: SyntheticRow[],
): { nodes: Node<OrgNodeData>[]; edges: Edge[] } {
  const orgById = new Map<string, Organization>(
    orgs.map(o => [o.id, { id: o.id, name: o.name, companyId: 'synthetic', parentId: o.parentId, level: 1 }]),
  )

  const rowsByOrgId = new Map<string, SyntheticRow[]>()
  for (const r of rows) {
    const arr = rowsByOrgId.get(r.departmentCode)
    if (arr) arr.push(r)
    else rowsByOrgId.set(r.departmentCode, [r])
  }

  return buildFlowLayout<OrgNodeData>({
    orgIds:   orgs.map(o => o.id),
    orgById,
    nodeType: 'orgNode',
    estimateHeight: orgId => EST_HEADER_H + estimateTreeBodyHeight(rowsByOrgId.get(orgId)?.length ?? 0),
    buildData:      orgId => ({ name: orgById.get(orgId)?.name ?? orgId, rows: rowsByOrgId.get(orgId) ?? [] }),
  })
}
