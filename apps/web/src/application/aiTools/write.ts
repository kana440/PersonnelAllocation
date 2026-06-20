import type { HRApplicationService } from '../HRApplicationService'
import type { EditCommand, ValidationResult, OperationError } from '@personnel/domain/commands/types'
import { ALL_MULTI_ROW_OPERATION_DEFS } from '@personnel/domain/commands/defs/index'
import type { AllocationRow, AfterValues } from '@personnel/domain/allocationRow'
import { ChangeTitleOperation, derivePersonGradeFields } from '@personnel/domain/commands/handlers/changeTitle'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'
import { BulkMoveToOrgOperation } from '@personnel/domain/commands/handlers/bulkMoveToOrg'
import { TransferPersonOperation } from '@personnel/domain/commands/handlers/transferPerson'
import {
  bindOperation,
  leaveOfAbsenceDef, returnFromLeaveDef,
  concurrentAddDef, concurrentReleaseDef,
  demotionDef,
  secondmentInSFDef, secondmentInNonSFDef,
  concurrentSecondmentInSFDef, concurrentSecondmentInNonSFDef,
} from '@personnel/domain/commands/defs'
import { buildFlatOrgView } from '@personnel/domain/choices/orgTree'
import { deriveFieldUpdates } from '@personnel/domain/derivation'
import { detectPatterns, type DetectContext } from '@personnel/domain/patterns/detection'
import { validateRow } from '@personnel/domain/validation/validateRow'
import type { ValidationIssue } from '@personnel/domain/validation/types'
import type { PositionCodeAssignment } from '../../ports'
import type { AIOperationResult } from './types'

export function createWriteMethods(service: HRApplicationService) {

  // ── Internal helper ───────────────────────────────────────────────────────

  function runPostValidation(
    beforeList: AllocationRow[],
  ): Array<{ rowId: number; issues: ValidationIssue[] }> {
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    const ctx: DetectContext = { allocationList, afterOrganizations, masters }
    const beforeMap = new Map(beforeList.map(r => [r.rowId, r]))
    return allocationList
      .filter(r => beforeMap.get(r.rowId) !== r)
      .map(r => ({
        rowId:  r.rowId,
        issues: validateRow({ row: r, afterOrganizations, masters, allocationList, changes: detectPatterns(r, ctx) }),
      }))
      .filter(v => v.issues.length > 0)
  }

  // ── Core operations ───────────────────────────────────────────────────────

  function validateOperation(op: EditCommand): ValidationResult {
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    return op.validate({ allocationList, afterOrganizations, masters })
  }

  function executeOperation(op: EditCommand): AIOperationResult {
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
    options?: { includeSubtree?: boolean },
  ): { applied: boolean; sourceOrgName: string; targetOrgName: string } | { ok: false; error: string } {
    const { afterOrganizations } = service.getSnapshot()
    const targetOrg = afterOrganizations.find(o => o.externalCode === targetOrgCode || o.id === targetOrgCode)
    if (!targetOrg) return { ok: false, error: '移動先組織が見つかりません' }

    let sourceOrgIds: string[]
    let sourceOrgName: string
    if (options?.includeSubtree) {
      const view = buildFlatOrgView(afterOrganizations)
      const root = view.find(e => e.orgCode === sourceOrgCode)
      if (!root) return { ok: false, error: '移動元組織が見つかりません' }
      const allCodes = new Set([root.orgCode, ...root.descendantCodes])
      sourceOrgIds  = afterOrganizations.filter(o => allCodes.has(o.externalCode ?? o.id)).map(o => o.id)
      sourceOrgName = `${root.orgName}（配下含む）`
    } else {
      const sourceOrg = afterOrganizations.find(o => o.externalCode === sourceOrgCode || o.id === sourceOrgCode)
      if (!sourceOrg) return { ok: false, error: '移動元組織が見つかりません' }
      sourceOrgIds  = [sourceOrg.id]
      sourceOrgName = sourceOrg.name
    }

    for (const sourceOrgId of sourceOrgIds) {
      const sourceOrg = afterOrganizations.find(o => o.id === sourceOrgId)!
      service.executeOperation(
        new BulkMoveToOrgOperation(sourceOrgId, targetOrg.id, `${sourceOrg.name} 全員 → ${targetOrg.name} 一括異動`)
      )
    }
    return { applied: true, sourceOrgName, targetOrgName: targetOrg.name }
  }

  // propose_field_edit で変更を許可するフィールドと表示ラベル。
  // positionCode / departmentCode / userId / managerPositionCode は専用 propose_xxx を使うため除外。
  const FIELD_EDIT_LABELS: Record<string, string> = {
    // 人・職務情報
    employmentType:             '雇用タイプ',
    band:                       'バンド',
    payGrade:                   '給与等級',
    officialPositionCode:       '役職コード',
    localJobTitle:              '役職名',
    jobFamily:                  'ジョブファミリー',
    jobType:                    'ジョブタイプ',
    // 勤務・配属情報
    location:                   '勤務場所',
    costCenter:                 'コストセンター',
    secondmentToCompany:        '出向先会社',
    secondmentFromCompany:      '出向元会社',
    secondmentFromEmployeeNumber: '出向元社員番号',
    // 申請・メタ情報
    transferReason:             '異動事由',
    concurrentReason:           '兼務理由',
    demotionReason:             '降格理由',
    memo:                       'メモ',
  }

  /** ALLOWED_FIELDS 以外のフィールドはエラーを返す（セキュリティゲート）。 */
  function executeFieldEdit(
    rowId: number,
    field: string,
    value: string,
  ): { applied: boolean; name: string; field: string; value: string } | { ok: false; error: string } {
    if (!FIELD_EDIT_LABELS[field]) return { ok: false, error: `フィールド "${field}" は編集できません` }
    const row = service.getSnapshot().allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, error: '行が見つかりません' }
    const name    = [row.lastName, row.firstName].filter(Boolean).join(' ')
    const changes = { [field]: value || undefined } as AfterValues
    const label   = `${name} ${FIELD_EDIT_LABELS[field]}: ${value || '（削除）'}`
    const result  = service.executeOperation(new DirectEditOperation(rowId, changes, label))
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

  function resolveTransferRowIds(filter: { name?: string; subtreeOrgCode?: string }): number[] {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    let subtreeCodes: Set<string> | null = null
    if (filter.subtreeOrgCode) {
      const view = buildFlatOrgView(afterOrganizations)
      const root = view.find(e => e.orgCode === filter.subtreeOrgCode)
      if (root) subtreeCodes = new Set([root.orgCode, ...root.descendantCodes])
    }
    return allocationList
      .filter(row => {
        if (!row.userId && !row.lastName && !row.firstName) return false
        if (filter.name) {
          const name = [row.lastName, row.firstName].filter(Boolean).join(' ')
          if (!name.includes(filter.name)) return false
        }
        if (subtreeCodes && !subtreeCodes.has(row.departmentCode ?? '')) return false
        return true
      })
      .map(r => r.rowId)
  }

  function executeTransferPersons(
    rowIds:          number[],
    targetOrgCode:   string,
    transferReason?: string,
  ): { applied: number; targetOrgName: string; transferReason?: string; errors?: string[] } | { ok: false; error: string } {
    const { afterOrganizations, allocationList } = service.getSnapshot()
    const targetOrg = afterOrganizations.find(
      o => o.externalCode === targetOrgCode || o.id === targetOrgCode
    )
    if (!targetOrg) return { ok: false, error: '移動先組織が見つかりません' }

    let applied = 0
    const errors: string[] = []
    for (const rowId of rowIds) {
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row) continue
      const result = service.executeOperation(new TransferPersonOperation(rowId, targetOrg.id, false))
      if (result.ok) {
        applied++
        // transferReason が指定されていれば別途 DirectEdit で設定
        if (transferReason) {
          service.saveRow(rowId, { transferReason } as AfterValues)
        }
      } else {
        errors.push(result.errors?.[0]?.message ?? 'エラー')
      }
    }

    if (applied === 0) return { ok: false, error: errors[0] ?? '対象行が見つかりません' }
    return { applied, targetOrgName: targetOrg.name, transferReason, errors: errors.length ? errors : undefined }
  }

  /**
   * 昇格実行: positionBand → band（社員のみ連動）→ payGrade（自動導出）の連鎖を実行する。
   * officialPositionCode / localJobTitle が指定されれば同時に変更する。
   */
  function executePromotion(opts: {
    rowId:                    number
    newPositionBand:          string
    newOfficialPositionCode?: string
    newLocalJobTitle?:        string
  }): { ok: true; name: string; diff: Record<string, { before: string | undefined; after: string | undefined }> } | { ok: false; error: string } {
    const { allocationList, masters } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === opts.rowId)
    if (!row) return { ok: false, error: '対象行が見つかりません' }

    const changes: Partial<AllocationRow> = { positionBand: opts.newPositionBand }

    // positionBand → band（社員なら連動）→ payGrade は deriveFieldUpdates が一括処理
    const derived = deriveFieldUpdates(changes as AfterValues, row, masters, allocationList)
    Object.assign(changes, derived)

    if (opts.newOfficialPositionCode !== undefined) changes.officialPositionCode = opts.newOfficialPositionCode
    if (opts.newLocalJobTitle        !== undefined) changes.localJobTitle        = opts.newLocalJobTitle

    const name   = [row.lastName, row.firstName].filter(Boolean).join(' ')
    const result = service.executeOperation(
      new DirectEditOperation(opts.rowId, changes as AfterValues, `${name} 昇格`)
    )
    if (!result.ok) return { ok: false, error: result.errors?.[0]?.message ?? 'エラー' }

    // LLM に実際の変更内容を返す
    const diff: Record<string, { before: string | undefined; after: string | undefined }> = {}
    for (const [field, after] of Object.entries(changes)) {
      const before = (row as Record<string, unknown>)[field] as string | undefined
      if (String(before ?? '') !== String(after ?? '')) {
        diff[field] = { before, after: after as string | undefined }
      }
    }
    return { ok: true, name, diff }
  }

  function executeChangePosition(
    rowId:       number,
    newJobTitle: string,
  ): { applied: boolean; newJobTitle: string; orgName: string } | { ok: false; error: string } {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, error: '対象行が見つかりません' }

    const targetOrg = afterOrganizations.find(
      o => o.externalCode === row.departmentCode || o.id === row.departmentCode
    )
    if (!targetOrg) return { ok: false, error: '所属組織が見つかりません' }

    const result = service.executeOperation(
      new TransferPersonOperation(rowId, targetOrg.id, true, { localJobTitle: newJobTitle })
    )
    return result.ok
      ? { applied: true, newJobTitle, orgName: targetOrg.name }
      : { ok: false, error: result.errors?.[0]?.message ?? 'エラー' }
  }

  // ── Pattern operations (AI coarse-grained, same path as Web dialogs) ─────────

  function executeOrgTransfer(rowId: number, departmentCode: string): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const result     = service.executeOrgTransfer(rowId, departmentCode)
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeJobTypeChange(rowId: number, fields: {
    jobFamily?: string
    jobType?:   string
  }): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const result     = service.executeJobTypeChange(rowId, fields)
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeResignation(rowId: number, transferReason: string, memo?: string): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const result     = service.executeResignation(rowId, transferReason, memo)
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeVacantPositionMove(sourceRowId: number, targetRowId: number): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const result     = service.executeVacantPositionMove(sourceRowId, targetRowId)
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeSecondmentRelease(rowId: number, fields: {
    employmentType?:        string
    secondmentToCompany?:   string
    secondmentFromCompany?: string
    transferReason?:        string
    memo?:                  string
  }): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const result     = service.executeSecondmentRelease(rowId, fields)
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  // ── Tier 2 operations ────────────────────────────────────────────────────

  function executeLeaveOfAbsence(
    rowId: number,
    memo?: string,
  ): AIOperationResult {
    const { allocationList } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, errors: [{ message: '行が見つかりません' }] }
    const beforeList = allocationList
    const result = service.executeOperation(
      bindOperation(leaveOfAbsenceDef, rowId, {
        leaveOfAbsenceSign: '1',
        transferReason: '【個別対応】4/1付休職・復職',
        ...(memo !== undefined ? { memo } : {}),
      })
    )
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeReturnFromLeave(rowId: number): AIOperationResult {
    const { allocationList } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, errors: [{ message: '行が見つかりません' }] }
    const beforeList = allocationList
    const result = service.executeOperation(
      bindOperation(returnFromLeaveDef, rowId, {
        transferReason: '【個別対応】4/1付休職・復職',
      })
    )
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeConcurrentAdd(
    rowId:             number,
    targetOrgCode:     string,
    concurrentReason?: string,
  ): AIOperationResult {
    const { allocationList, afterOrganizations } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, errors: [{ message: '行が見つかりません' }] }
    const org = afterOrganizations.find(o => o.externalCode === targetOrgCode || o.id === targetOrgCode)
    if (!org) return { ok: false, errors: [{ message: '兼務先組織が見つかりません' }] }
    const beforeList = allocationList
    const result = service.executeOperation(
      bindOperation(concurrentAddDef, rowId, {
        departmentCode: org.id,
        concurrentReason,
      })
    )
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeConcurrentRelease(rowId: number): AIOperationResult {
    const { allocationList } = service.getSnapshot()
    const targetRow = allocationList.find(r => r.rowId === rowId)
    if (!targetRow) return { ok: false, errors: [{ message: '対象行が見つかりません' }] }
    if (targetRow.concurrentType !== '兼務')
      return { ok: false, errors: [{ message: '社内兼務行ではありません' }] }
    const beforeList = allocationList
    const result = service.executeOperation(bindOperation(concurrentReleaseDef, rowId, {}))
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeDemotionForUser(
    rowId:  number,
    fields: { positionBand?: string; officialPositionCode?: string; localJobTitle?: string; band?: string; payGrade?: string; demotionReason?: string },
  ): AIOperationResult {
    const { allocationList } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, errors: [{ message: '行が見つかりません' }] }
    const beforeList = allocationList
    const result = service.executeOperation(bindOperation(demotionDef, rowId, fields))
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  // ── 出向受入 ──────────────────────────────────────────────────────────────

  function executeSecondmentIn(
    rowId:        number,
    sfIntegrated: boolean,
    fields: {
      secondmentFromCompany:         string
      secondmentFromEmployeeNumber?: string
      departmentCode:                string
      employmentType:                string
    },
  ): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const def = sfIntegrated ? secondmentInSFDef : secondmentInNonSFDef
    const result = service.executeOperation(bindOperation(def, rowId, fields))
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  function executeConcurrentSecondmentIn(
    rowId:        number,
    sfIntegrated: boolean,
    fields: {
      secondmentFromCompany:         string
      secondmentFromEmployeeNumber?: string
      departmentCode:                string
      employmentType:                string
      concurrentReason?:             string
    },
  ): AIOperationResult {
    const beforeList = service.getSnapshot().allocationList
    const def = sfIntegrated ? concurrentSecondmentInSFDef : concurrentSecondmentInNonSFDef
    const result = service.executeOperation(bindOperation(def, rowId, fields))
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function formatErrors(errors: OperationError[]): string {
    return errors.map(e => e.field ? `[${e.field}] ${e.message}` : e.message).join('\n')
  }

  function executeMultiRowOperation(
    id:            string,
    anchorRowId:   number,
    sectionValues: Record<string, string>[],
  ): AIOperationResult {
    const def = ALL_MULTI_ROW_OPERATION_DEFS.find(d => d.id === id)
    if (!def) return { ok: false, errors: [{ message: `MultiRowOperation "${id}" が見つかりません` }] }
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    const anchor = allocationList.find(r => r.rowId === anchorRowId)
    if (!anchor) return { ok: false, errors: [{ message: `行 ${anchorRowId} が見つかりません` }] }
    if (!def.availableFor(anchor, masters, allocationList)) {
      return { ok: false, errors: [{ message: `${def.label} はこの行では使用できません` }] }
    }
    const beforeList = allocationList
    const cmd    = def.createCommand(anchorRowId, sectionValues, { allocationList, afterOrganizations, masters })
    const result = service.executeOperation(cmd)
    if (!result.ok) return result
    return { ok: true, postValidation: runPostValidation(beforeList) }
  }

  return {
    validateOperation, executeOperation, undo,
    executeMultiRowOperation,
    createVacantPosition, assignPersonToVacantPosition, unassignPersonFromPosition, removePosition,
    getUnassignedPositions, assignPositionCodes,
    changeTitle, suggestTitleFields,
    setManagerPosition,
    reDeriveManagerNames, reDeriveOrgSubFields,
    executeBulkTransfer, executeFieldEdit, executeBulkSetField,
    resolveTransferRowIds, executeTransferPersons, executePromotion, executeChangePosition,
    executeOrgTransfer, executeJobTypeChange,
    executeResignation, executeVacantPositionMove, executeSecondmentRelease,
    executeLeaveOfAbsence, executeReturnFromLeave,
    executeConcurrentAdd, executeConcurrentRelease, executeDemotionForUser,
    executeSecondmentIn, executeConcurrentSecondmentIn,
    formatErrors,
  }
}
