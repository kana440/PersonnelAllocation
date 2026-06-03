// 移動系操作 — 組織改変・移籍
import type { EditCommand, OperationContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { FIELD_METADATA, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── OrgRestructure（組織改変による組織コード変更） ────────────────────────────────
// 組織改変（廃止・統合・改称）に伴い、継承先の組織コードへ移動する。
// positionCode は引き継ぐ（席は変わらない）。

export class OrgRestructureOperation implements EditCommand {
  readonly kind = 'OrgRestructure'

  constructor(
    private readonly rowId:          number,
    private readonly departmentCode: string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.departmentCode)
      return fail('継承先の組織コードは必須です')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row     = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const orgName = ctx.afterOrganizations.find(o => o.externalCode === this.departmentCode)?.name
                 ?? this.departmentCode
    const subFields = deriveOrgSubFields(this.departmentCode, ctx.codeLists)
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, departmentCode: this.departmentCode, ...subFields }
          : r
      ),
      label: `組織改変: ${personName(row)} → ${orgName}`,
    }
  }
}

// ── EmploymentTransferOut（移籍・出る） ──────────────────────────────────────
// グループ会社間転籍で自社を離れるケース。After state を全てブランクにする。

export class EmploymentTransferOutOperation implements EditCommand {
  readonly kind = 'EmploymentTransferOut'

  constructor(
    private readonly rowId:          number,
    private readonly transferReason: string,
  ) {}

  validate(ctx: OperationContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)
    if (!row)          return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!row.userId)   return fail('人が配属されていない行に移籍（出る）を設定できません')
    if (!this.transferReason) return fail('異動事由は必須です')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!

    // After state を全てブランクにして transferReason のみセット
    const reset: Partial<AllocationRow> = {}
    for (const { after } of FIELD_METADATA) {
      ;(reset as Record<string, unknown>)[after] = undefined
    }

    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, ...reset, transferReason: this.transferReason }
          : r
      ),
      label: `移籍（出る）: ${personName(row)}`,
    }
  }
}

// ── EmploymentTransferIn（移籍・入る） ───────────────────────────────────────
// グループ会社間転籍で自社に入社するケース。新規行として追加する。
// prevXxx フィールドは空（新規行のため before 状態なし）。

export interface EmploymentTransferInFields {
  userId?:          string
  employeeNumber?:  string
  lastName?:        string
  firstName?:       string
  departmentCode?:  string
  employmentType?:  string
  band?:            string
  payGrade?:        string
  officialPositionCode?: string
  localJobTitle?:   string
  transferReason?:  string
  [key: string]:    string | undefined
}

export class EmploymentTransferInOperation implements EditCommand {
  readonly kind = 'EmploymentTransferIn'

  constructor(
    private readonly fields: EmploymentTransferInFields,
  ) {}

  validate(_ctx: OperationContext): ValidationResult {
    if (!this.fields.departmentCode) return fail('組織コードは必須です')
    if (!this.fields.transferReason) return fail('異動事由は必須です')
    return ok()
  }

  apply(ctx: OperationContext): OperationResult {
    const newRowId = nextRowId(ctx.allocationList)
    const orgSub = this.fields.departmentCode
      ? deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)
      : {}

    const newRow: AllocationRow = {
      rowId: newRowId,
      ...this.fields,
      ...orgSub,
      positionCode: `_pos_${newRowId}`,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `移籍（入る）: ${[this.fields.lastName, this.fields.firstName].filter(Boolean).join(' ') || '新規'}`,
    }
  }
}
