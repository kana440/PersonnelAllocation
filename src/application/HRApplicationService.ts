import type { Organization } from '../domain/schemas'
import type { AllCodeLists } from '../domain/codeLists/aggregate'
import { EMPTY_CODE_LISTS } from '../domain/codeLists/aggregate'
import type { AllocationRow } from '../domain/allocationRow'
import { nextRowId } from '../domain/allocationRow'
import type { AfterValues } from '../domain/allocationRow'
import type { IDomainOperation, ValidationResult } from '../domain/operation/types'
import { fail } from '../domain/operation/types'
import { DirectEditOperation }  from '../domain/operation/handlers/directEdit'
import {
  CreateVacantPositionOperation,
  RemovePositionOperation,
  UnassignPersonFromPositionOperation,
  AssignPersonToPositionOperation,
} from '../domain/operation/handlers/positionOps'
import { derivePersons } from '../domain/projection/rows'
import type { Person } from '../domain/schemas'
import type { IOperationPattern, PatternDetectionResult } from '../domain/operationPatterns/types'
import { matchAllPatterns } from '../domain/operationPatterns/patternMatcher'
import { mergeAllocationList } from '../domain/importMerge'
import type { ImportMode, MergeResult } from '../domain/importMerge'
import { UndoStack } from './UndoStack'
import type { HistoryEntry } from './UndoStack'

// ── DomainSnapshot ────────────────────────────────────────────────────────────
export interface DomainSnapshot {
  allocationList:            AllocationRow[]
  beforeOrganizations:       Organization[]
  afterOrganizations:        Organization[]
  codeLists:                 AllCodeLists
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
}

// ── HRApplicationService ──────────────────────────────────────────────────────
export class HRApplicationService {
  private allocationList:      AllocationRow[] = []
  private beforeOrganizations: Organization[]  = []
  private afterOrganizations:  Organization[]  = []
  private codeLists:           AllCodeLists    = EMPTY_CODE_LISTS

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
      codeLists:           this.codeLists,
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
    }
  }

  // ── Excel インポート時の一括ロード ────────────────────────────
  loadExcelData(data: {
    allocationList:      AllocationRow[]
    beforeOrganizations: Organization[]
    afterOrganizations:  Organization[]
    codeLists:           AllCodeLists
  }): void {
    this.historyPreviewPosition = null  // プレビューをリセット
    this.allocationList      = data.allocationList
    this.beforeOrganizations = data.beforeOrganizations
    this.afterOrganizations  = data.afterOrganizations
    this.codeLists           = data.codeLists
    this.undoStack.clear()
    this.emit()
  }

  // ── 追加インポート（マージ）────────────────────────────────
  mergeExcelData(data: {
    allocationList: AllocationRow[]
    mode:           ImportMode
    scopeOrgId:     string | null
  }): MergeResult {
    if (this.isPreviewMode) {
      return { rows: this.allocationList, added: 0, kept: this.allocationList.length, removed: 0 }
    }
    const result = mergeAllocationList({
      existing:   this.allocationList,
      incoming:   data.allocationList,
      mode:       data.mode,
      scopeOrgId: data.scopeOrgId,
      afterOrgs:  this.afterOrganizations,
    })
    const before = this.allocationList
    this.allocationList = result.rows
    const patch = this.undoStack.computePatch(before, result.rows, this.afterOrganizations)
    patch.label = 'Excelインポート（差分）'
    this.undoStack.push(patch)
    this.emit()
    return result
  }

  // ── 操作の実行（差分をスタックに積む）────────────────────────
  executeOperation(op: IDomainOperation): ValidationResult {
    if (this.isPreviewMode) return fail('プレビュー中は編集できません')
    const ctx = {
      allocationList:     this.allocationList,
      afterOrganizations: this.afterOrganizations,
      codeLists:          this.codeLists,
    }
    const result = op.validate(ctx)
    if (!result.ok) return result

    const beforeList = this.allocationList
    const beforeOrgs = this.afterOrganizations
    const applied    = op.apply(ctx)

    const patch = this.undoStack.computePatch(beforeList, applied.updatedList, beforeOrgs, applied.updatedOrgs)
    patch.label = applied.label
    this.undoStack.push(patch)
    this.allocationList = applied.updatedList
    if (applied.updatedOrgs) this.afterOrganizations = applied.updatedOrgs
    this.emit()
    return result
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
    } as AllocationRow

    this.undoStack.push({ rowDiffs: [{ rowId: newRow.rowId, before: null, after: newRow }], label: `新規採用: ${opts.lastName}${opts.firstName}` })
    this.allocationList = [...this.allocationList, newRow]
    this.emit()
  }

  // ── ポジション操作（positionOps.ts の IDomainOperation に委譲）────

  createVacantPosition(departmentCode: string, localJobTitle: string, extraFields?: Partial<AllocationRow>): void {
    this.executeOperation(new CreateVacantPositionOperation(departmentCode, localJobTitle, extraFields))
  }

  removePosition(rowId: number): void {
    this.executeOperation(new RemovePositionOperation(rowId))
  }

  unassignPersonFromPosition(occupiedRowId: number): void {
    this.executeOperation(new UnassignPersonFromPositionOperation(occupiedRowId))
  }

  assignPersonToVacantPosition(vacantRowId: number, personSfId: string): void {
    this.executeOperation(new AssignPersonToPositionOperation(vacantRowId, personSfId))
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
    this.codeLists           = EMPTY_CODE_LISTS
    this.undoStack.clear()
    this.emit()
  }
}

export const appService = new HRApplicationService()
