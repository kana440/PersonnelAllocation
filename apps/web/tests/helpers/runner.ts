import { describe, test, expect } from 'vitest'
import type { AllocationRow }  from '@personnel/domain/allocationRow'
import type { AllMasters }   from '@personnel/domain/masters/aggregate'
import type { Organization }   from '@personnel/domain/schemas'
import type { RowChanges }     from '@personnel/domain/patterns/changeDetection'
import { validateRow }              from '@personnel/domain/rules/validate/validateRow'
import { getGroupedFieldOptions }   from '@personnel/domain/rules/options'
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
  cl?: Partial<AllMasters>
  /** Organization リスト（省略時は MOCK_ORGS） */
  orgs?: Organization[]
  /** 全行リスト（E系の循環参照チェック用） */
  allRows?: AllocationRow[]
  /** RowChanges（G系・W系用） */
  changes?: RowChanges
  expect: {
    /** これらのフィールドに issue があること（error/warning どちらでも可） */
    errorFields?: string[]
    /** これらのフィールドに issue がないこと */
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
        const ms = makeCL(s.cl)
        const orgs     = s.orgs ?? MOCK_ORGS
        const issues   = validateRow({
          row, afterOrganizations: orgs, masters: ms, allocationList: s.allRows ?? [], changes: s.changes,
        })

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
          const { valid } = getGroupedFieldOptions(opt.field, row, ms)
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
