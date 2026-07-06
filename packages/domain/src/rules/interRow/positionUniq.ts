/**
 * interRow/positionUniq.ts — positionCode 重複チェック
 *
 * ひとつの positionCode に複数の行が紐づく場合（通常ありえない）をエラーとして検出する。
 * 兼務行（concurrentType === '兼務'）は positionCode を共有しないため除外。
 * `_pos_` プレフィックスの内部採番ポジションは採番ロジックが一意性を保証するため除外。
 *
 * パフォーマンス:
 *   buildIndex: O(R) — positionCode → rowId[] の Map
 *   validateRow: O(1) index ルックアップ
 *   validateAll: O(R)
 */

import type { AllocationRow }   from '../../allocationRow'
import type { ValidationIssue } from '../validate/types'
import { defineInterRowRule }   from '../interRowRule'

type PosUniqIndex = Map<string, number[]>  // positionCode → rowId[]

function isExternalPosCode(posCode: string): boolean {
  return !posCode.startsWith('_pos_')
}

function buildIndex(allocationList: readonly AllocationRow[]): PosUniqIndex {
  const index = new Map<string, number[]>()
  for (const r of allocationList) {
    const pos = r.positionCode as string | undefined
    if (!pos || !isExternalPosCode(pos) || r.concurrentType === '兼務') continue
    const existing = index.get(pos)
    if (existing) existing.push(r.rowId)
    else index.set(pos, [r.rowId])
  }
  return index
}

function checkRow(row: AllocationRow, index: PosUniqIndex): ValidationIssue[] {
  const pos = row.positionCode as string | undefined
  if (!pos || !isExternalPosCode(pos) || row.concurrentType === '兼務') return []

  const rowIds = index.get(pos)
  if (!rowIds || rowIds.length <= 1) return []

  return [{
    field:   'positionCode',
    level:   'error',
    message: `ポジションコード "${pos}" が複数の行で重複しています（${rowIds.length}行）`,
    id:      'interrow_pos_duplicate',
  }]
}

export const positionUniqRule = defineInterRowRule<PosUniqIndex>({
  id:    'E2-positionUniq',
  scope: 'state',

  buildIndex,

  validateRow: (row, index, _ctx) => checkRow(row, index),

  validateAll: (allocationList, _ctx) => {
    const index  = buildIndex(allocationList)
    const result = new Map<number, ValidationIssue[]>()
    for (const row of allocationList) {
      const issues = checkRow(row, index)
      if (issues.length > 0) result.set(row.rowId, issues)
    }
    return result
  },
})
