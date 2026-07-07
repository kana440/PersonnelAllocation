import { useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { useReviewFilterStore } from '../../../store/reviewFilterStore'
import { useReviewData } from '../../review/hooks/useReviewData'
import { buildOrgPathMap } from '../../review/components/BulkFieldEditModal/helpers'
import { parseSearchTokens, buildIssueGroups } from '../../review/UnifiedReviewView/helpers'
import { normalizeName }     from '../../../utils/normalizeSearch'
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
  orgId:      string | null
  orgCode:    string
  orgName:    string
  orgPath:    string
  rows:       CompactPersonRow[]
  isUnmapped: boolean
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

  // 全行からorgコードを収集（showMembersOnly=false 時に空セクションを作る用）
  const allUsedOrgCodes = useMemo<Set<string> | null>(() => {
    if (showMembersOnly) return null
    const codes = new Set<string>()
    for (const rr of reviewData.rows) {
      if (!rr.personName && !rr.row.userId) continue
      const code = showOldOrg
        ? (rr.row.prevDepartmentCode as string | undefined)
        : (rr.row.departmentCode   as string | undefined)
      if (code) codes.add(code)
    }
    return codes
  }, [showMembersOnly, reviewData.rows, showOldOrg])

  // 検索・フィルタにマッチする行
  const filtered = useMemo(() => {
    return reviewData.rows.flatMap(rr => {
      const { row, activePatterns: rowPatterns, issues, personName } = rr
      if (!personName && !row.userId) return []

      const name = personName || `行 ${row.rowId}`

      if (activePatterns.size > 0 && ![...activePatterns].some(p => rowPatterns.has(p))) return []
      if (issuesOnly  && issues.length === 0)    return []
      if (changedOnly && rr.changes.diffCount === 0) return []
      if (activeIssueKey && !issues.some(i => (i.id ? `${i.id}::${String(i.field)}` : i.message) === activeIssueKey)) return []

      const orgCode = showOldOrg
        ? (row.prevDepartmentCode as string | undefined)
        : (row.departmentCode    as string | undefined)
      const orgPath = orgCode
        ? (showOldOrg ? beforePathMap.get(orgCode) : afterPathMap.get(orgCode)) ?? orgCode
        : ''

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
        _orgCode:     orgCode,
      }] as (CompactPersonRow & { _orgCode: string | undefined })[]
    })
  }, [reviewData.rows, searchTokens, showOldOrg, afterPathMap, beforePathMap,
      activePatterns, issuesOnly, changedOnly, activeIssueKey, personUUIDBysfId])

  const sections = useMemo(() => {
    const normalMap   = new Map<string, CompactOrgSection>()
    const unmappedMap = new Map<string, CompactOrgSection>()

    const makeNormalSection = (orgCode: string): CompactOrgSection => {
      const org     = showOldOrg ? beforeOrgByCode.get(orgCode) : afterOrgByCode.get(orgCode)
      const orgPath = showOldOrg
        ? (beforePathMap.get(orgCode) ?? orgCode)
        : (afterPathMap.get(orgCode)  ?? orgCode)
      return { orgId: org?.id ?? null, orgCode, orgName: org?.name ?? orgCode, orgPath, rows: [], isUnmapped: false }
    }

    const makeUnmappedSection = (orgCode: string): CompactOrgSection => {
      const beforeOrg  = beforeOrgByCode.get(orgCode)
      const orgName    = beforeOrg ? `旧: ${beforeOrg.name}` : `旧: ${orgCode}`
      const beforePath = beforePathMap.get(orgCode) ?? orgCode
      return { orgId: beforeOrg?.id ?? null, orgCode, orgName, orgPath: `_unmapped_${beforePath}`, rows: [], isUnmapped: true }
    }

    // showMembersOnly=false: 全使用orgコードを空セクションとして先に登録
    if (allUsedOrgCodes) {
      for (const orgCode of allUsedOrgCodes) {
        if (!orgCode) continue
        if (!showOldOrg && !afterOrgByCode.has(orgCode)) {
          if (!unmappedMap.has(orgCode)) unmappedMap.set(orgCode, makeUnmappedSection(orgCode))
        } else {
          if (!normalMap.has(orgCode)) normalMap.set(orgCode, makeNormalSection(orgCode))
        }
      }
    }

    // 検索マッチ行をセクションに追加
    for (const r of filtered) {
      const { _orgCode, ...row } = r as CompactPersonRow & { _orgCode: string | undefined }
      const orgCode = _orgCode

      if (!orgCode) {
        if (!unmappedMap.has('__none__')) {
          unmappedMap.set('__none__', { orgId: null, orgCode: '', orgName: '（組織未設定）', orgPath: '', rows: [], isUnmapped: true })
        }
        unmappedMap.get('__none__')!.rows.push(row)
        continue
      }

      if (!showOldOrg && !afterOrgByCode.has(orgCode)) {
        if (!unmappedMap.has(orgCode)) unmappedMap.set(orgCode, makeUnmappedSection(orgCode))
        unmappedMap.get(orgCode)!.rows.push(row)
        continue
      }

      if (!normalMap.has(orgCode)) normalMap.set(orgCode, makeNormalSection(orgCode))
      normalMap.get(orgCode)!.rows.push(row)
    }

    const sortedNormal   = [...normalMap.values()].sort((a, b) => a.orgPath.localeCompare(b.orgPath, 'ja'))
    const sortedUnmapped = [...unmappedMap.values()].sort((a, b) => a.orgName.localeCompare(b.orgName, 'ja'))
    return [...sortedNormal, ...sortedUnmapped]
  }, [filtered, allUsedOrgCodes, showOldOrg, afterOrgByCode, beforeOrgByCode, afterPathMap, beforePathMap])

  const { totalCount, changedCount, patternCounts, filteredRowIds } = useMemo(() => {
    const counts: Partial<Record<EditPattern, number>> = {}
    let changed = 0
    const ids: number[] = []
    for (const rr of filtered) {
      ids.push(rr.rowId)
      if (rr.hasChanges) changed++
      for (const p of rr.patterns) { counts[p] = (counts[p] ?? 0) + 1 }
    }
    return { totalCount: filtered.length, changedCount: changed, patternCounts: counts, filteredRowIds: ids }
  }, [filtered])

  // 問題グループは全行を対象に算出（フィルタ状態に依存しない）
  const issueGroups = useMemo(() => buildIssueGroups(reviewData.rows), [reviewData.rows])

  return { sections, totalCount, changedCount, patternCounts, filteredRowIds, issueGroups }
}
