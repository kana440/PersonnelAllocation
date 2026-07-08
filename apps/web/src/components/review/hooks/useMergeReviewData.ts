import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../../store/useStore'
import { validateRow } from '@personnel/domain/rules/validate/validateRow'
import { detectPatterns, type DetectContext } from '@personnel/domain/patterns/detection'
import { RowRuleCtx } from '@personnel/domain/rules/rowRule'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { MergeSessionRow } from '../../../infrastructure/workspace'
import type { ReviewRow } from './useReviewData'

export interface MergeReviewData {
  /** UnifiedTable/FilterBar にそのまま渡せる仮想 ReviewRow[]（実ストアには反映しない） */
  rows:          ReviewRow[]
  /** 仮想行の rowId（合成キー） → MergeSessionRow.key（row.no）の対応表。選択結果を戻すときに使う */
  keyByRowId:    Map<number, string>
  /** MergeSessionRow.key → その仮想行の kind（表示・一括操作の絞り込みに使用） */
  kindByKey:     Map<string, MergeSessionRow['kind']>
}

// 実データの rowId 空間と衝突しないよう、仮想行には大きなオフセットを振る
const VIRTUAL_ROW_ID_BASE = 1_000_000_000

/**
 * key（row.no）から決定的な仮想 rowId を作る。配列インデックスを使わないのは、
 * 承認により表示対象の配列が縮むたびに同じ行が別の rowId を割り当てられてしまい、
 * 選択状態（Set<number>）が別の行を指してしまうのを防ぐため。
 */
function stableVirtualRowId(key: string): number {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return VIRTUAL_ROW_ID_BASE + (hash >>> 0)
}

/**
 * 保留中のマージ/リベース候補行（MergeSessionRow[]）を「もし適用したら」の仮想 ReviewRow[]
 * として計算する。既存の useReviewData.ts と同じ下位の純粋関数（detectPatterns/validateRow）を
 * 再利用するが、ライブストア（useScopedStore）とは無関係な並行実装にする
 * （useReviewData.ts 本体・useScopedStore は変更しない）。
 */
export function useMergeReviewData(sessionRows: MergeSessionRow[]): MergeReviewData {
  const { allocationList, afterOrganizations, masters, persons } = useStore(
    useShallow(s => ({
      allocationList:     s.allocationList,
      afterOrganizations: s.afterOrganizations,
      masters:            s.masters,
      persons:            s.persons,
    }))
  )

  const allocationByNo = useMemo(() => {
    const map = new Map<string, AllocationRow>()
    for (const r of allocationList) { if (r.no) map.set(r.no, r) }
    return map
  }, [allocationList])

  const personBySfId = useMemo(
    () => new Map(persons.map(p => [p.sfPersonId ?? '', p])),
    [persons],
  )

  const detectCtx = useMemo((): DetectContext => ({
    allocationList,
    afterOrganizations,
    masters,
    sameOrgPairs: new Set(),
  }), [allocationList, afterOrganizations, masters])

  const rowRuleCtx = useMemo(() => new RowRuleCtx(masters, afterOrganizations), [masters, afterOrganizations])

  // 「もし今表示中の候補行を全部反映したら」を模した仮想リスト。
  // E系（上司ポジション存在・循環）・G/W系（バンド整合・上司組織）の単行チェックに
  // 実データ相当のクロス行コンテキストを与えるために使う（[] だと何もヒットしない）。
  // 真の一括バリデーション（INTER_ROW_RULES によるポジション重複等）はここでは行わず、
  // コミット後の既存「要確認」タブ（batchValidate）に委ねる。
  const hypotheticalList = useMemo(() => {
    const modifiedByRowId = new Map<number, AllocationRow>()
    const addedRows: AllocationRow[] = []
    for (const sr of sessionRows) {
      if (!sr.incomingRow) continue
      if (sr.kind === 'modified') {
        const current = allocationByNo.get(sr.key)
        if (current) modifiedByRowId.set(current.rowId, { ...sr.incomingRow, rowId: current.rowId })
      } else if (sr.kind === 'added') {
        addedRows.push(sr.incomingRow)
      }
    }
    const replaced = allocationList.map(r => modifiedByRowId.get(r.rowId) ?? r)
    return addedRows.length > 0 ? [...replaced, ...addedRows] : replaced
  }, [sessionRows, allocationList, allocationByNo])

  return useMemo((): MergeReviewData => {
    const rows: ReviewRow[] = []
    const keyByRowId = new Map<number, string>()
    const kindByKey  = new Map<string, MergeSessionRow['kind']>()

    sessionRows.forEach(sr => {
      kindByKey.set(sr.key, sr.kind)

      // 表示対象の行を決定: added/modified は候補行（incomingRow）、removed は現在の行
      const baseRow = sr.kind === 'removed' ? allocationByNo.get(sr.key) : sr.incomingRow
      if (!baseRow) return

      const virtualRowId = stableVirtualRowId(sr.key)
      const row: AllocationRow = { ...baseRow, rowId: virtualRowId }
      keyByRowId.set(virtualRowId, sr.key)

      const changes = detectPatterns(row, detectCtx)
      const person  = row.userId ? personBySfId.get(row.userId as string) : undefined
      rows.push({
        row,
        changes,
        activePatterns: changes.patterns,
        issues:         validateRow({ row, afterOrganizations, masters, allocationList: hypotheticalList, changes, rowRuleCtx }),
        personName:     person?.name ?? [row.lastName, row.firstName].filter(Boolean).join(''),
      })
    })

    return { rows, keyByRowId, kindByKey }
  }, [sessionRows, allocationByNo, detectCtx, hypotheticalList, afterOrganizations, masters, rowRuleCtx, personBySfId])
}
