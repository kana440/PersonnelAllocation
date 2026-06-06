import { describe, test, expect } from 'vitest'
import type { AllocationRow }   from '@personnel/domain/allocationRow'
import type { AllCodeLists }    from '@personnel/domain/masters/aggregate'
import type { Organization }    from '@personnel/domain/schemas'
import type { OperationDef }    from '@personnel/domain/commands/defs/types'
import type { EditCommand, DomainContext } from '@personnel/domain/commands/types'
import { makeRow, makeCL, MOCK_ORGS }        from './fixtures'

// ── シナリオ型 ─────────────────────────────────────────────────────────────────

export interface OperationScenario {
  /** 仕様ID（例: OP-promotion-1） */
  id: string
  /** 人が読める説明 */
  desc: string

  /** テスト対象行（makeRow へのオーバーライド） */
  row?: Partial<AllocationRow>
  /** コードリスト（makeCL へのオーバーライド） */
  cl?: Partial<AllCodeLists>
  /** 全行リスト（省略時は [row] のみ） */
  allocationList?: AllocationRow[]
  /** 組織リスト（省略時は MOCK_ORGS） */
  orgs?: Organization[]

  expect: {
    /**
     * availableFor の期待値。
     * この操作が対象行でメニューに表示されるかどうか。
     */
    available?: boolean

    /**
     * validate() の期待値。
     * true = 成功、false = 失敗。
     * command が必要なので createCommand も指定すること。
     */
    validateOk?: boolean
    /** validate() 失敗時のエラーメッセージに含まれるべき文字列 */
    validateErrorContains?: string

    /**
     * apply() 後の行の期待フィールド値。
     * command が必要なので createCommand も指定すること。
     */
    applyFields?: Partial<AllocationRow>
    /** apply() の label に含まれるべき文字列 */
    applyLabelContains?: string
  }

  /**
   * テスト用 EditCommand を生成するファクトリ。
   * validate / apply テストには必須。
   * (row, ctx) → EditCommand の形で記述する。
   */
  createCommand?: (row: AllocationRow, ctx: DomainContext) => EditCommand
}

// ── テストランナー ─────────────────────────────────────────────────────────────

export function runOperationScenarios(
  suiteName: string,
  def: OperationDef,
  scenarios: OperationScenario[],
) {
  describe(suiteName, () => {
    for (const s of scenarios) {
      test(`${s.id}: ${s.desc}`, () => {
        const row  = makeRow(s.row)
        const cl   = makeCL(s.cl)
        const orgs = s.orgs ?? MOCK_ORGS
        const list = s.allocationList ?? [row]
        const ctx: DomainContext = { allocationList: list, afterOrganizations: orgs, codeLists: cl }

        // availableFor
        if (s.expect.available !== undefined) {
          expect(
            def.availableFor(row, cl),
            `availableFor() は ${s.expect.available} であるはず`,
          ).toBe(s.expect.available)
        }

        // validate / apply
        if (s.createCommand) {
          const cmd = s.createCommand(row, ctx)

          if (s.expect.validateOk !== undefined) {
            const result = cmd.validate(ctx)
            expect(
              result.ok,
              result.ok
                ? `validate() は失敗するはず`
                : `validate() は成功するはず\n  エラー: ${result.errors.map(e => e.message).join(', ')}`,
            ).toBe(s.expect.validateOk)

            if (!result.ok && s.expect.validateErrorContains) {
              const messages = result.errors.map(e => e.message).join('\n')
              expect(messages).toContain(s.expect.validateErrorContains)
            }
          }

          if (s.expect.applyFields !== undefined || s.expect.applyLabelContains !== undefined) {
            const result = cmd.apply(ctx)

            if (s.expect.applyFields) {
              const updated = result.updatedList.find(r => r.rowId === row.rowId)
              expect(updated, `apply() の updatedList に rowId=${row.rowId} が見つからない`).toBeDefined()
              for (const [field, value] of Object.entries(s.expect.applyFields)) {
                expect(
                  (updated as Record<string, unknown>)[field],
                  `apply() 後の ${field}`,
                ).toBe(value)
              }
            }

            if (s.expect.applyLabelContains) {
              expect(result.label).toContain(s.expect.applyLabelContains)
            }
          }
        }
      })
    }
  })
}
