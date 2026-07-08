import { useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { useReviewFilterStore } from '../../../store/reviewFilterStore'
import { useReviewData } from '../../review/hooks/useReviewData'
import { buildOrgPathMap } from '../../review/components/BulkFieldEditModal/helpers'
import { parseSearchTokens, buildIssueGroups } from '../../review/UnifiedReviewView/helpers'
import { normalizeName }     from '../../../utils/normalizeSearch'
import { buildPositionDepthList, makeRowComparator } from '../../canvas/panel/helpers'
import type { EditPattern } from '@personnel/domain/patterns/editPattern'
import type { IssueGroupDef } from '../../review/UnifiedReviewView/types'

export interface CompactPersonRow {
  rowId:       number
  name:        string
  patterns:    Set<EditPattern>
  hasChanges:  boolean
  hasIssues:   boolean
  userId:      string | undefined
  isConcurrent: boolean
}

export interface CompactOrgSection {
  orgId:        string | null
  orgCode:      string
  orgName:      string
  orgPath:      string
  rows:         CompactPersonRow[]
  isUnmapped:   boolean
  /** このセクションが「旧」組織データ由来か（新モードのフォールバックは旧、旧モードの主軸は旧） */
  isOldSection: boolean
}

export interface CompactData {
  sections:       CompactOrgSection[]
  totalCount:     number
  changedCount:   number
  patternCounts:  Partial<Record<EditPattern, number>>
  filteredRowIds: number[]       // 現在のフィルタ条件にマッチする全行ID（全選択に使用）
  issueGroups:    IssueGroupDef[] // 全行から算出した問題グループ（バッジ・一括修正に使用）
}

export function useCompactData(): CompactData {
  // useScopedStore() はセレクタなしで全ストアを購読するため使わない
  const afterOrganizations  = useStore(s => s.afterOrganizations)
  const beforeOrganizations = useStore(s => s.organizations)
  const persons             = useStore(s => s.persons)
  const masters             = useStore(s => s.masters)
  const reviewData = useReviewData()

  // SF Person ID → Person UUID のルックアップ（ドラッグ用）
  const personUUIDBysfId = useMemo(
    () => new Map(persons.filter(p => p.sfPersonId).map(p => [p.sfPersonId!, p.id])),
    [persons],
  )

  const searchInput    = useReviewFilterStore(s => s.searchInput)
  const showOldOrg     = useReviewFilterStore(s => s.showOldOrg)
  const activePatterns     = useReviewFilterStore(s => s.filter.activePatterns)
  const issuesOnly         = useReviewFilterStore(s => s.filter.issuesOnly)
  const changedOnly        = useReviewFilterStore(s => s.filter.changedOnly)
  const activeIssueKey = useReviewFilterStore(s => s.filter.activeIssueKey)
  const showMembersOnly = useReviewFilterStore(s => s.showMembersOnly)

  const afterOrgByCode = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations],
  )
  const beforeOrgByCode = useMemo(
    () => new Map(beforeOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [beforeOrganizations],
  )
  const afterPathMap  = useMemo(() => buildOrgPathMap(afterOrganizations),  [afterOrganizations])
  const beforePathMap = useMemo(() => buildOrgPathMap(beforeOrganizations), [beforeOrganizations])

  const searchTokens = useMemo(() => parseSearchTokens(searchInput), [searchInput])

  // showOldOrg に応じて「主グルーピング軸」と「反対側（旧⇄新のフォールバック）」を入れ替える。
  // 主軸に組織が無い/解決できない行は、反対側の組織でグループ化して末尾に表示する
  // （新モードなら「旧:」、旧モードなら「【新のみ】」）— どちらのモードでも行が消えないようにするため。
  const primaryOrgByCode     = showOldOrg ? beforeOrgByCode : afterOrgByCode
  const primaryPathMap       = showOldOrg ? beforePathMap   : afterPathMap
  const counterpartOrgByCode = showOldOrg ? afterOrgByCode  : beforeOrgByCode
  const counterpartPathMap   = showOldOrg ? afterPathMap    : beforePathMap

  const getPrimaryCode = (row: typeof reviewData.rows[number]['row']): string | undefined =>
    (showOldOrg ? row.prevDepartmentCode : row.departmentCode) as string | undefined
  const getCounterpartCode = (row: typeof reviewData.rows[number]['row']): string | undefined =>
    (showOldOrg ? row.departmentCode : row.prevDepartmentCode) as string | undefined

  // 全行からorgコードを収集（showMembersOnly=false 時に空セクションを作る用）。
  // primaryOrgByCode に実在しないコード（フォールバック行が使う側のコード）を混入させると、
  // orgId が解決できない空のゴーストセクション（クリックしても反応しない）ができてしまうため、
  // 実在する組織コードのみを対象にする。
  const allUsedOrgCodes = useMemo<Set<string> | null>(() => {
    if (showMembersOnly) return null
    const codes = new Set<string>()
    for (const rr of reviewData.rows) {
      if (!rr.personName && !rr.row.userId) continue
      const code = getPrimaryCode(rr.row)
      if (code && primaryOrgByCode.has(code)) codes.add(code)
    }
    return codes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMembersOnly, reviewData.rows, showOldOrg, primaryOrgByCode])

  // 検索・フィルタにマッチする行（変更種別チップ自体の絞り込み＝activePatterns は含めない）。
  // チップは OR 条件の複数選択 UI なので、各チップの件数バッジは「他のチップが選択されていても
  // 検索ボックスだけで絞り込んだ場合の本来の該当数」を示すべきで、選択中の他チップによって
  // さらに狭まった数を出すと「クリックするたびに他のチップの件数が減っていく」ミスリーディングな
  // 見え方になる。そのため patternCounts はこちら（filteredForCounts）から算出し、
  // 実際に一覧へ表示する行（filtered）だけを activePatterns でさらに絞り込む。
  const filteredForCounts = useMemo(() => {
    return reviewData.rows.flatMap(rr => {
      const { row, activePatterns: rowPatterns, issues, personName } = rr
      if (!personName && !row.userId) return []

      const name = personName || `行 ${row.rowId}`

      if (issuesOnly  && issues.length === 0)    return []
      if (changedOnly && rr.changes.diffCount === 0) return []
      if (activeIssueKey && !issues.some(i => (i.id ? `${i.id}::${String(i.field)}` : i.message) === activeIssueKey)) return []

      const orgCode        = getPrimaryCode(row)
      const counterpartCode = getCounterpartCode(row)
      const orgPath = orgCode
        ? (primaryPathMap.get(orgCode) ?? orgCode)
        : (counterpartCode ? (counterpartPathMap.get(counterpartCode) ?? counterpartCode) : '')

      if (searchTokens.length > 0) {
        // normalizeName: スペース除去 + ひらがな→カタカナ + NFKC + lowercase
        // クエリ・対象の両方に同じ正規化を適用することで:
        //   - スペースなし入力（"田中太郎"）でスペースあり氏名（"田中 太郎"）にヒット
        //   - ひらがな入力（"たなか"）でカタカナふりがな（"タナカ"）にヒット
        const hit = searchTokens.some(t => {
          const q = normalizeName(t)
          return (
            normalizeName(name).includes(q) ||
            normalizeName([row.lastName, row.firstName].filter(Boolean).join('')).includes(q) ||
            normalizeName([row.lastNameKana, row.firstNameKana].filter(Boolean).join('')).includes(q) ||
            normalizeName(row.lastNameKana  ?? '').includes(q) ||
            normalizeName(row.firstNameKana ?? '').includes(q) ||
            normalizeName(orgPath).includes(q)
          )
        })
        if (!hit) return []
      }

      return [{
        rowId:        row.rowId,
        name,
        patterns:     rowPatterns,
        hasChanges:   rr.changes.diffCount > 0,
        hasIssues:    issues.length > 0,
        userId:       row.userId ? (personUUIDBysfId.get(row.userId as string) ?? row.userId as string) : undefined,
        isConcurrent: row.concurrentType === '兼務',
        _orgCode:        orgCode,
        _counterpartCode: counterpartCode,
      }] as (CompactPersonRow & { _orgCode: string | undefined; _counterpartCode: string | undefined })[]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData.rows, searchTokens, showOldOrg, afterPathMap, beforePathMap,
      issuesOnly, changedOnly, activeIssueKey, personUUIDBysfId])

  const filtered = useMemo(() => {
    if (activePatterns.size === 0) return filteredForCounts
    return filteredForCounts.filter(r => [...activePatterns].some(p => r.patterns.has(p)))
  }, [filteredForCounts, activePatterns])

  // rowId → 表示順インデックス。組織図の通常表示・表形式と同じ「ライン長が先頭→
  // 配下はバンド降順」の階層順（buildPositionDepthList + makeRowComparator）をNavバーにも揃える。
  // 主軸の組織がある行は主軸の positionCode 系で、無い行（反対側フォールバック）は反対側の
  // positionCode 系でグループ化する（キーを分けて混在させない）。
  const orderIndexByRowId = useMemo(() => {
    const byKey = new Map<string, { rows: typeof reviewData.rows; useOld: boolean }>()
    for (const rr of reviewData.rows) {
      const primaryCode = getPrimaryCode(rr.row)
      const code = primaryCode ?? getCounterpartCode(rr.row)
      if (!code) continue
      const useOld = primaryCode ? showOldOrg : !showOldOrg
      const key = `${useOld}:${code}`
      const bucket = byKey.get(key)
      if (bucket) bucket.rows.push(rr)
      else byKey.set(key, { rows: [rr], useOld })
    }
    const map = new Map<number, number>()
    for (const { rows, useOld } of byKey.values()) {
      const rowComparator = makeRowComparator(masters, useOld ? 'prevPositionBand' : 'positionBand')
      const sorted = [...rows].sort((a, b) => rowComparator(a.row, b.row))
      const depthList = useOld
        ? buildPositionDepthList(sorted.map(rr => rr.row), r => r.prevPositionCode, r => r.prevManagerPositionCode)
        : buildPositionDepthList(sorted.map(rr => rr.row), r => r.positionCode, r => r.managerPositionCode)
      depthList.forEach(({ row }, i) => map.set(row.rowId, i))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData.rows, showOldOrg, masters])

  const sections = useMemo(() => {
    const normalMap      = new Map<string, CompactOrgSection>()
    const counterpartMap = new Map<string, CompactOrgSection>()

    const makePrimarySection = (orgCode: string): CompactOrgSection => {
      const org     = primaryOrgByCode.get(orgCode)
      const orgPath = primaryPathMap.get(orgCode) ?? orgCode
      // 「旧」かどうかはバッジ・配色で示す（OrgSection.tsx側）。名前文字列への埋め込みはしない
      return { orgId: org?.id ?? null, orgCode, orgName: org?.name ?? orgCode, orgPath, rows: [], isUnmapped: false, isOldSection: showOldOrg }
    }

    const makeCounterpartSection = (orgCode: string): CompactOrgSection => {
      const org  = counterpartOrgByCode.get(orgCode)
      const path = counterpartPathMap.get(orgCode) ?? orgCode
      return {
        orgId: org?.id ?? null, orgCode, orgName: org?.name ?? orgCode, orgPath: `_unmapped_${path}`,
        rows: [], isUnmapped: true, isOldSection: !showOldOrg,
      }
    }

    // showMembersOnly=false: 全使用orgコードを空セクションとして先に登録
    if (allUsedOrgCodes) {
      for (const orgCode of allUsedOrgCodes) {
        if (!orgCode) continue
        if (!normalMap.has(orgCode)) normalMap.set(orgCode, makePrimarySection(orgCode))
      }
    }

    // 検索マッチ行をセクションに追加
    for (const r of filtered) {
      const { _orgCode, _counterpartCode, ...row } = r as CompactPersonRow & {
        _orgCode: string | undefined; _counterpartCode: string | undefined
      }
      const orgCode = _orgCode

      if (!orgCode || !primaryOrgByCode.has(orgCode)) {
        if (_counterpartCode) {
          if (!counterpartMap.has(_counterpartCode)) counterpartMap.set(_counterpartCode, makeCounterpartSection(_counterpartCode))
          counterpartMap.get(_counterpartCode)!.rows.push(row)
          continue
        }
        if (!counterpartMap.has('__none__')) {
          counterpartMap.set('__none__', { orgId: null, orgCode: '', orgName: '（組織未設定）', orgPath: '', rows: [], isUnmapped: true, isOldSection: false })
        }
        counterpartMap.get('__none__')!.rows.push(row)
        continue
      }

      if (!normalMap.has(orgCode)) normalMap.set(orgCode, makePrimarySection(orgCode))
      normalMap.get(orgCode)!.rows.push(row)
    }

    // 各セクション内の人を「ライン長→バンド降順」の階層順に並べ替える（キャンバス・表形式と同じ順）
    for (const section of [...normalMap.values(), ...counterpartMap.values()]) {
      section.rows.sort((a, b) => (orderIndexByRowId.get(a.rowId) ?? 0) - (orderIndexByRowId.get(b.rowId) ?? 0))
    }

    const sortedNormal      = [...normalMap.values()].sort((a, b) => a.orgPath.localeCompare(b.orgPath, 'ja'))
    const sortedCounterpart = [...counterpartMap.values()].sort((a, b) => a.orgName.localeCompare(b.orgName, 'ja'))
    return [...sortedNormal, ...sortedCounterpart]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, allUsedOrgCodes, showOldOrg, afterOrgByCode, beforeOrgByCode, afterPathMap, beforePathMap, orderIndexByRowId])

  const { totalCount, changedCount, filteredRowIds } = useMemo(() => {
    let changed = 0
    const ids: number[] = []
    for (const rr of filtered) {
      ids.push(rr.rowId)
      if (rr.hasChanges) changed++
    }
    return { totalCount: filtered.length, changedCount: changed, filteredRowIds: ids }
  }, [filtered])

  // 種別チップの件数バッジ: 検索・全体/変更/問題フィルタのみを反映し、他チップの選択状態には影響されない
  const patternCounts = useMemo(() => {
    const counts: Partial<Record<EditPattern, number>> = {}
    for (const rr of filteredForCounts) {
      for (const p of rr.patterns) { counts[p] = (counts[p] ?? 0) + 1 }
    }
    return counts
  }, [filteredForCounts])

  // 要確認チップの件数バッジ用: 検索テキストのみで絞り込む（issueKey 自体の選択状態には影響されない。
  // 選択中の他チップによってさらに件数が狭まるとミスリーディングになるため、種別チップと同じ方針にする）
  const filteredForIssueGroups = useMemo(() => {
    if (searchTokens.length === 0) return reviewData.rows
    return reviewData.rows.filter(rr => {
      const { row, personName } = rr
      const name = personName || `行 ${row.rowId}`
      const orgCode         = getPrimaryCode(row)
      const counterpartCode = getCounterpartCode(row)
      const orgPath = orgCode
        ? (primaryPathMap.get(orgCode) ?? orgCode)
        : (counterpartCode ? (counterpartPathMap.get(counterpartCode) ?? counterpartCode) : '')
      return searchTokens.some(t => {
        const q = normalizeName(t)
        return (
          normalizeName(name).includes(q) ||
          normalizeName([row.lastName, row.firstName].filter(Boolean).join('')).includes(q) ||
          normalizeName([row.lastNameKana, row.firstNameKana].filter(Boolean).join('')).includes(q) ||
          normalizeName(row.lastNameKana  ?? '').includes(q) ||
          normalizeName(row.firstNameKana ?? '').includes(q) ||
          normalizeName(orgPath).includes(q)
        )
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewData.rows, searchTokens, showOldOrg, afterPathMap, beforePathMap])

  const issueGroups = useMemo(() => buildIssueGroups(filteredForIssueGroups), [filteredForIssueGroups])

  return { sections, totalCount, changedCount, patternCounts, filteredRowIds, issueGroups }
}
