import { describe, test, expect } from 'vitest'
import type { AllocationRow }  from '../../src/domain/allocationRow'
import type { AllCodeLists }   from '../../src/domain/codeLists/aggregate'
import type { Organization }   from '../../src/domain/schemas'
import type { RowChanges }     from '../../src/domain/review/changeDetection'
import { validateRow }              from '../../src/domain/validation/validateRow'
import { getGroupedFieldOptions }   from '../../src/domain/optionFilter/index'
import { makeRow, makeCL, MOCK_ORGS } from './fixtures'

// ── シナリオ型 ─────────────────────────────────────────────────────────────────
export interface Scenario {
  /** 仕様ID（例: A1-0-1, F1-2） */
  id: string
  /** 人が読める説明 — 要求との照合用 */
  desc: string
  /** makeRow へのオーバーライド */
  row: Partial<AllocationRow>
  /** makeCL へのオーバーライド */
  cl?: Partial<AllCodeLists>
  /** Organization リスト（省略時は MOCK_ORGS） */
  orgs?: Organization[]
  /** 全行リスト（E系の循環参照チェック用） */
  allRows?: AllocationRow[]
  /** RowChanges（G系・W系用） */
  changes?: RowChanges
  expect: {
    /** これらのフィールドにエラーがあること */
    errorFields?: string[]
    /** これらのフィールドにエラーがないこと */
    noErrorFields?: string[]
    /** オプション絞り込み検証 */
    options?: { field: string; includes?: string[]; excludes?: string[] }[]
  }
}

// ── テストランナー ─────────────────────────────────────────────────────────────
export function runScenarios(suiteName: string, scenarios: Scenario[]) {
  describe(suiteName, () => {
    for (const s of scenarios) {
      test(`${s.id}: ${s.desc}`, () => {
        const row      = makeRow(s.row)
        const cl       = makeCL(s.cl)
        const orgs     = s.orgs ?? MOCK_ORGS
        const issues   = validateRow(row, orgs, cl, s.changes, s.allRows)

        for (const field of s.expect.errorFields ?? []) {
          expect(
            issues.some(i => i.field === field),
            `"${field}" にエラーがあるはず\n  実際のエラー: ${JSON.stringify(issues.map(i => i.field))}`,
          ).toBe(true)
        }

        for (const field of s.expect.noErrorFields ?? []) {
          const hit = issues.find(i => i.field === field)
          expect(
            hit,
            `"${field}" にエラーがないはず\n  実際: ${hit?.message}`,
          ).toBeUndefined()
        }

        for (const opt of s.expect.options ?? []) {
          const { valid } = getGroupedFieldOptions(opt.field, row, cl)
          for (const v of opt.includes ?? []) {
            expect(
              valid,
              `"${v}" が ${opt.field} の有効選択肢に含まれるはず\n  実際: ${JSON.stringify(valid)}`,
            ).toContain(v)
          }
          for (const v of opt.excludes ?? []) {
            expect(
              valid,
              `"${v}" が ${opt.field} の有効選択肢に含まれないはず\n  実際: ${JSON.stringify(valid)}`,
            ).not.toContain(v)
          }
        }
      })
    }
  })
}
