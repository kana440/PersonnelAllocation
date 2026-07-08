import { ALLOCATION_LIST_FIELDS } from '@personnel/domain/csvImport/allocationList/labels'
import type { Organization } from '@personnel/domain/schemas'
import type { ReviewRow } from '../review/hooks/useReviewData'
import type { GroupedItem } from './MergeReviewTable'

export const FIELD_LABEL_MAP = new Map(
  ALLOCATION_LIST_FIELDS.map(f => [f.key, (f.header ?? f.key).replace(/_新$/, '')])
)
export const fieldLabel = (key: string) => FIELD_LABEL_MAP.get(key) ?? key

/**
 * レビュー対象行を「新しい方の新の組織」（row.departmentCode。useMergeReviewData が
 * 候補行=incomingRow を仮想行の row として既にセットしている）でグループ化する。
 * 旧組織は各行の参考列として出すのみでグルーピング軸にはしない。
 */
export function groupRowsByOrg(
  rows:          ReviewRow[],
  orgPathMap:    Map<string, string>,
  afterOrgByCode: Map<string, Organization>,
): GroupedItem[] {
  const byCode = new Map<string, ReviewRow[]>()
  const noOrgRows: ReviewRow[] = []
  for (const rr of rows) {
    const code = rr.row.departmentCode as string | undefined
    if (!code) { noOrgRows.push(rr); continue }
    const arr = byCode.get(code)
    if (arr) arr.push(rr); else byCode.set(code, [rr])
  }
  const sortedCodes = [...byCode.keys()].sort((a, b) =>
    (orgPathMap.get(a) ?? a).localeCompare(orgPathMap.get(b) ?? b, 'ja')
  )
  const items: GroupedItem[] = []
  for (const code of sortedCodes) {
    const groupRows = byCode.get(code)!
    items.push({
      kind: 'org-header', orgCode: code,
      orgName: afterOrgByCode.get(code)?.name ?? code,
      orgPath: orgPathMap.get(code) ?? code,
      rowCount: groupRows.length,
    })
    for (const rr of groupRows) items.push({ kind: 'row', reviewRow: rr })
  }
  if (noOrgRows.length > 0) {
    items.push({ kind: 'org-header', orgCode: '', orgName: '未設定', orgPath: '', rowCount: noOrgRows.length })
    for (const rr of noOrgRows) items.push({ kind: 'row', reviewRow: rr })
  }
  return items
}
