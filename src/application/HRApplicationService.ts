import type { Organization } from '../domain/schemas'
import type { AllCodeLists } from '../domain/codeLists/aggregate'
import { EMPTY_CODE_LISTS } from '../domain/codeLists/aggregate'
import type { AllocationRow } from '../domain/allocationRow'
import { nextRowId, afterKeysByBinding } from '../domain/allocationRow'
import type { AfterValues } from '../domain/allocationRow'
import type { IDomainOperation, ValidationResult } from '../domain/operation/types'
import { DirectEditOperation }  from '../domain/operation/handlers/directEdit'
import { derivePersons } from '../domain/projection/rows'
import type { Person } from '../domain/schemas'
import type { IOperationPattern, PatternDetectionResult } from '../domain/operationPatterns/types'
import { matchAllPatterns } from '../domain/operationPatterns/patternMatcher'
import { mergeAllocationList } from '../domain/importMerge'
import type { ImportMode, MergeResult } from '../domain/importMerge'

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

// ── 差分Undo/Redo ─────────────────────────────────────────────────────────────
// 全行スナップショットの代わりに、変更された行のみを記録する。
// 30k行 × 操作1件 → 通常1〜数行分のみ保持。
interface RowDiff {
  rowId:  number
  before: AllocationRow | null  // null = この操作で追加された行
  after:  AllocationRow | null  // null = この操作で削除された行（将来対応）
}

interface StatePatch {
  rowDiffs:    RowDiff[]
  orgsBefore?: Organization[]   // afterOrganizations が変わった場合のみ
  orgsAfter?:  Organization[]
}

const MAX_UNDO = 50

// ── HRApplicationService ──────────────────────────────────────────────────────
export class HRApplicationService {
  private allocationList:      AllocationRow[] = []
  private beforeOrganizations: Organization[]  = []
  private afterOrganizations:  Organization[]  = []
  private codeLists:           AllCodeLists    = EMPTY_CODE_LISTS

  private past:   StatePatch[] = []
  private future: StatePatch[] = []

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

  // ── 差分計算 ──────────────────────────────────────────────────
  private computePatch(
    beforeList: AllocationRow[],
    afterList:  AllocationRow[],
    beforeOrgs: Organization[],
    afterOrgs?: Organization[],
  ): StatePatch {
    const beforeMap = new Map(beforeList.map(r => [r.rowId, r]))
    const afterMap  = new Map(afterList.map(r  => [r.rowId, r]))
    const rowDiffs: RowDiff[] = []

    for (const [id, bRow] of beforeMap) {
      const aRow = afterMap.get(id)
      if (!aRow) {
        rowDiffs.push({ rowId: id, before: bRow, after: null })
      } else if (bRow !== aRow) {
        rowDiffs.push({ rowId: id, before: bRow, after: aRow })
      }
    }
    for (const [id, aRow] of afterMap) {
      if (!beforeMap.has(id)) rowDiffs.push({ rowId: id, before: null, after: aRow })
    }

    return {
      rowDiffs,
      ...(afterOrgs ? { orgsBefore: beforeOrgs, orgsAfter: afterOrgs } : {}),
    }
  }

  private applyPatch(patch: StatePatch, direction: 'undo' | 'redo'): void {
    const changedMap  = new Map<number, AllocationRow>()
    const removeIds   = new Set<number>()
    const addedRows:  AllocationRow[] = []

    for (const { rowId, before, after } of patch.rowDiffs) {
      const target = direction === 'undo' ? before : after
      const remove = direction === 'undo' ? before === null : after === null

      if (remove) {
        removeIds.add(rowId)
      } else if (target !== null) {
        const exists = this.allocationList.some(r => r.rowId === rowId)
        if (exists) changedMap.set(rowId, target)
        else        addedRows.push(target)
      }
    }

    this.allocationList = [
      ...this.allocationList
        .filter(r => !removeIds.has(r.rowId))
        .map(r => changedMap.get(r.rowId) ?? r),
      ...addedRows,
    ]

    if (direction === 'undo' && patch.orgsBefore) this.afterOrganizations = patch.orgsBefore
    if (direction === 'redo' && patch.orgsAfter)  this.afterOrganizations = patch.orgsAfter
  }

  private pushPast(patch: StatePatch): void {
    this.past.push(patch)
    if (this.past.length > MAX_UNDO) this.past.shift()
    this.future = []
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
      canUndo:             this.past.length > 0,
      canRedo:             this.future.length > 0,
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
    this.past                = []
    this.future              = []
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
    this.pushPast(this.computePatch(before, result.rows, this.afterOrganizations))
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

    this.pushPast(this.computePatch(beforeList, applied.updatedList, beforeOrgs, applied.updatedOrgs))
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

    this.pushPast({ rowDiffs: [{ rowId: newRow.rowId, before: null, after: newRow }] })
    this.allocationList = [...this.allocationList, newRow]
    this.emit()
  }

  // ── ポジション操作 ────────────────────────────────────────────

  // 空席ポジションを新規作成（内部採番positionCode付き）
  createVacantPosition(departmentCode: string, localJobTitle: string): void {
    const rowId = nextRowId(this.allocationList)
    const newRow: AllocationRow = {
      rowId,
      departmentCode,
      localJobTitle,
      positionCode: `_pos_${rowId}`,  // 内部採番ID（Excel出力時はblank）
    } as AllocationRow
    this.pushPast({ rowDiffs: [{ rowId: newRow.rowId, before: null, after: newRow }] })
    this.allocationList = [...this.allocationList, newRow]
    this.emit()
  }

  removePosition(rowId: number): void {
    const row = this.allocationList.find(r => r.rowId === rowId)
    if (!row) return

    const before = this.allocationList

    if (row.userId) {
      // 在席中: 人を未アサイン状態に残してからポジション行を削除
      // positionClears は 'both'(departmentCode) を含まないので組織はそのまま引き継ぐ
      const positionClears = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
      const allocClears    = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
      const unassignedRow: AllocationRow = {
        ...row,
        rowId: nextRowId(this.allocationList),
        ...positionClears,
        ...allocClears,
      }
      this.allocationList = [
        ...this.allocationList.filter(r => r.rowId !== rowId),
        unassignedRow,
      ]
    } else {
      // 空席: そのまま削除
      this.allocationList = this.allocationList.filter(r => r.rowId !== rowId)
    }

    this.pushPast(this.computePatch(before, this.allocationList, this.afterOrganizations))
    this.emit()
  }

  // 人をポジションから外す（ポジション↔人の紐付けを解除）
  // 1行 → 空席ポジション行（元の行を更新）+ 未アサインメンバー行（新規追加）
  unassignPersonFromPosition(occupiedRowId: number): void {
    const row = this.allocationList.find(r => r.rowId === occupiedRowId)
    if (!row || !row.userId) return

    const personClears   = Object.fromEntries(afterKeysByBinding('person').map(k => [k, undefined]))
    const positionClears = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const allocClears    = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))

    // 空席ポジション行: position+both フィールドはそのまま、person+allocation フィールドをクリア
    const vacantRow: AllocationRow = { ...row, userId: undefined, ...personClears, ...allocClears }

    // 未アサインメンバー行（新規）: person+both フィールドはそのまま、position+allocation フィールドをクリア
    // departmentCode は 'both' なので positionClears には含まれず、そのまま引き継ぐ
    const unassignedRow: AllocationRow = {
      ...row,
      rowId: nextRowId([...this.allocationList, vacantRow]),
      ...positionClears,
      ...allocClears,
    }

    // 同組織に同じ人の別行が既にあれば未アサイン行は不要
    const hasOtherRowInOrg = this.allocationList.some(
      r => r.rowId !== occupiedRowId && r.userId === row.userId && r.departmentCode === row.departmentCode
    )

    const before = this.allocationList
    const updated = this.allocationList.map(r => r.rowId === occupiedRowId ? vacantRow : r)
    this.allocationList = hasOtherRowInOrg ? updated : [...updated, unassignedRow]

    this.pushPast(this.computePatch(before, this.allocationList, this.afterOrganizations))
    this.emit()
  }

  // 空席ポジションに人を配属（1回のUndo）
  // Case A: 人が未アサイン行を持つ → 空席行に配属 + 未アサイン行を削除
  // Case B: 人が別の在席行を持つ → 空席行に配属 + 元の在席行を空席化
  assignPersonToVacantPosition(vacantRowId: number, personSfId: string): void {
    const vacantRow = this.allocationList.find(r => r.rowId === vacantRowId)
    if (!vacantRow || vacantRow.userId) return

    const personRow = this.allocationList.find(r => r.userId === personSfId && !r.concurrentType)
                   ?? this.allocationList.find(r => r.userId === personSfId)

    const allocClears   = Object.fromEntries(afterKeysByBinding('allocation').map(k => [k, undefined]))
    const personClears  = Object.fromEntries(afterKeysByBinding('person').map(k => [k, undefined]))
    const before = this.allocationList

    if (!personRow) {
      // 人の行が存在しない → 空席行に userId だけセット
      this.allocationList = this.allocationList.map(r =>
        r.rowId === vacantRowId ? { ...r, userId: personSfId } : r
      )
    } else {
      // filledRow: personRow を起点にして position/both フィールドを vacantRow で上書き
      // これにより lastName/firstName/groupEmployeeId 等の名前情報が確実に引き継がれる
      const positionAndBothFields = Object.fromEntries(
        [...afterKeysByBinding('position'), ...afterKeysByBinding('both')]
          .map(k => [k, vacantRow[k as keyof AllocationRow]])
      )
      const filledRow: AllocationRow = {
        ...personRow,             // 人の全データ（名前・band等）を起点にする
        rowId:    vacantRow.rowId, // ポジションのスロット（rowId）を継承
        userId:   personSfId,
        ...positionAndBothFields, // ポジションの組織・役職・コード等で上書き
        ...allocClears,           // 新しい紐付けなので allocation はリセット
      }

      const isUnassigned = !personRow.positionCode  // 未アサイン行かどうか

      if (isUnassigned) {
        // Case A: 未アサイン行を削除し、空席行を配属行に置き換え
        this.allocationList = [
          ...this.allocationList.filter(r => r.rowId !== vacantRowId && r.rowId !== personRow.rowId),
          filledRow,
        ]
      } else {
        // Case B: 元の在席行を空席化し、空席行を配属行に置き換え
        const vacatedPersonRow: AllocationRow = {
          ...personRow,
          userId: undefined,
          ...personClears,
          ...allocClears,
        }
        this.allocationList = this.allocationList.map(r => {
          if (r.rowId === vacantRowId)     return filledRow
          if (r.rowId === personRow.rowId) return vacatedPersonRow
          return r
        })
      }
    }

    this.pushPast(this.computePatch(before, this.allocationList, this.afterOrganizations))
    this.emit()
  }

  // ── Undo / Redo ───────────────────────────────────────────────
  undo(): void {
    const patch = this.past.pop()
    if (!patch) return
    this.future.push(patch)
    this.applyPatch(patch, 'undo')
    this.emit()
  }

  redo(): void {
    const patch = this.future.pop()
    if (!patch) return
    this.past.push(patch)
    this.applyPatch(patch, 'redo')
    this.emit()
  }

  reset(): void {
    this.allocationList      = []
    this.beforeOrganizations = []
    this.afterOrganizations  = []
    this.codeLists           = EMPTY_CODE_LISTS
    this.past                = []
    this.future              = []
    this.emit()
  }
}

export const appService = new HRApplicationService()
