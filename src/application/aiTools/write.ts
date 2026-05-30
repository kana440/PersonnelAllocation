import type { HRApplicationService } from '../HRApplicationService'
import type { IDomainOperation, ValidationResult, OperationError } from '../../domain/operation/types'
import type { AllocationRow, AfterValues } from '../../domain/allocationRow'
import { ChangeTitleOperation, derivePersonGradeFields } from '../../domain/operation/handlers/changeTitle'
import { DirectEditOperation } from '../../domain/operation/handlers/directEdit'
import { BulkMoveToOrgOperation } from '../../domain/operation/handlers/bulkMoveToOrg'
import { TransferPersonOperation } from '../../domain/operation/handlers/transferPerson'
import { detectChanges } from '../../domain/review/changeDetection'
import { validateRow } from '../../domain/validation/validateRow'
import type { ValidationIssue } from '../../domain/validation/types'
import type { PositionCodeAssignment } from '../../ports'
import type { AIOperationResult } from './types'

export function createWriteMethods(service: HRApplicationService) {

  // ── Internal helper ───────────────────────────────────────────────────────

  function runPostValidation(
    beforeList: AllocationRow[],
  ): Array<{ rowId: number; issues: ValidationIssue[] }> {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    const beforeMap = new Map(beforeList.map(r => [r.rowId, r]))
    return allocationList
      .filter(r => beforeMap.get(r.rowId) !== r)
      .map(r => ({
        rowId:  r.rowId,
        issues: validateRow(r, afterOrganizations, codeLists, detectChanges(r), allocationList),
      }))
      .filter(v => v.issues.length > 0)
  }

  // ── Core operations ───────────────────────────────────────────────────────

  function validateOperation(op: IDomainOperation): ValidationResult {
    const { allocationList, afterOrganizations, codeLists } = service.getSnapshot()
    return op.validate({ allocationList, afterOrganizations, codeLists })
  }

  function executeOperation(op: IDomainOperation): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const result = service.executeOperation(op)
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function undo(): void { service.undo() }

  // ── Position operations ───────────────────────────────────────────────────

  /**
   * 空席ポジションを新規作成し、新規行の rowId を返す。
   * managerPositionCode を指定するとレポートラインも1操作で設定できる。
   */
  function createVacantPosition(
    departmentCode:    string,
    localJobTitle:     string,
    managerPositionCode?: string,
  ): number | undefined {
    const before = service.getSnapshot().allocationList
    service.createVacantPosition(
      departmentCode,
      localJobTitle,
      managerPositionCode ? { managerPositionCode } : undefined,
    )
    const after = service.getSnapshot().allocationList
    return after.find(r => !before.some(b => b.rowId === r.rowId))?.rowId
  }

  function assignPersonToVacantPosition(vacantRowId: number, personUserId: string): void {
    service.assignPersonToVacantPosition(vacantRowId, personUserId)
  }

  function unassignPersonFromPosition(rowId: number): void {
    service.unassignPersonFromPosition(rowId)
  }

  function removePosition(rowId: number): void {
    service.removePosition(rowId)
  }

  function getUnassignedPositions(): Array<{
    rowId:          number
    positionCode:   string
    localJobTitle:  string
    departmentCode: string
    orgName:        string
  }> {
    return service.getUnassignedPositions()
  }

  function assignPositionCodes(assignments: PositionCodeAssignment[]) {
    return service.assignPositionCodes(assignments)
  }

  // ── Title / grade operations ──────────────────────────────────────────────

  function changeTitle(params: {
    rowId:                number
    officialPositionCode: string
    localJobTitle:        string
    positionBand:         string
    band:                 string
    payGrade:             string
  }): AIOperationResult {
    const ctx        = service.getSnapshot()
    const beforeList = ctx.allocationList
    const suggested  = derivePersonGradeFields(params.officialPositionCode, ctx)
    const result = service.executeOperation(
      new ChangeTitleOperation(
        params.rowId,
        params.officialPositionCode,
        params.localJobTitle,
        params.positionBand || suggested.positionBand || '',
        params.band         || suggested.band         || '',
        params.payGrade     || suggested.payGrade     || '',
      )
    )
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function suggestTitleFields(officialPositionCode: string): {
    positionBand?: string; band?: string; payGrade?: string
  } {
    return derivePersonGradeFields(officialPositionCode, service.getSnapshot())
  }

  // ── Manager position ──────────────────────────────────────────────────────

  function setManagerPosition(rowId: number, managerPositionCode: string): AIOperationResult {
    const snap       = service.getSnapshot()
    const beforeList = snap.allocationList
    const mgrRow     = snap.allocationList.find(r => r.positionCode === managerPositionCode)
    const managerName = mgrRow
      ? [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(', ')
      : ''
    const result = service.saveRow(rowId, { managerPositionCode, managerName })
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  // ── Batch derivation ──────────────────────────────────────────────────────

  const reDeriveManagerNames = () => service.reDeriveManagerNames()
  const reDeriveOrgSubFields = () => service.reDeriveOrgSubFields()

  // ── toolRegistry executeOnApprove 委譲メソッド ────────────────────────────

  function executeBulkTransfer(
    sourceOrgCode: string,
    targetOrgCode: string,
  ): { applied: boolean; sourceOrgName: string; targetOrgName: string } | { ok: false; error: string } {
    const { afterOrganizations } = service.getSnapshot()
    const sourceOrg = afterOrganizations.find(o => o.externalCode === sourceOrgCode || o.id === sourceOrgCode)
    const targetOrg = afterOrganizations.find(o => o.externalCode === targetOrgCode || o.id === targetOrgCode)
    if (!sourceOrg) return { ok: false, error: '移動元組織が見つかりません' }
    if (!targetOrg) return { ok: false, error: '移動先組織が見つかりません' }
    const label  = `${sourceOrg.name} 全員 → ${targetOrg.name} 一括異動`
    const result = service.executeOperation(new BulkMoveToOrgOperation(sourceOrg.id, targetOrg.id, label))
    return result.ok
      ? { applied: true, sourceOrgName: sourceOrg.name, targetOrgName: targetOrg.name }
      : { ok: false, error: result.errors?.[0]?.message ?? 'エラー' }
  }

  const FIELD_EDIT_LABELS: Record<string, string> = {
    localJobTitle:        '役職名',
    band:                 'バンド',
    payGrade:             '給与等級',
    officialPositionCode: '役職コード',
    transferReason:       '異動事由',
  }

  /** ALLOWED_FIELDS 以外のフィールドはエラーを返す（セキュリティゲート）。 */
  function executeFieldEdit(
    userId: string,
    field:  string,
    value:  string,
  ): { applied: boolean; name: string; field: string; value: string } | { ok: false; error: string } {
    if (!FIELD_EDIT_LABELS[field]) return { ok: false, error: `フィールド "${field}" は編集できません` }
    const rows    = service.getSnapshot().allocationList.filter(r => r.userId === userId)
    const primary = rows.find(r => !r.concurrentType) ?? rows[0]
    if (!primary) return { ok: false, error: 'ユーザーが見つかりません' }
    const name    = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
    const changes = { [field]: value || undefined } as AfterValues
    const label   = `${name} ${FIELD_EDIT_LABELS[field]}: ${value || '（削除）'}`
    const result  = service.executeOperation(new DirectEditOperation(primary.rowId, changes, label))
    return result.ok
      ? { applied: true, name, field: FIELD_EDIT_LABELS[field], value }
      : { ok: false, error: result.errors?.[0]?.message ?? 'エラー' }
  }

  const BULK_SET_BLOCKED_FIELDS = new Set(['userId', 'employeeNumber', 'rowId', 'positionCode', 'prevPositionCode'])

  /** BLOCKED_FIELDS に含まれるフィールドはエラーを返す（セキュリティゲート）。 */
  function executeBulkSetField(
    rowIds: number[],
    field:  string,
    value:  string,
  ): { applied: boolean; appliedCount: number; failedCount: number } | { ok: false; error: string } {
    if (BULK_SET_BLOCKED_FIELDS.has(field)) return { ok: false, error: `フィールド "${field}" は一括変更できません` }
    let appliedCount = 0, failedCount = 0
    for (const rowId of rowIds) {
      const changes = { [field]: value || undefined } as AfterValues
      const result  = service.executeOperation(
        new DirectEditOperation(rowId, changes, `${field}: ${value || '（クリア）'}`)
      )
      result.ok ? appliedCount++ : failedCount++
    }
    return { applied: true, appliedCount, failedCount }
  }

  function executeTransferPersons(
    userIds:       string[],
    targetOrgCode: string,
  ): { applied: number; targetOrgName: string; errors?: string[] } | { ok: false; error: string } {
    const { afterOrganizations, allocationList } = service.getSnapshot()
    const targetOrg = afterOrganizations.find(
      o => o.externalCode === targetOrgCode || o.id === targetOrgCode
    )
    if (!targetOrg) return { ok: false, error: '移動先組織が見つかりません' }

    let applied = 0
    const errors: string[] = []
    for (const userId of userIds) {
      const rows    = allocationList.filter(r => r.userId === userId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      if (!primary) continue
      const result = service.executeOperation(
        new TransferPersonOperation(primary.rowId, targetOrg.id, false)
      )
      if (result.ok) applied++
      else errors.push(result.errors?.[0]?.message ?? 'エラー')
    }

    if (applied === 0) return { ok: false, error: errors[0] ?? '対象行が見つかりません' }
    return { applied, targetOrgName: targetOrg.name, errors: errors.length ? errors : undefined }
  }

  function executeSetPromotion(userIds: string[]): { applied: number; total: number } {
    const { allocationList } = service.getSnapshot()
    let applied = 0
    for (const userId of userIds) {
      const rows    = allocationList.filter(r => r.userId === userId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      if (!primary) continue
      const name   = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
      const result = service.executeOperation(
        new DirectEditOperation(primary.rowId, { promotionSign: '1' }, `${name} 昇格`)
      )
      if (result.ok) applied++
    }
    return { applied, total: userIds.length }
  }

  function executeChangePosition(
    userId:      string,
    newJobTitle: string,
  ): { applied: boolean; newJobTitle: string; orgName: string } | { ok: false; error: string } {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const rows    = allocationList.filter(r => r.userId === userId)
    const primary = rows.find(r => !r.concurrentType) ?? rows[0]
    if (!primary) return { ok: false, error: '対象行が見つかりません' }

    const targetOrg = afterOrganizations.find(
      o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode
    )
    if (!targetOrg) return { ok: false, error: '所属組織が見つかりません' }

    const result = service.executeOperation(
      new TransferPersonOperation(primary.rowId, targetOrg.id, true, { localJobTitle: newJobTitle })
    )
    return result.ok
      ? { applied: true, newJobTitle, orgName: targetOrg.name }
      : { ok: false, error: result.errors?.[0]?.message ?? 'エラー' }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function formatErrors(errors: OperationError[]): string {
    return errors.map(e => e.field ? `[${e.field}] ${e.message}` : e.message).join('\n')
  }

  return {
    validateOperation, executeOperation, undo,
    createVacantPosition, assignPersonToVacantPosition, unassignPersonFromPosition, removePosition,
    getUnassignedPositions, assignPositionCodes,
    changeTitle, suggestTitleFields,
    setManagerPosition,
    reDeriveManagerNames, reDeriveOrgSubFields,
    executeBulkTransfer, executeFieldEdit, executeBulkSetField,
    executeTransferPersons, executeSetPromotion, executeChangePosition,
    formatErrors,
  }
}
