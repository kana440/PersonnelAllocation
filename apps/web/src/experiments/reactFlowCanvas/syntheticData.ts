// React Flow 実験用の合成データ生成（ビジネスロジックなし）。
// 本番の Organization/AllocationRow を模した最小限の形だけを持つ。

export interface SyntheticOrg {
  id:       string
  name:     string
  parentId: string | null
}

export interface SyntheticRow {
  rowId:          number
  departmentCode: string // = SyntheticOrg.id
  name:           string
  // Phase 1（実データ接続）で AllocationRow に変換するためのフィールド
  userId:         string
  lastName:       string
  firstName:      string
  positionCode:   string
}

// 決定的な擬似乱数（mulberry32）。毎回同じ形のツリーで比較できるようにする。
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MAX_CHILDREN_PER_ORG = 8
/** 全体のうちメガ組織（数百人規模）にする件数 */
const MEGA_ORG_COUNT = 5
const MEGA_ORG_ROWS  = [400, 550, 650, 800, 950]

export function generateSyntheticOrgs(orgCount: number, seed = 1): SyntheticOrg[] {
  const rand = mulberry32(seed)
  const orgs: SyntheticOrg[] = [{ id: 'org-0', name: '本社', parentId: null }]
  // 子をまだ MAX_CHILDREN_PER_ORG 未満しか持たない org の id 一覧（新規ノードの親候補）
  const openParents: string[] = ['org-0']
  const childCount = new Map<string, number>([['org-0', 0]])

  for (let i = 1; i < orgCount; i++) {
    const parentIdx  = Math.floor(rand() * openParents.length)
    const parentId   = openParents[parentIdx]
    const id         = `org-${i}`
    orgs.push({ id, name: `組織${i}`, parentId })

    const n = (childCount.get(parentId) ?? 0) + 1
    childCount.set(parentId, n)
    if (n >= MAX_CHILDREN_PER_ORG) openParents.splice(parentIdx, 1)

    childCount.set(id, 0)
    openParents.push(id)
  }
  return orgs
}

export function generateSyntheticRows(orgs: SyntheticOrg[], rowCount: number, seed = 2): SyntheticRow[] {
  const rand = mulberry32(seed)
  const rows: SyntheticRow[] = []
  let rowId = 1

  // メガ組織: ランダムに選んだ数組織へ大量の行を割り当てる
  const megaOrgIdxs = new Set<number>()
  while (megaOrgIdxs.size < Math.min(MEGA_ORG_COUNT, orgs.length)) {
    megaOrgIdxs.add(Math.floor(rand() * orgs.length))
  }
  let remaining = rowCount
  let megaI = 0
  const makeRow = (departmentCode: string, id: number, lastName: string): SyntheticRow => ({
    rowId: id, departmentCode, name: `${lastName}${id}`,
    userId: `u-${id}`, lastName, firstName: '太郎', positionCode: `pos-${id}`,
  })

  for (const idx of megaOrgIdxs) {
    const n = Math.min(MEGA_ORG_ROWS[megaI++] ?? 400, remaining)
    for (let k = 0; k < n; k++) {
      const id = rowId++
      rows.push(makeRow(orgs[idx].id, id, '合成太郎'))
    }
    remaining -= n
  }

  // 残りは全組織にランダムに分配（0〜20名程度）
  while (remaining > 0) {
    const org = orgs[Math.floor(rand() * orgs.length)]
    const id = rowId++
    rows.push(makeRow(org.id, id, '合成花子'))
    remaining--
  }
  return rows
}

export function generateSyntheticData(orgCount: number, rowCount: number) {
  const orgs = generateSyntheticOrgs(orgCount)
  const rows = generateSyntheticRows(orgs, rowCount)
  return { orgs, rows }
}
