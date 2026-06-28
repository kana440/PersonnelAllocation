import type { Organization } from '@personnel/domain/schemas'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import { EMPTY_MASTERS } from '@personnel/domain/masters/aggregate'
import { validateMastersIntegrity, type MasterWarning } from '@personnel/domain/masters/validateMasters'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { nextRowId } from '@personnel/domain/allocationRow'
import type { AfterValues } from '@personnel/domain/allocationRow'
import type { EditCommand, ValidationResult } from '@personnel/domain/commands/types'
import { fail } from '@personnel/domain/commands/types'
import { DirectEditOperation }  from '@personnel/domain/commands/handlers/directEdit'
import {
  CreateVacantPositionOperation,
  RemovePositionOperation,
  UnassignPersonFromPositionOperation,
  AssignPersonToPositionOperation,
} from '@personnel/domain/commands/handlers/positionOps'
import { bindOperation, orgTransferDef, promotionDef, jobTypeChangeDef, wouldBandChange } from '@personnel/domain/commands/defs'
import {
  ResignationOperation,
  VacantPositionMoveOperation,
  SecondmentReleaseOperation,
} from '@personnel/domain/commands/handlers/patternOps'
import type { SecondmentReleaseFields } from '@personnel/domain/commands/handlers/patternOps'
import { AssignPositionCodesOperation } from '@personnel/domain/commands/handlers/assignPositionCodes'
import type { PositionCodeAssignment } from '../ports'
import { derivePersons } from '@personnel/domain/choices/rows'
import type { Person } from '@personnel/domain/schemas'
import type { IOperationPattern, PatternDetectionResult } from '@personnel/domain/patterns/groupPatternTypes'
import { matchAllPatterns } from '@personnel/domain/patterns/groupPatternMatcher'
import { mergeAllocationList } from '../application/importMerge'
import type { ImportMode, AssigneeImportMode, MergeResult } from '../application/importMerge'
import { reDeriveManagerNamesForList, reDeriveOrgSubFieldsForList } from '@personnel/domain/commands/orgHelpers'
import { UndoStack } from './UndoStack'
import type { HistoryEntry } from './UndoStack'

// ── DomainSnapshot ────────────────────────────────────────────────────────────
export interface DomainSnapshot {
  allocationList:            AllocationRow[]
  beforeOrganizations:       Organization[]
  afterOrganizations:        Organization[]
  masters:                 AllMasters
  persons:                   Person[]
  canUndo:                   boolean
  canRedo:                   boolean
  undoHistory:               HistoryEntry[]
  historyCurrentPosition:    number              // = past.length（現在位置）
  isHistoryPreviewMode:      boolean
  historyPreviewPosition:    number | null       // プレビュー中の position（null = 現在）
  previewAllocationList:     AllocationRow[] | null
  previewPersons:            Person[] | null
  previewAfterOrganizations: Organization[] | null
  patternCache:              Map<string, PatternDetectionResult>
  organizations:             Organization[]      // = beforeOrganizations（後方互換エイリアス）
  masterWarnings:          MasterWarning[]   // マスタ整合性警告（インポート時に検出）
}

// ── HRApplicationService ──────────────────────────────────────────────────────
export class HRApplicationService {
  private allocationList:      AllocationRow[] = []
  private beforeOrganizations: Organization[]  = []
  private afterOrganizations:  Organization[]  = []
  private masters:           AllMasters    = EMPTY_MASTERS
  private masterWarnings:    MasterWarning[] = []

  private undoStack = new UndoStack()

  private historyPreviewPosition: number | null = null

  private patterns:     IOperationPattern[]               = []
  private patternCache: Map<string, PatternDetectionResult> = new Map()
  private cachedPersons: Person[] | null = null   // emit() ごとに無効化
  private listeners = new Set<() => void>()

  registerPatterns(patterns: IOperationPattern[]): void {
    this.patterns = patterns
    this.rebuildPatternCache()
  }

  private rebuildPatternCache(): void {
    if (this.patterns.length === 0) return
    this.patternCache = matchAllPatterns(this.allocationList, this.patterns)
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit(): void {
    this.cachedPersons = null   // allocationList が変わったのでキャッシュ破棄
    this.rebuildPatternCache()
    this.listeners.forEach(fn => fn())
  }

  private get isPreviewMode(): boolean {
    return this.historyPreviewPosition !== null
  }

  // ── スナップショット取得 ───────────────────────────────────────
  getSnapshot(): DomainSnapshot {
    if (!this.cachedPersons) this.cachedPersons = derivePersons(this.allocationList)
    return {
      allocationList:      this.allocationList,
      beforeOrganizations: this.beforeOrganizations,
      afterOrganizations:  this.afterOrganizations,
      masters:           this.masters,
      persons:             this.cachedPersons,
      canUndo:             !this.isPreviewMode && this.undoStack.canUndo,
      canRedo:             !this.isPreviewMode && this.undoStack.canRedo,
      undoHistory:         this.undoStack.getFullHistory(),
      historyCurrentPosition:    this.undoStack.pastLength,
      isHistoryPreviewMode:      this.historyPreviewPosition !== null,
      historyPreviewPosition:    this.historyPreviewPosition,
      ...this.buildPreviewSnapshot(),
      patternCache:        this.patternCache,
      organizations:       this.beforeOrganizations,
      masterWarnings:    this.masterWarnings,
    }
  }

  // ── Excel インポート時の一括ロード ────────────────────────────
  loadExcelData(data: {
    allocationList:      AllocationRow[]
    beforeOrganizations: Organization[]
    afterOrganizations:  Organization[]
    masters:           AllMasters
  }): void {
    this.historyPreviewPosition = null  // プレビューをリセット
    this.allocationList      = data.allocationList
    this.beforeOrganizations = data.beforeOrganizations
    this.afterOrganizations  = data.afterOrganizations
    this.masters        = data.masters
    this.masterWarnings = validateMastersIntegrity(data.masters)
    this.undoStack.clear()
    this.emit()
  }

  // STEP2 用: 行データのみ差し替え（既存マスタを保持）
  loadRowsOnly(rows: AllocationRow[]): void {
    this.historyPreviewPosition = null
    this.allocationList = rows
    this.undoStack.clear()
    this.emit()
  }

  // ── 追加インポート（マージ）────────────────────────────────
  mergeExcelData(data: {
    allocationList: AllocationRow[]
    mode:           ImportMode
    assigneeMode:   AssigneeImportMode
  }): MergeResult {
    if (this.isPreviewMode) {
      return { rows: this.allocationList, added: 0, kept: this.allocationList.length, removed: 0 }
    }
    const result = mergeAllocationList({
      existing:     this.allocationList,
      incoming:     data.allocationList,
      mode:         data.mode,
      assigneeMode: data.assigneeMode,
    })
    const before = this.allocationList
    this.allocationList = result.rows
    const patch = this.undoStack.computePatch(before, result.rows, this.afterOrganizations)
    patch.label = 'Excelインポート（差分）'
    this.undoStack.push(patch)
    this.emit()
    return result
  }

  // ── 操作の実行（Undo 対象）────────────────────────────────────────
  executeOperation(op: EditCommand): ValidationResult {
    if (this.isPreviewMode) return fail('プレビュー中は編集できません')

    const beforeList = this.allocationList
    const beforeOrgs = this.afterOrganizations

    const ctx = {
      allocationList:     this.allocationList,
      afterOrganizations: this.afterOrganizations,
      masters:          this.masters,
    }

    const vr = op.validate(ctx)
    if (!vr.ok) return vr
    const result = op.apply(ctx)

    const finalOrgs = result.updatedOrgs
    const patch = this.undoStack.computePatch(beforeList, result.updatedList, beforeOrgs, finalOrgs)
    this.undoStack.push({ ...patch, label: result.label })
    this.allocationList     = result.updatedList
    this.afterOrganizations = result.updatedOrgs ?? this.afterOrganizations
    this.emit()
    return { ok: true }
  }

  // ── 複数コマンドを1 Undo エントリとして実行 ─────────────────────
  executeBatch(label: string, commands: EditCommand[]): ValidationResult {
    if (this.isPreviewMode) return fail('プレビュー中は編集できません')
    if (commands.length === 0) return { ok: true }

    const beforeList = this.allocationList
    const beforeOrgs = this.afterOrganizations

    let list = this.allocationList
    let orgs = this.afterOrganizations

    for (const cmd of commands) {
      const ctx = { allocationList: list, afterOrganizations: orgs, masters: this.masters }
      const vr = cmd.validate(ctx)
      if (!vr.ok) return vr
      const result = cmd.apply(ctx)
      list = result.updatedList
      orgs = result.updatedOrgs ?? orgs
    }

    const patch = this.undoStack.computePatch(beforeList, list, beforeOrgs, orgs)
    this.undoStack.push({ ...patch, label })
    this.allocationList     = list
    this.afterOrganizations = orgs
    this.emit()
    return { ok: true }
  }

  // ── 行の直接編集（Undo なし・プレビュー/AI 内部用）────────────
  editRow(rowId: number, changes: AfterValues): void {
    if (this.isPreviewMode) return
    const idx = this.allocationList.findIndex(r => r.rowId === rowId)
    if (idx < 0) return
    this.allocationList = this.allocationList.map((r, i) =>
      i === idx ? { ...r, ...changes } : r
    )
    this.emit()
  }

  saveRow(rowId: number, changes: AfterValues): ValidationResult {
    const row   = this.allocationList.find(r => r.rowId === rowId)
    const label = row
      ? `${row.lastName ?? ''}${row.firstName ?? ''} 編集`
      : `行 ${rowId} 編集`
    return this.executeOperation(new DirectEditOperation(rowId, changes, label))
  }

  // ── 新規採用行の追加（差分をスタックに積む）──────────────────
  addNewHireRow(opts: {
    lastName:       string
    firstName:      string
    userId:         string
    employeeNumber?: string
    departmentCode?: string
    companyId?:     string
    effectiveDate:  string
    assignee?:      string
  }): void {
    if (this.isPreviewMode) return
    const newRow: AllocationRow = {
      rowId:          nextRowId(this.allocationList),
      userId:         opts.userId,
      lastName:       opts.lastName,
      firstName:      opts.firstName,
      employeeNumber: opts.employeeNumber ?? '',
      employmentType: '正社員',
      departmentCode: opts.departmentCode ?? '',
      assignee:       opts.assignee,
    } as AllocationRow

    this.undoStack.push({ rowDiffs: [{ rowId: newRow.rowId, before: null, after: newRow }], label: `新規採用: ${opts.lastName}${opts.firstName}` })
    this.allocationList = [...this.allocationList, newRow]
    this.emit()
  }

  // ── ポジション操作（positionOps.ts の EditCommand に委譲）────

  createVacantPosition(departmentCode: string, localJobTitle: string, extraFields?: Partial<AllocationRow>): void {
    this.executeOperation(new CreateVacantPositionOperation(departmentCode, localJobTitle, extraFields))
  }

  createSecondmentInRow(departmentCode: string, values: {
    userId?:                      string
    employeeNumber?:              string
    lastName?:                    string
    firstName?:                   string
    secondmentFromCompany:        string
    secondmentFromEmployeeNumber?: string
    employmentType?:              string
    concurrentType?:              '兼務'
    concurrentReason?:            string
  }): void {
    const { concurrentType, ...rest } = values
    const extra: Partial<AllocationRow> = {
      ...rest,
      ...(concurrentType ? { concurrentType } : {}),
    }
    this.executeOperation(new CreateVacantPositionOperation(departmentCode, '', extra))
  }

  removePosition(rowId: number): void {
    this.executeOperation(new RemovePositionOperation(rowId))
  }

  unassignPersonFromPosition(occupiedRowId: number): void {
    this.executeOperation(new UnassignPersonFromPositionOperation(occupiedRowId))
  }

  /**
   * バンドが変わるかどうかを DryRun で確認する。
   * 変わる場合は { from, to } を返す。ダイアログ表示の判断に使う。
   */
  checkAssignBandChange(vacantRowId: number, personSfId: string): { from: string; to: string } | null {
    const vacantRow = this.allocationList.find(r => r.rowId === vacantRowId)
    const personRow = this.allocationList.find(r => r.userId === personSfId && !r.concurrentType)
                   ?? this.allocationList.find(r => r.userId === personSfId)
    if (!vacantRow || !personRow) return null
    return wouldBandChange(personRow, vacantRow)
  }

  assignPersonToVacantPosition(
    vacantRowId: number,
    personSfId:  string,
    opts?: { leaveSourceVacant?: boolean; overrideBand?: boolean },
  ): void {
    // leaveSourceVacant が未指定のとき、部下の有無で自動判定する
    let leaveSourceVacant = opts?.leaveSourceVacant
    if (leaveSourceVacant === undefined) {
      const personRow = this.allocationList.find(r => r.userId === personSfId && !r.concurrentType)
                     ?? this.allocationList.find(r => r.userId === personSfId)
      if (personRow?.positionCode) {
        leaveSourceVacant = this.allocationList.some(
          r => r.rowId !== personRow.rowId &&
               (r.managerPositionCode as string | undefined) === (personRow.positionCode as string | undefined)
        )
      } else {
        leaveSourceVacant = false
      }
    }
    this.executeOperation(new AssignPersonToPositionOperation(
      vacantRowId, personSfId, leaveSourceVacant, opts?.overrideBand,
    ))
  }

  // ── ポジションコード割当 ──────────────────────────────────────────

  /** _pos_XXX 形式の内部ポジションコードを持つ行を返す */
  getUnassignedPositions(): Array<{
    rowId:          number
    positionCode:   string
    localJobTitle:  string
    departmentCode: string
    orgName:        string
  }> {
    return this.allocationList
      .filter(r => String(r.positionCode ?? '').startsWith('_pos_'))
      .map(r => {
        const org = this.afterOrganizations.find(
          o => (o.externalCode ?? o.id) === r.departmentCode
        )
        return {
          rowId:          r.rowId,
          positionCode:   String(r.positionCode),
          localJobTitle:  r.localJobTitle ?? '',
          departmentCode: r.departmentCode ?? '',
          orgName:        org?.name ?? r.departmentCode ?? '',
        }
      })
  }

  /** 内部採番コードを外部コードに置き換える（managerPositionCode も連動更新）*/
  assignPositionCodes(assignments: PositionCodeAssignment[]): ValidationResult {
    return this.executeOperation(new AssignPositionCodesOperation(assignments))
  }

  // ── 業務パターン操作（Web パターンダイアログ・AI 共通エントリポイント）────

  /** 組織異動：departmentCode を変更し org sub-fields を自動補完する */
  executeOrgTransfer(rowId: number, departmentCode: string): ValidationResult {
    return this.executeOperation(bindOperation(orgTransferDef, rowId, {
      departmentCode,
      managerPositionCode: undefined,
      managerName:         undefined,
    }))
  }

  /** 昇降格：役職・バンド・給与等級などを更新する */
  executePromotion(rowId: number, fields: Partial<AllocationRow>): ValidationResult {
    return this.executeOperation(bindOperation(promotionDef, rowId, fields))
  }

  /** ジョブタイプ変更：jobFamily / jobType を更新する */
  executeJobTypeChange(rowId: number, fields: Partial<AllocationRow>): ValidationResult {
    return this.executeOperation(bindOperation(jobTypeChangeDef, rowId, fields))
  }

  /** 退職設定：異動事由を退職値に設定し、メモを更新する */
  executeResignation(rowId: number, transferReason: string, memo?: string): ValidationResult {
    return this.executeOperation(new ResignationOperation(rowId, transferReason, memo))
  }

  /** 空きポジション異動：person を sourceRow から targetRow の空席に移動する */
  executeVacantPositionMove(sourceRowId: number, targetRowId: number): ValidationResult {
    return this.executeOperation(new VacantPositionMoveOperation(sourceRowId, targetRowId))
  }

  /** 出向解除：雇用タイプ・出向先などを更新する（prev が出向の行のみ有効）*/
  executeSecondmentRelease(rowId: number, fields: SecondmentReleaseFields): ValidationResult {
    return this.executeOperation(new SecondmentReleaseOperation(rowId, fields))
  }

  // ── 上司姓名の一括再導出 ────────────────────────────────────────
  // managerPositionCode に在籍する人の現在の姓名を managerName に書き戻す。
  // 単一の Undo エントリとして記録される。
  reDeriveManagerNames(): number {
    return this._reDeriveAndCommit(
      reDeriveManagerNamesForList(this.allocationList),
      '上司姓名 一括再導出',
    )
  }

  reDeriveOrgSubFields(): number {
    return this._reDeriveAndCommit(
      reDeriveOrgSubFieldsForList(this.allocationList, this.masters),
      '組織サブフィールド 一括再導出',
    )
  }

  private _reDeriveAndCommit(updated: AllocationRow[], labelPrefix: string): number {
    if (this.isPreviewMode) return 0
    const before  = this.allocationList
    const changed = updated.filter((r, i) => r !== before[i]).length
    if (changed === 0) return 0
    const patch = this.undoStack.computePatch(before, updated, this.afterOrganizations)
    patch.label = `${labelPrefix} (${changed}行)`
    this.undoStack.push(patch)
    this.allocationList = updated
    this.emit()
    return changed
  }

  // ── 履歴プレビュー ────────────────────────────────────────────
  private buildPreviewSnapshot(): {
    previewAllocationList:     AllocationRow[] | null
    previewPersons:            Person[] | null
    previewAfterOrganizations: Organization[] | null
  } {
    if (this.historyPreviewPosition === null) {
      return { previewAllocationList: null, previewPersons: null, previewAfterOrganizations: null }
    }
    const { allocationList, afterOrganizations } = this.undoStack.computeStateAt(
      this.allocationList, this.afterOrganizations, this.historyPreviewPosition,
    )
    return {
      previewAllocationList:     allocationList,
      previewPersons:            derivePersons(allocationList),
      previewAfterOrganizations: afterOrganizations,
    }
  }

  previewHistoryAt(targetPosition: number): void {
    const clamp = Math.max(0, Math.min(
      this.undoStack.pastLength + this.undoStack.futureLength, targetPosition
    ))
    // 現在位置と同じならプレビューを解除
    this.historyPreviewPosition = clamp === this.undoStack.pastLength ? null : clamp
    this.emit()
  }

  cancelHistoryPreview(): void {
    this.historyPreviewPosition = null
    this.emit()
  }

  applyHistoryPreview(): void {
    const target = this.historyPreviewPosition
    if (target === null) return
    this.historyPreviewPosition = null
    // 実際に undo/redo してターゲット位置に移動
    const current = this.undoStack.pastLength
    if (target < current) {
      let count = current - target
      while (count-- > 0) this.undo()
    } else if (target > current) {
      let count = target - current
      while (count-- > 0) this.redo()
    }
    this.emit()
  }

  // ── Undo / Redo ───────────────────────────────────────────────
  undo(): void {
    if (this.isPreviewMode) return
    const patch = this.undoStack.undo()
    if (!patch) return
    const next = this.undoStack.applyPatch(this.allocationList, this.afterOrganizations, patch, 'undo')
    this.allocationList     = next.allocationList
    this.afterOrganizations = next.afterOrganizations
    this.emit()
  }

  /** past[index] の直後の状態まで undo/redo で戻る */
  revertToHistoryIndex(index: number, direction: 'past' | 'future'): void {
    if (direction === 'past') {
      const target = index + 1  // past を index+1 個残す
      while (this.undoStack.pastLength > target) this.undo()
    } else {
      // future エントリを先頭から redo
      let redoCount = index + 1
      while (redoCount-- > 0) this.redo()
    }
  }

  redo(): void {
    if (this.isPreviewMode) return
    const patch = this.undoStack.redo()
    if (!patch) return
    const next = this.undoStack.applyPatch(this.allocationList, this.afterOrganizations, patch, 'redo')
    this.allocationList     = next.allocationList
    this.afterOrganizations = next.afterOrganizations
    this.emit()
  }

  reset(): void {
    this.allocationList      = []
    this.beforeOrganizations = []
    this.afterOrganizations  = []
    this.masters           = EMPTY_MASTERS
    this.undoStack.clear()
    this.emit()
  }
}

export const appService = new HRApplicationService()
