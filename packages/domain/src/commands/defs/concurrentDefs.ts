// 兼務 — 社内兼務追加・解除
import type { EditOperation } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isMainAssignment } from '../helpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 社内兼務追加 ──────────────────────────────────────────────────────────────

export const concurrentAddDef: EditOperation = {
  id:         'ConcurrentAdd',
  label:      '社内兼務追加',
  group:      'position',
  badgeColor: 'bg-cyan-100 text-cyan-700',

  availableFor: (row) => !!row.userId && isMainAssignment(row),

  inputs: [
    { field: 'departmentCode',   required: true,  label: '兼務先組織' },
    { field: 'concurrentReason', required: false },
  ],

  deriveInitial: () => ({}),

  validate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)          return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId)   return fail('人が配属されていない行には兼務を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務を追加できません（本務行を指定してください）')
    if (!values.departmentCode) return fail('兼務先組織コードは必須です')
    return ok()
  },

  apply(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const orgSubFields = deriveOrgSubFields(values.departmentCode as string, ctx.codeLists)

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...allocClears,
      ...orgSubFields,
      rowId:              newRowId,
      departmentCode:     values.departmentCode as string,
      positionCode:       `_pos_${newRowId}`,
      concurrentType:     '兼務',
      concurrentReason:   values.concurrentReason as string | undefined,
      prevDepartmentCode: undefined,
      prevPositionCode:   undefined,
      prevConcurrentType: undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `社内兼務追加: ${personName(src)}`,
    }
  },
}

// ── 社内兼務解除 ──────────────────────────────────────────────────────────────

export const concurrentReleaseDef: EditOperation = {
  id:         'ConcurrentRelease',
  label:      '社内兼務解除',
  group:      'position',
  badgeColor: 'bg-cyan-50 text-cyan-600',

  availableFor: (row) =>
    row.concurrentType === '兼務' &&
    !row.secondmentToCompany &&
    !row.secondmentFromCompany,

  inputs: [],

  deriveInitial: () => ({}),

  validate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務')
      return fail('この行は兼務行ではありません')
    if (row.secondmentToCompany || row.secondmentFromCompany)
      return fail('出向兼務行は社内兼務解除ではなく出向解除操作を使用してください')
    return ok()
  },

  apply(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `社内兼務解除: ${personName(row)}`,
    }
  },
}

export const DEFS: EditOperation[] = [concurrentAddDef, concurrentReleaseDef]
