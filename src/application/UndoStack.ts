// UndoStack — differential undo/redo for AllocationRow state.
// Stores row-level diffs only (not full snapshots) so memory is bounded even with 30k rows.
// Pure class: no side effects, no imports from React. Independently testable.

import type { AllocationRow } from '../domain/allocationRow'
import type { Organization }  from '../domain/schemas'

export interface RowDiff {
  rowId:  number
  before: AllocationRow | null  // null = row was added by this operation
  after:  AllocationRow | null  // null = row was removed by this operation
}

export interface StatePatch {
  rowDiffs:    RowDiff[]
  orgsBefore?: Organization[]   // set only when afterOrganizations changed
  orgsAfter?:  Organization[]
  label?:      string           // 操作ラベル（履歴パネル表示用）
}

export interface HistoryEntry {
  index:     number   // past 配列内インデックス（0 = 最古）
  label:     string
  direction: 'past' | 'future'
}

const MAX_UNDO = 50

export class UndoStack {
  private past:   StatePatch[] = []
  private future: StatePatch[] = []

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  push(patch: StatePatch): void {
    this.past.push(patch)
    if (this.past.length > MAX_UNDO) this.past.shift()
    this.future = []
  }

  undo(): StatePatch | undefined {
    const patch = this.past.pop()
    if (patch) this.future.push(patch)
    return patch
  }

  redo(): StatePatch | undefined {
    const patch = this.future.pop()
    if (patch) this.past.push(patch)
    return patch
  }

  /**
   * 時系列順（古い順）の全操作リスト。
   * position = その操作を適用した後の "past 長"（1 始まり）。
   * isPast = true → past に含まれる（適用済）、false → future に含まれる（redo 可能）。
   */
  getFullHistory(): HistoryEntry[] {
    const result: HistoryEntry[] = []
    this.past.forEach((p, i) =>
      result.push({ index: i + 1, label: p.label ?? '操作', direction: 'past' })
    )
    // future は "最後に undo したものが末尾" なので、古い undo（最初に redo される）が末尾にある
    // 時系列順: future[last-i] → position past.length + i + 1
    ;[...this.future].reverse().forEach((p, i) =>
      result.push({ index: this.past.length + i + 1, label: p.label ?? '操作', direction: 'future' })
    )
    return result
  }

  get pastLength(): number { return this.past.length }
  get futureLength(): number { return this.future.length }

  /**
   * スタックを変更せずに、"past が targetPastLength 個適用された" 状態を計算して返す。
   * targetPastLength < past.length → undo 方向、> past.length → redo 方向。
   */
  computeStateAt(
    currentList: AllocationRow[],
    currentOrgs: Organization[],
    targetPastLength: number,
  ): { allocationList: AllocationRow[]; afterOrganizations: Organization[] } {
    let list = currentList
    let orgs = currentOrgs

    if (targetPastLength < this.past.length) {
      for (let i = this.past.length - 1; i >= targetPastLength; i--) {
        const r = this.applyPatch(list, orgs, this.past[i], 'undo')
        list = r.allocationList; orgs = r.afterOrganizations
      }
    } else if (targetPastLength > this.past.length) {
      const stepsForward = targetPastLength - this.past.length
      for (let i = 0; i < stepsForward && i < this.future.length; i++) {
        // future[last-i] = i 番目に redo される操作
        const futureIdx = this.future.length - 1 - i
        const r = this.applyPatch(list, orgs, this.future[futureIdx], 'redo')
        list = r.allocationList; orgs = r.afterOrganizations
      }
    }

    return { allocationList: list, afterOrganizations: orgs }
  }

  clear(): void {
    this.past   = []
    this.future = []
  }

  computePatch(
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
      if (!aRow)       rowDiffs.push({ rowId: id, before: bRow, after: null })
      else if (bRow !== aRow) rowDiffs.push({ rowId: id, before: bRow, after: aRow })
    }
    for (const [id, aRow] of afterMap) {
      if (!beforeMap.has(id)) rowDiffs.push({ rowId: id, before: null, after: aRow })
    }

    return {
      rowDiffs,
      ...(afterOrgs ? { orgsBefore: beforeOrgs, orgsAfter: afterOrgs } : {}),
    }
  }

  applyPatch(
    allocationList:     AllocationRow[],
    afterOrganizations: Organization[],
    patch:              StatePatch,
    direction:          'undo' | 'redo',
  ): { allocationList: AllocationRow[]; afterOrganizations: Organization[] } {
    const changedMap = new Map<number, AllocationRow>()
    const removeIds  = new Set<number>()
    const addedRows: AllocationRow[] = []

    for (const { rowId, before, after } of patch.rowDiffs) {
      const target = direction === 'undo' ? before : after
      const remove = direction === 'undo' ? before === null : after === null

      if (remove) {
        removeIds.add(rowId)
      } else if (target !== null) {
        const exists = allocationList.some(r => r.rowId === rowId)
        if (exists) changedMap.set(rowId, target)
        else        addedRows.push(target)
      }
    }

    const newList = [
      ...allocationList
        .filter(r => !removeIds.has(r.rowId))
        .map(r => changedMap.get(r.rowId) ?? r),
      ...addedRows,
    ]

    let newOrgs = afterOrganizations
    if (direction === 'undo' && patch.orgsBefore) newOrgs = patch.orgsBefore
    if (direction === 'redo' && patch.orgsAfter)  newOrgs = patch.orgsAfter

    return { allocationList: newList, afterOrganizations: newOrgs }
  }
}
