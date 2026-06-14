// 組織への異動 — OrgTransfer / OrgRestructure / ManagerChange
import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── OrgTransfer ───────────────────────────────────────────────────────────────

interface OrgTransferFields {
  departmentCode:      string
  managerPositionCode: string | undefined
  managerName:         string | undefined
}

export class OrgTransferOperation implements EditCommand {
  readonly kind = 'OrgTransfer'

  constructor(
    private readonly rowId:  number,
    private readonly fields: OrgTransferFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.fields.departmentCode)
      return fail('組織コードは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row     = ctx.allocationList.find(r => r.rowId === this.rowId)!
    const orgName = ctx.afterOrganizations.find(o => o.externalCode === this.fields.departmentCode)?.name
                 ?? this.fields.departmentCode
    const subFields = deriveOrgSubFields(this.fields.departmentCode, ctx.codeLists)
    const managerFields = this.fields.managerPositionCode !== undefined
      ? { managerPositionCode: this.fields.managerPositionCode, managerName: this.fields.managerName }
      : {}
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, departmentCode: this.fields.departmentCode, ...subFields, ...managerFields }
          : r
      ),
      label: `組織異動: ${personName(row)} → ${orgName}`,
    }
  }
}

// ── OrgRestructure ────────────────────────────────────────────────────────────
// 組織改変（廃止・統合・改称）に伴い、継承先の組織コードへ移動する。
// positionCode は引き継ぐ（席は変わらない）。

export class OrgRestructureOperation implements EditCommand {
  readonly kind = 'OrgRestructure'

  constructor(
    private readonly rowId:          number,
    private readonly departmentCode: string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    if (!this.departmentCode)
      return fail('継承先の組織コードは必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
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

// ── ManagerChange ─────────────────────────────────────────────────────────────

export class ManagerChangeOperation implements EditCommand {
  readonly kind = 'ManagerChange'

  constructor(
    private readonly rowId:               number,
    private readonly managerPositionCode: string | undefined,
    private readonly managerName:         string | undefined,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.rowId))
      return fail(`行が見つかりません (rowId: ${this.rowId})`)
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === this.rowId
          ? { ...r, managerPositionCode: this.managerPositionCode, managerName: this.managerName }
          : r
      ),
      label: `上司変更: ${personName(row)}`,
    }
  }
}
