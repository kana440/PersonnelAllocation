// ポジション操作のテスト（CreateVacantPosition / RemovePosition）
import { describe, test, expect } from 'vitest'
import { makeRow, makePersonRow, makeCL, MOCK_ORGS } from '../helpers/fixtures'
import {
  CreateVacantPositionOperation,
  RemovePositionOperation,
} from '@personnel/domain/commands/handlers/positionOps'
import type { DomainContext } from '@personnel/domain/commands/types'

function makeCtx(overrides: Partial<DomainContext> = {}): DomainContext {
  const row = makePersonRow()
  return {
    allocationList:     [row],
    afterOrganizations: MOCK_ORGS,
    masters:          makeCL(),
    ...overrides,
  }
}

// ── CreateVacantPositionOperation ─────────────────────────────────────────────

describe('CreateVacantPositionOperation', () => {
  test('validate: departmentCode なし → 失敗', () => {
    const op  = new CreateVacantPositionOperation('', '部長')
    const ctx = makeCtx()
    expect(op.validate(ctx).ok).toBe(false)
  })

  test('validate: departmentCode あり → 成功', () => {
    const op  = new CreateVacantPositionOperation('ORG001', '部長')
    const ctx = makeCtx()
    expect(op.validate(ctx).ok).toBe(true)
  })

  test('apply: 新しい行が末尾に追加される', () => {
    const op     = new CreateVacantPositionOperation('ORG001', '部長')
    const ctx    = makeCtx()
    const before = ctx.allocationList.length
    const result = op.apply(ctx)
    expect(result.updatedList).toHaveLength(before + 1)
  })

  test('apply: 新しい行は空席（userId なし）', () => {
    const result = new CreateVacantPositionOperation('ORG001', '部長').apply(makeCtx())
    const newRow = result.updatedList.at(-1)!
    expect(newRow.userId).toBeUndefined()
    expect(newRow.positionCode).toMatch(/^_pos_/)
  })

  test('apply: localJobTitle が設定される', () => {
    const op     = new CreateVacantPositionOperation('ORG001', '部長')
    const result = op.apply(makeCtx())
    const newRow = result.updatedList.at(-1)!
    expect(newRow.localJobTitle).toBe('部長')
  })

  test('apply: departmentCode が設定される', () => {
    const op     = new CreateVacantPositionOperation('ORG001', '部長')
    const result = op.apply(makeCtx())
    const newRow = result.updatedList.at(-1)!
    expect(newRow.departmentCode).toBe('ORG001')
  })
})

// ── RemovePositionOperation ───────────────────────────────────────────────────

describe('RemovePositionOperation', () => {
  test('validate: 存在しない rowId → 失敗', () => {
    const op  = new RemovePositionOperation(9999)
    const ctx = makeCtx()
    expect(op.validate(ctx).ok).toBe(false)
  })

  test('validate: positionCode なし → 失敗', () => {
    const row = makeRow({ rowId: 1, positionCode: undefined })
    const op  = new RemovePositionOperation(1)
    const ctx = makeCtx({ allocationList: [row] })
    expect(op.validate(ctx).ok).toBe(false)
  })

  test('validate: 正常な空席ポジション → 成功', () => {
    const row = makeRow({ rowId: 1, positionCode: 'P001', userId: undefined })
    const op  = new RemovePositionOperation(1)
    const ctx = makeCtx({ allocationList: [row] })
    expect(op.validate(ctx).ok).toBe(true)
  })

  test('apply: 空席ポジションは行が削除される', () => {
    const row    = makeRow({ rowId: 1, positionCode: 'P001', userId: undefined })
    const other  = makePersonRow({ rowId: 2 })
    const op     = new RemovePositionOperation(1)
    const ctx    = makeCtx({ allocationList: [row, other] })
    const result = op.apply(ctx)
    expect(result.updatedList.find(r => r.rowId === 1)).toBeUndefined()
    expect(result.updatedList.find(r => r.rowId === 2)).toBeDefined()
  })

  test('apply: 在席ポジションは人が未アサイン行として残る', () => {
    const row    = makePersonRow({ rowId: 1, positionCode: 'P001', userId: 'u1', groupEmployeeId: 'u1' })
    const op     = new RemovePositionOperation(1)
    const ctx    = makeCtx({ allocationList: [row] })
    const result = op.apply(ctx)
    // 元の rowId はなくなる
    expect(result.updatedList.find(r => r.rowId === 1)).toBeUndefined()
    // userId は残っている行がある（未アサイン行）
    expect(result.updatedList.some(r => r.userId === 'u1')).toBe(true)
    // 残った行には positionCode がない
    const remaining = result.updatedList.find(r => r.userId === 'u1')
    expect(remaining?.positionCode).toBeUndefined()
  })
})
