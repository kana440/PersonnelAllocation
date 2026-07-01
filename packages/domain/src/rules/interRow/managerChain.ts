/**
 * interRow/managerChain.ts — E1: 上司ポジションコードの整合性チェック
 *
 * チェック内容:
 *   1. managerPositionCode が allocationList 内に存在するか（warning: 別組織ファイルの可能性）
 *   2. 自己参照（自分のポジションを上司に設定）
 *   3. 循環参照（配下のポジションを上司に設定）
 *
 * パフォーマンス:
 *   buildIndex: O(R) — positionCode → row の Map を構築
 *   validateRow: O(depth) — index ルックアップ後、上司チェーンを深さ分たどる
 *   validateAll: O(R × depth) — 実用的な組織階層深さは 10〜15 程度なので O(R) とみなせる
 */

import type { AllocationRow }   from '../../allocationRow'
import type { ValidationIssue } from '../validate/types'
import { defineInterRowRule }   from '../interRowRule'

// index: positionCode → row（存在チェック）+ positionCode → managerPositionCode（循環チェック）
type E1Index = {
  byPositionCode: Map<string, AllocationRow>
  posToMgr:       Map<string, string>
}

function buildE1Index(allocationList: readonly AllocationRow[]): E1Index {
  const byPositionCode = new Map<string, AllocationRow>()
  const posToMgr       = new Map<string, string>()
  for (const r of allocationList) {
    const pos = r.positionCode as string | undefined
    if (!pos) continue
    byPositionCode.set(pos, r)
    const mgr = r.managerPositionCode as string | undefined
    if (mgr) posToMgr.set(pos, mgr)
  }
  return { byPositionCode, posToMgr }
}

function checkRow(row: AllocationRow, index: E1Index): ValidationIssue[] {
  const mgrCode = row.managerPositionCode as string | undefined
  if (!mgrCode) return []

  // 1. 存在チェック
  if (!index.byPositionCode.has(mgrCode)) {
    return [{
      field:   'managerPositionCode',
      level:   'warning',
      message: `上司ポジションコード "${mgrCode}" がこのファイルに存在しません（別組織の可能性あり）`,
    }]
  }

  // 2. 自己参照チェック
  const selfPos = row.positionCode as string | undefined
  if (selfPos && mgrCode === selfPos) {
    return [{
      field:   'managerPositionCode',
      level:   'error',
      message: '自分自身を上司ポジションに設定できません',
    }]
  }

  // 3. 循環参照チェック（上司チェーンをたどり自分のポジションに戻ってこないか）
  if (selfPos) {
    let cur: string | undefined = index.posToMgr.get(mgrCode)
    const visited = new Set<string>()
    while (cur && !visited.has(cur)) {
      visited.add(cur)
      if (cur === selfPos) {
        return [{
          field:   'managerPositionCode',
          level:   'error',
          message: '配下のポジションを上司に設定できません（循環参照）',
        }]
      }
      cur = index.posToMgr.get(cur)
    }
  }

  return []
}

export const managerChainRule = defineInterRowRule<E1Index>({
  id:    'E1-managerChain',
  scope: 'state',

  buildIndex: buildE1Index,

  validateRow: (row, index, _ctx) => checkRow(row, index),

  validateAll: (allocationList, _ctx) => {
    const index  = buildE1Index(allocationList)
    const result = new Map<number, ValidationIssue[]>()
    for (const row of allocationList) {
      const issues = checkRow(row, index)
      if (issues.length > 0) result.set(row.rowId, issues)
    }
    return result
  },
})
