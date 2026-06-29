// 旧にあって新に存在しないポジションを空席として復元する EditCommand + 候補検索ヘルパー

import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../../derivation/orgFields'

// ── RestorablePosition ────────────────────────────────────────────────────────

export interface RestorablePosition {
  positionCode:             string
  prevDepartmentCode:       string
  prevLocalJobTitle:        string
  prevOfficialPositionCode: string
  prevBand:                 string
  prevPositionBand:         string
  /** このポジションを before で保有していた人の名前（参考表示用） */
  prevPersonName:           string
}

/**
 * allocationList の中から「旧にあって新に存在しないポジション」を返す。
 *
 * 条件:
 *  1. prevPositionCode が存在する（= Excel インポート時に設定されていた）
 *  2. _pos_ プレフィックスでない（セッション内自動採番は対象外）
 *  3. 現在 allocationList のどの行にも positionCode として存在しない
 */
export function findRestorablePositions(allocationList: AllocationRow[]): RestorablePosition[] {
  const activeCodes = new Set(
    allocationList
      .filter(r => r.positionCode)
      .map(r => r.positionCode as string),
  )

  const seen = new Set<string>()
  const results: RestorablePosition[] = []

  for (const row of allocationList) {
    const prevCode = row.prevPositionCode as string | undefined
    if (!prevCode) continue
    if (prevCode.startsWith('_pos_')) continue
    if (activeCodes.has(prevCode)) continue
    if (seen.has(prevCode)) continue
    seen.add(prevCode)

    results.push({
      positionCode:             prevCode,
      prevDepartmentCode:       (row.prevDepartmentCode       as string | undefined) ?? '',
      prevLocalJobTitle:        (row.prevLocalJobTitle        as string | undefined) ?? '',
      prevOfficialPositionCode: (row.prevOfficialPositionCode as string | undefined) ?? '',
      prevBand:                 (row.prevBand                 as string | undefined) ?? '',
      prevPositionBand:         (row.prevPositionBand         as string | undefined) ?? '',
      prevPersonName:           [row.lastName, row.firstName].filter(Boolean).join(' '),
    })
  }

  // 旧部署コード → タイトル順にソート
  return results.sort((a, b) => {
    const orgCmp = a.prevDepartmentCode.localeCompare(b.prevDepartmentCode)
    return orgCmp !== 0 ? orgCmp : a.prevLocalJobTitle.localeCompare(b.prevLocalJobTitle)
  })
}

// ── RestoreVacantPositionOperation ───────────────────────────────────────────

export class RestoreVacantPositionOperation implements EditCommand {
  readonly kind = 'RestoreVacantPosition'

  constructor(
    private readonly candidate:            RestorablePosition,
    private readonly targetDepartmentCode: string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!this.targetDepartmentCode) return fail('追加先の組織を選択してください')
    if (ctx.allocationList.some(r => r.positionCode === this.candidate.positionCode)) {
      return fail(`ポジション ${this.candidate.positionCode} は既に存在します`)
    }
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const rowId = nextRowId(ctx.allocationList)
    const orgSub = deriveOrgSubFields(this.targetDepartmentCode, ctx.masters)
    const newRow: AllocationRow = {
      rowId,
      positionCode:         this.candidate.positionCode,
      departmentCode:       this.targetDepartmentCode,
      ...orgSub,
      officialPositionCode: this.candidate.prevOfficialPositionCode || undefined,
      localJobTitle:        this.candidate.prevLocalJobTitle        || undefined,
      band:                 this.candidate.prevBand                 || undefined,
      positionBand:         this.candidate.prevPositionBand        || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `空きポジション追加: ${this.candidate.prevLocalJobTitle || this.candidate.positionCode}`,
    }
  }
}
