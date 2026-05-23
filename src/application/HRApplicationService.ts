import type { Organization } from '../domain/schemas'
import type { AllCodeLists } from '../domain/codeLists/aggregate'
import { EMPTY_CODE_LISTS } from '../domain/codeLists/aggregate'
import type { AllocationRow } from '../domain/allocationRow'
import { nextRowId } from '../domain/allocationRow'
import type { AfterValues } from '../domain/allocationRow'
import type { IDomainOperation, ValidationResult } from '../domain/operation/types'
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

// ── DomainSnapshot ────────────────────────────────────────────────────────────
export interface DomainSnapshot {
  allocationList:      AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  codeLists:           AllCodeLists
  persons:             Person[]
  canUndo:             boolean
  canRedo:             boolean
  patternCache:        Map<string, PatternDetectionResult>
  organizations:       Organization[]  // = beforeOrganizations（後方互換エイリアス）
}

// ── HRApplicationService ──────────────────────────────────────────────────────
export class HRApplicationService {
  private allocationList:      AllocationRow[] = []
  private beforeOrganizations: Organization[]  = []
  private afterOrganizations:  Organization[]  = []
  private codeLists:           AllCodeLists    = EMPTY_CODE_LISTS

  private undoStack = new UndoStack()

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

  // ── スナップショット取得 ───────────────────────────────────────
  getSnapshot(): DomainSnapshot {
    if (!this.cachedPersons) this.cachedPersons = derivePersons(this.allocationList)
    return {
      allocationList:      this.allocationList,
      beforeOrganizations: this.beforeOrganizations,
      afterOrganizations:  this.afterOrganizations,
      codeLists:           this.codeLists,
      persons:             this.cachedPersons,
      canUndo:             this.undoStack.canUndo,
      canRedo:             this.undoStack.canRedo,
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
    const result = mergeAllocationList({
      existing:   this.allocationList,
      incoming:   data.allocationList,
      mode:       data.mode,
      scopeOrgId: data.scopeOrgId,
      afterOrgs:  this.afterOrganizations,
    })
    const before = this.allocationList
    this.allocationList = result.rows
    this.undoStack.push(this.undoStack.computePatch(before, result.rows, this.afterOrganizations))
    this.emit()
    return result
  }

  // ── 操作の実行（差分をスタックに積む）────────────────────────
  executeOperation(op: IDomainOperation): ValidationResult {
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

    this.undoStack.push(this.undoStack.computePatch(beforeList, applied.updatedList, beforeOrgs, applied.updatedOrgs))
    this.allocationList = applied.updatedList
    if (applied.updatedOrgs) this.afterOrganizations = applied.updatedOrgs
    this.emit()
    return result
  }

  // ── 行の直接編集（Undo なし・プレビュー/AI 内部用）────────────
  editRow(rowId: number, changes: AfterValues): void {
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
    const newRow: AllocationRow = {
      rowId:          nextRowId(this.allocationList),
      userId:         opts.userId,
      lastName:       opts.lastName,
      firstName:      opts.firstName,
      employeeNumber: opts.employeeNumber ?? '',
      employmentType: '正社員',
      departmentCode: opts.departmentCode ?? '',
    } as AllocationRow

    this.undoStack.push({ rowDiffs: [{ rowId: newRow.rowId, before: null, after: newRow }] })
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

  // ── Undo / Redo ───────────────────────────────────────────────
  undo(): void {
    const patch = this.undoStack.undo()
    if (!patch) return
    const next = this.undoStack.applyPatch(this.allocationList, this.afterOrganizations, patch, 'undo')
    this.allocationList     = next.allocationList
    this.afterOrganizations = next.afterOrganizations
    this.emit()
  }

  redo(): void {
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
