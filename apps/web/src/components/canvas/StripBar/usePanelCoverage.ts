import { useMemo }            from 'react'
import { useStore }            from '../../../store/useStore'
import { buildOrgMap }         from '@personnel/domain/rules/options/rows'
import { getDescendantOrgIds } from '@personnel/domain/rules/options/orgTree'
import type { PanelDef }       from '../../../store/canvasLayoutStore'

export interface CandidateOrg {
  orgId:   string
  orgName: string
  /** このorg配下（配下含む）の未網羅人数 */
  uncoveredCount: number
}

/**
 * 現在のパネルで網羅されていない人物をグループ化し、追加候補の組織リストを返す。
 *
 * 候補の条件:
 *   - 直接（departmentCode が一致）する未網羅メンバーが 1 人以上いる組織
 *   - かつ、それら組織の中で「直属メンバーがいる最上位の共通祖先」でまとめる
 *
 * こうすることで、直属0の中間ノードが候補として出ることを防ぐ。
 */
export function usePanelCoverage(panels: PanelDef[]): CandidateOrg[] {
  const { allocationList, afterOrganizations } = useStore()

  return useMemo(() => {
    // ── パネルが網羅する組織IDセット ──────────────────────────────
    const coveredOrgIds = new Set<string>()
    for (const panel of panels) {
      const desc = getDescendantOrgIds(panel.orgId, afterOrganizations)
      for (const id of desc) coveredOrgIds.add(id)
    }

    const orgByCode = buildOrgMap(afterOrganizations)
    const orgById   = new Map(afterOrganizations.map(o => [o.id, o]))

    // ── Step1: 直属の未網羅メンバー数を org ごとに集計 ──────────
    const directByOrg = new Map<string, number>()
    for (const r of allocationList) {
      if (!r.userId || !r.departmentCode) continue
      const org = orgByCode.get(r.departmentCode)
      if (!org || coveredOrgIds.has(org.id)) continue
      directByOrg.set(org.id, (directByOrg.get(org.id) ?? 0) + 1)
    }

    if (directByOrg.size === 0) return []

    // ── Step2: 各 org の「直属メンバーがいる最上位祖先」を求める ─
    // ・直属メンバーがいる org のみを候補とし、親方向に辿る
    // ・親が coveredOrgIds なら止まる
    // ・親が directByOrg に含まれる（= 親にも直属メンバーがいる）なら上に進む
    const topByOrg = new Map<string, string>()  // orgId → topCandidateId

    for (const orgId of directByOrg.keys()) {
      let top = orgId
      let cur = orgById.get(orgId)
      while (cur?.parentId) {
        if (coveredOrgIds.has(cur.parentId)) break  // 親がパネル配下 → ここが上限
        const parent = orgById.get(cur.parentId)
        if (!parent) break
        if (directByOrg.has(parent.id)) top = parent.id  // 親にも直属メンバー → 統合
        cur = parent
      }
      topByOrg.set(orgId, top)
    }

    // ── Step3: topOrg ごとに未網羅人数を合算 ─────────────────────
    const totalByTop = new Map<string, number>()
    for (const [orgId, count] of directByOrg) {
      const top = topByOrg.get(orgId)!
      totalByTop.set(top, (totalByTop.get(top) ?? 0) + count)
    }

    return [...totalByTop.entries()]
      .map(([orgId, uncoveredCount]) => ({
        orgId,
        orgName: orgById.get(orgId)?.name ?? orgId,
        uncoveredCount,
      }))
      .sort((a, b) => b.uncoveredCount - a.uncoveredCount)
  }, [panels, allocationList, afterOrganizations])
}
