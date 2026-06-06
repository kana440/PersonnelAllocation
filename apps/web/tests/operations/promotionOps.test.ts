// 昇格・降格操作のテスト（OperationDef + EditCommand）
import { runOperationScenarios } from '../helpers/operationRunner'
import { makePersonRow } from '../helpers/fixtures'
import { promotionDef, demotionDef } from '@personnel/domain/commands/defs/jobClassificationDefs'
import { PromotionOperation, DemotionOperation } from '@personnel/domain/commands/handlers/patternOps'

// ── 昇格 ──────────────────────────────────────────────────────────────────────

runOperationScenarios('昇格 — availableFor', promotionDef, [
  {
    id: 'promo-avail-1',
    desc: '社員行 → 表示される',
    row: { employmentType: '社員', userId: '111', groupEmployeeId: '111' },
    expect: { available: true },
  },
  {
    id: 'promo-avail-2',
    desc: '出向受入行 → 表示されない',
    row: { employmentType: '出向受入社員' },
    expect: { available: false },
  },
  {
    id: 'promo-avail-3',
    desc: '雇用延長行 → 表示されない',
    row: { employmentType: '雇用延長社員' },
    expect: { available: false },
  },
])

runOperationScenarios('昇格 — validate', promotionDef, [
  {
    id: 'promo-val-1',
    desc: '対象行が存在すれば validate 成功',
    row: { employmentType: '社員' },
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { validateOk: true },
  },
  {
    id: 'promo-val-2',
    desc: '対象行が存在しなければ validate 失敗',
    row: { employmentType: '社員' },
    allocationList: [],
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { validateOk: false, validateErrorContains: '見つかりません' },
  },
])

runOperationScenarios('昇格 — apply', promotionDef, [
  {
    id: 'promo-apply-1',
    desc: 'band が更新される',
    row: { employmentType: '社員', band: 'M4', lastName: '山田', firstName: '太郎' },
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { applyFields: { band: 'M5' } },
  },
  {
    id: 'promo-apply-2',
    desc: 'ラベルに氏名が含まれる',
    row: { employmentType: '社員', band: 'M4', lastName: '山田', firstName: '太郎' },
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { applyLabelContains: '山田' },
  },
  {
    id: 'promo-apply-3',
    desc: '複数フィールドを一度に更新できる',
    row: { employmentType: '社員', band: 'M4', payGrade: 'G4' },
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5', payGrade: 'G5' }),
    expect: { applyFields: { band: 'M5', payGrade: 'G5' } },
  },
  {
    id: 'promo-apply-4',
    desc: '対象行以外は変更されない',
    row: { employmentType: '社員', band: 'M4', lastName: '山田', firstName: '太郎' },
    allocationList: [
      makePersonRow({ band: 'M4', lastName: '山田', firstName: '太郎' }),
      makePersonRow({ userId: 'u2', groupEmployeeId: 'u2', band: 'M3', lastName: '鈴木', firstName: '花子' }),
    ],
    createCommand: (row) => new PromotionOperation(row.rowId, { band: 'M5' }),
    expect: { applyFields: { band: 'M5' } },
  },
])

// ── 降格 ──────────────────────────────────────────────────────────────────────

runOperationScenarios('降格 — availableFor', demotionDef, [
  {
    id: 'demo-avail-1',
    desc: '社員行 → 表示される',
    row: { employmentType: '社員', userId: '111', groupEmployeeId: '111' },
    expect: { available: true },
  },
  {
    id: 'demo-avail-2',
    desc: '出向受入行 → 表示されない',
    row: { employmentType: '出向受入社員' },
    expect: { available: false },
  },
])

runOperationScenarios('降格 — apply', demotionDef, [
  {
    id: 'demo-apply-1',
    desc: 'band が更新される',
    row: { employmentType: '社員', band: 'M5', lastName: '山田', firstName: '太郎' },
    createCommand: (row) => new DemotionOperation(row.rowId, { band: 'M4' }),
    expect: { applyFields: { band: 'M4' } },
  },
])
