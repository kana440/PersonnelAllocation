import type { EditCommand, DomainContext, OperationResult, ValidationResult } from '../types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isRegularEmployee, wasSecondedOut, isMainAssignment, wasSecondedIn } from '../helpers'
import type { AllMasters } from '../../masters/aggregate'

export interface NonSFSecondmentSourceChanges {
  secondmentToCompany: string    // 出向先会社（必須）
  departmentCode?:     string    // 出向箱の組織（任意）
  transferReason?:     string
  employmentType?:     string
  memo?:               string
}

export interface NonSFSecondmentReceivingFields {
  departmentCode:                string    // 受入先組織（必須）
  employmentType?:               string
  secondmentFromEmployeeNumber?: string
  band?:                         string
  memo?:                         string
}

/** SF外出向ペア作成条件 */
export function canCreateNonSFSecondmentPair(row: AllocationRow, ms: AllMasters): boolean {
  return isRegularEmployee(row, ms) && isMainAssignment(row) && !wasSecondedOut(row)
}

/** SF外出向取り消し条件（出向元行 or 出向受入行のどちらからでも判定） */
export function canCancelNonSFSecondmentPair(row: AllocationRow, allRows: AllocationRow[]): boolean {
  // 出向元行視点: セッション内で secondmentToCompany が設定され、対応する受入行がある
  const outCompany = row.secondmentToCompany as string | undefined
  if (outCompany && !wasSecondedOut(row)) {
    return allRows.some(r =>
      r.rowId !== row.rowId &&
      (r.secondmentFromCompany as string | undefined) === outCompany &&
      !(r.prevSecondmentFromCompany as string | undefined),
    )
  }
  // 受入行視点: セッション内で secondmentFromCompany が設定され、対応する出向元行がある
  const inCompany = row.secondmentFromCompany as string | undefined
  if (inCompany && !wasSecondedIn(row)) {
    return allRows.some(r =>
      r.rowId !== row.rowId &&
      (r.secondmentToCompany as string | undefined) === inCompany &&
      !(r.prevSecondmentToCompany as string | undefined),
    )
  }
  return false
}

/** SF外出向解除条件（既存の出向に対して、対応する受入行も存在する） */
export function canReleaseNonSFSecondment(row: AllocationRow, allRows: AllocationRow[]): boolean {
  if (!wasSecondedOut(row)) return false
  const company = row.secondmentToCompany as string | undefined
  if (!company) return false
  return allRows.some(r =>
    r.rowId !== row.rowId &&
    (r.secondmentFromCompany as string | undefined) === company,
  )
}

/** 出向元行・受入行を共通で解決するユーティリティ */
function resolveSourceAndReceiving(
  anchorRowId: number,
  allRows:     AllocationRow[],
): { sourceRow: AllocationRow | undefined; receivingRow: AllocationRow | undefined } {
  const anchor    = allRows.find(r => r.rowId === anchorRowId)
  if (!anchor) return { sourceRow: undefined, receivingRow: undefined }

  const outCompany = anchor.secondmentToCompany as string | undefined
  const inCompany  = anchor.secondmentFromCompany as string | undefined

  if (outCompany) {
    // アンカーが出向元行
    const receivingRow = allRows.find(r =>
      r.rowId !== anchorRowId &&
      (r.secondmentFromCompany as string | undefined) === outCompany,
    )
    return { sourceRow: anchor, receivingRow }
  }
  if (inCompany) {
    // アンカーが受入行
    const sourceRow = allRows.find(r =>
      r.rowId !== anchorRowId &&
      (r.secondmentToCompany as string | undefined) === inCompany,
    )
    return { sourceRow, receivingRow: anchor }
  }
  return { sourceRow: undefined, receivingRow: undefined }
}

/**
 * SF外出向ペア作成コマンド。
 * 出向元行を更新（出向設定）し、出向受入行を新規作成する。
 */
export class NonSFSecondmentPairCommand implements EditCommand {
  readonly kind = 'NonSFSecondmentPair'

  constructor(
    private readonly sourceRowId: number,
    private readonly source:    NonSFSecondmentSourceChanges,
    private readonly receiving: NonSFSecondmentReceivingFields,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    const row = ctx.allocationList.find(r => r.rowId === this.sourceRowId)
    if (!row)                       return fail(`行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!row.userId)                return fail('人が配属されていない行に出向ペアを作成できません')
    if (row.concurrentType === '兼務') return fail('兼務行には出向ペアを作成できません')
    if (!this.source.secondmentToCompany) return fail('出向先会社は必須です')
    if (!this.receiving.departmentCode)   return fail('受入先組織は必須です')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const sourceRow = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const name = [sourceRow.lastName, sourceRow.firstName].filter(Boolean).join(' ')

    // 出向元行の更新
    const srcOrgSub = this.source.departmentCode
      ? deriveOrgSubFields(this.source.departmentCode, ctx.masters)
      : {}
    const updatedSource: AllocationRow = {
      ...sourceRow,
      secondmentToCompany: this.source.secondmentToCompany,
      ...(this.source.departmentCode ? { departmentCode: this.source.departmentCode, ...srcOrgSub } : {}),
      ...(this.source.transferReason ? { transferReason: this.source.transferReason } : {}),
      ...(this.source.employmentType ? { employmentType: this.source.employmentType } : {}),
      ...(this.source.memo           ? { memo: this.source.memo }           : {}),
    }

    // 出向受入行の新規作成
    const newRowId   = nextRowId(ctx.allocationList)
    const recvOrgSub = deriveOrgSubFields(this.receiving.departmentCode, ctx.masters)
    const receivingRow: AllocationRow = {
      rowId:                         newRowId,
      positionCode:                  `_pos_${newRowId}`,
      userId:                        sourceRow.userId,
      employeeNumber:                sourceRow.employeeNumber,
      lastName:                      sourceRow.lastName,
      firstName:                     sourceRow.firstName,
      groupEmployeeId:               sourceRow.groupEmployeeId,
      departmentCode:                this.receiving.departmentCode,
      ...recvOrgSub,
      secondmentFromCompany:         this.source.secondmentToCompany,
      ...(this.receiving.secondmentFromEmployeeNumber
        ? { secondmentFromEmployeeNumber: this.receiving.secondmentFromEmployeeNumber }
        : {}),
      ...(this.receiving.employmentType ? { employmentType: this.receiving.employmentType } : {}),
      ...(this.receiving.band           ? { band: this.receiving.band }           : {}),
      ...(this.receiving.memo           ? { memo: this.receiving.memo }           : {}),
      trainingPositionFlag: '0',
    } as AllocationRow

    return {
      updatedList: [
        ...ctx.allocationList.map(r => r.rowId === this.sourceRowId ? updatedSource : r),
        receivingRow,
      ],
      label: `SF外出向: ${name} → ${this.source.secondmentToCompany}`,
    }
  }
}

/**
 * SF外出向取り消しコマンド。
 * 出向元・受入行のどちらを anchorRowId にしても動作する。
 */
export class NonSFSecondmentCancelCommand implements EditCommand {
  readonly kind = 'NonSFSecondmentCancel'

  constructor(private readonly anchorRowId: number) {}

  validate(ctx: DomainContext): ValidationResult {
    const { sourceRow, receivingRow } = resolveSourceAndReceiving(this.anchorRowId, ctx.allocationList)
    if (!sourceRow)   return fail('出向元行が見つかりません')
    if (!receivingRow) return fail('対応する出向受入行が見つかりません')
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const { sourceRow, receivingRow } = resolveSourceAndReceiving(this.anchorRowId, ctx.allocationList)!
    const name = [sourceRow!.lastName, sourceRow!.firstName].filter(Boolean).join(' ')
    const src  = sourceRow!

    const revertedSource: AllocationRow = {
      ...src,
      secondmentToCompany: undefined,
      ...(src.prevDepartmentCode as string | undefined
        ? { departmentCode: src.prevDepartmentCode as string }
        : {}),
    }

    return {
      updatedList: ctx.allocationList
        .map(r => r.rowId === src.rowId ? revertedSource : r)
        .filter(r => r.rowId !== receivingRow!.rowId),
      label: `SF外出向取り消し: ${name}`,
    }
  }
}

/**
 * SF外出向解除コマンド（既存の出向を業務的に解除 + 受入行削除）。
 */
export class NonSFSecondmentReleaseCommand implements EditCommand {
  readonly kind = 'NonSFSecondmentRelease'

  constructor(
    private readonly sourceRowId:  number,
    private readonly receivingRowId: number,
    private readonly transferReason?: string,
    private readonly memo?:           string,
  ) {}

  validate(ctx: DomainContext): ValidationResult {
    if (!ctx.allocationList.find(r => r.rowId === this.sourceRowId))
      return fail(`出向元行が見つかりません (rowId: ${this.sourceRowId})`)
    if (!ctx.allocationList.find(r => r.rowId === this.receivingRowId))
      return fail(`出向受入行が見つかりません (rowId: ${this.receivingRowId})`)
    return ok()
  }

  apply(ctx: DomainContext): OperationResult {
    const source = ctx.allocationList.find(r => r.rowId === this.sourceRowId)!
    const name   = [source.lastName, source.firstName].filter(Boolean).join(' ')

    const updatedSource: AllocationRow = {
      ...source,
      secondmentToCompany: undefined,
      ...(this.transferReason ? { transferReason: this.transferReason } : {}),
      ...(this.memo           ? { memo: this.memo }                     : {}),
    }

    return {
      updatedList: ctx.allocationList
        .map(r => r.rowId === this.sourceRowId ? updatedSource : r)
        .filter(r => r.rowId !== this.receivingRowId),
      label: `SF外出向解除: ${name}`,
    }
  }
}
