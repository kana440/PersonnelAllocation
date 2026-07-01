/**
 * interRow/managerOrg.ts — W3: 上司が直系上位組織以外に所属していないかチェック
 *
 * 上司ポジションコードが設定されていて、かつ上司の組織が
 * 当該行の組織の直系上位（祖先）でも同一でもない場合にワーニング。
 *
 * パフォーマンス:
 *   buildIndex: O(R) — positionCode → row の Map
 *   validateRow: O(1) index + O(depth) 祖先探索
 *   validateAll: O(R × depth) ≈ O(R)（実用階層深さ 10〜15 程度）
 *
 *   orgFlatView は RowRuleCtx.orgFlatEntryByCode として遅延計算・バッチ共有する。
 */

import type { AllocationRow }   from '../../allocationRow'
import type { ValidationIssue } from '../validate/types'
import type { RowRuleCtx }      from '../rowRule'
import { defineInterRowRule }   from '../interRowRule'

// index: positionCode → row（上司行のルックアップ用）
type W3Index = Map<string, AllocationRow>

function buildW3Index(allocationList: readonly AllocationRow[]): W3Index {
  const index = new Map<string, AllocationRow>()
  for (const r of allocationList) {
    const pos = r.positionCode as string | undefined
    if (pos) index.set(pos, r)
  }
  return index
}

function checkRow(
  row:   AllocationRow,
  index: W3Index,
  ctx:   RowRuleCtx,
): ValidationIssue[] {
  const mgrPosCode = row.managerPositionCode as string | undefined
  if (!mgrPosCode) return []

  const mgrRow     = index.get(mgrPosCode)
  const rowDeptCode = row.departmentCode     as string | undefined
  const mgrDeptCode = mgrRow?.departmentCode as string | undefined

  if (!mgrRow || !rowDeptCode || !mgrDeptCode) return []
  if (rowDeptCode === mgrDeptCode) return []  // 同一組織はOK

  // orgFlatEntryByCode: RowRuleCtx の lazy getter（バッチ全体で 1 回だけ構築）
  const rowEntry = ctx.orgFlatEntryByCode.get(rowDeptCode)
  if (!rowEntry) return []

  // mgrDeptCode が rowDeptCode の直系上位（ancestorCodes）に含まれていれば正常
  if (rowEntry.ancestorCodes.includes(mgrDeptCode)) return []

  const mgrName = [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(' ') || mgrPosCode
  return [{
    field:   'managerPositionCode' as keyof AllocationRow,
    level:   'warning',
    message: `上司（${mgrName}）が直系上位組織以外（${mgrDeptCode}）に所属しています。組織ツリーを確認してください`,
  }]
}

export const managerOrgRule = defineInterRowRule<W3Index>({
  id:    'W3-managerOrg',
  scope: 'state',

  buildIndex: buildW3Index,

  validateRow: (row, index, ctx) => checkRow(row, index, ctx),

  validateAll: (allocationList, ctx) => {
    const index  = buildW3Index(allocationList)
    const result = new Map<number, ValidationIssue[]>()
    for (const row of allocationList) {
      const issues = checkRow(row, index, ctx)
      if (issues.length > 0) result.set(row.rowId, issues)
    }
    return result
  },
})
