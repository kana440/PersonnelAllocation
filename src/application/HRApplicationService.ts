import type { Company, Organization, BandOption } from '../domain/schemas'
import type { AllCodeLists } from '../domain/codeLists/aggregate'
import { EMPTY_CODE_LISTS } from '../domain/codeLists/aggregate'
import type { AllocationRow } from '../domain/allocationRow'
import { nextRowId } from '../domain/allocationRow'
import type { AfterValues } from '../domain/operationGroups/types'
import {
  derivePersons,
  deriveCompanies,
  deriveBeforePositions,
  deriveAfterPositions,
  deriveBeforeAffiliations,
  deriveAfterAffiliations,
} from '../domain/operationGroups/snapshot'
import type { Person, Position, Affiliation } from '../domain/schemas'
import type { IOperationPattern, PatternDetectionResult } from '../domain/operationPatterns/types'
import { matchAllPatterns } from '../domain/operationPatterns/patternMatcher'

// ── DomainSnapshot ────────────────────────────────────────────────────────────
// Zustand・AI アダプター両方がこの型で状態を受け取る。
// allocationList の after フィールドが発令後の単一データソース。
export interface DomainSnapshot {
  // ── Single Source of Truth ──────────────────────────────────────
  allocationList:      AllocationRow[]  // prev*=発令前(不変), after=発令後(編集可)
  beforeOrganizations: Organization[]  // 発令前組織マスタ
  afterOrganizations:  Organization[]  // 発令後組織マスタ
  companies:           Company[]
  codeLists:           AllCodeLists

  // ── 計算済みビュー（コンポーネント用）────────────────────────
  persons:             Person[]
  beforePositions:     Position[]
  beforeAffiliations:  Affiliation[]
  afterPositions:      Position[]
  afterAffiliations:   Affiliation[]

  // ── マスタ補助 ──────────────────────────────────────────────────
  bands:               BandOption[]
  transferReasons:     string[]
  positionTitles:      string[]

  // ── Undo/Redo 状態 ─────────────────────────────────────────────
  canUndo:             boolean
  canRedo:             boolean

  // ── パターンキャッシュ ─────────────────────────────────────────
  patternCache:        Map<string, PatternDetectionResult>

  // ── 後方互換エイリアス ─────────────────────────────────────────
  organizations:       Organization[]  // = beforeOrganizations
}

// Undo/Redo 用に保存するコアデータのみ（派生ビューは除く）
interface CoreState {
  allocationList:      AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  companies:           Company[]
  codeLists:           AllCodeLists
}

// ── HRApplicationService ──────────────────────────────────────────────────────
export class HRApplicationService {
  private allocationList:      AllocationRow[] = []
  private beforeOrganizations: Organization[]  = []
  private afterOrganizations:  Organization[]  = []
  private companies:           Company[]       = []
  private codeLists:           AllCodeLists    = EMPTY_CODE_LISTS

  // Undo/Redo スタック（コアデータのスナップショット）
  private past:   CoreState[] = []
  private future: CoreState[] = []

  // パターン定義（container.ts から DI）
  private patterns: IOperationPattern[] = []

  // allocationList 変更のたびに再計算するパターンキャッシュ
  private patternCache: Map<string, PatternDetectionResult> = new Map()

  private listeners = new Set<() => void>()

  registerPatterns(patterns: IOperationPattern[]): void {
    this.patterns = patterns
    this.rebuildPatternCache()
  }

  private rebuildPatternCache(): void {
    this.patternCache = matchAllPatterns(this.allocationList, this.patterns)
  }

  // ── 変更通知 ──────────────────────────────────────────────────
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit(): void {
    this.rebuildPatternCache()
    this.listeners.forEach(fn => fn())
  }

  // ── コアデータのスナップショット ─────────────────────────────
  private coreSnapshot(): CoreState {
    return {
      allocationList:      this.allocationList.map(r => ({ ...r })),
      beforeOrganizations: this.beforeOrganizations,
      afterOrganizations:  this.afterOrganizations,
      companies:           this.companies,
      codeLists:           this.codeLists,
    }
  }

  private restoreCore(snap: CoreState): void {
    this.allocationList      = snap.allocationList
    this.beforeOrganizations = snap.beforeOrganizations
    this.afterOrganizations  = snap.afterOrganizations
    this.companies           = snap.companies
    this.codeLists           = snap.codeLists
  }

  // 保存時に呼ぶ: Undo スタックに現在状態を積む（public）
  checkpoint(): void {
    this.past.push(this.coreSnapshot())
    this.future = []
  }

  // ── スナップショット取得 ───────────────────────────────────────
  getSnapshot(): DomainSnapshot {
    const persons   = derivePersons(this.allocationList)
    const companies = deriveCompanies(
      [...this.beforeOrganizations, ...this.afterOrganizations],
      this.companies,
    )

    return {
      allocationList:      this.allocationList,
      beforeOrganizations: this.beforeOrganizations,
      afterOrganizations:  this.afterOrganizations,
      companies,
      codeLists:           this.codeLists,
      persons,
      beforePositions:     deriveBeforePositions(this.allocationList, this.beforeOrganizations),
      beforeAffiliations:  deriveBeforeAffiliations(this.allocationList, persons),
      afterPositions:      deriveAfterPositions(this.allocationList, this.afterOrganizations),
      afterAffiliations:   deriveAfterAffiliations(this.allocationList, persons),
      bands:               [],
      transferReasons:     [],
      positionTitles:      [],
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
    companies:           Company[]
    codeLists:           AllCodeLists
  }): void {
    this.allocationList      = data.allocationList
    this.beforeOrganizations = data.beforeOrganizations
    this.afterOrganizations  = data.afterOrganizations
    this.companies           = data.companies
    this.codeLists           = data.codeLists
    this.past                = []
    this.future              = []
    this.emit()
  }

  // ── 行の直接編集（checkpoint なし・AI/内部用）────────────────
  editRow(rowId: number, changes: AfterValues): void {
    const idx = this.allocationList.findIndex(r => r.rowId === rowId)
    if (idx < 0) return
    this.allocationList = this.allocationList.map((r, i) =>
      i === idx ? { ...r, ...changes } : r
    )
    this.emit()
  }

  // ── ユーザー保存（checkpoint → 適用。Undo の単位）────────────
  saveRow(rowId: number, changes: AfterValues): void {
    const idx = this.allocationList.findIndex(r => r.rowId === rowId)
    if (idx < 0) return
    this.checkpoint()
    this.allocationList = this.allocationList.map((r, i) =>
      i === idx ? { ...r, ...changes } : r
    )
    this.emit()
  }

  // ── 新規採用行の追加 ─────────────────────────────────────────
  addNewHireRow(opts: {
    lastName:       string
    firstName:      string
    userId:         string
    employeeNumber?: string
    departmentCode?: string
    companyId?:     string
    effectiveDate:  string
  }): void {
    this.checkpoint()
    const newRow: AllocationRow = {
      rowId:          nextRowId(this.allocationList),
      userId:         opts.userId,
      lastName:       opts.lastName,
      firstName:      opts.firstName,
      employeeNumber: opts.employeeNumber ?? '',
      // after フィールド（採用時の発令後情報）
      employmentType: '正社員',
      departmentCode: opts.departmentCode ?? '',
      // prev* フィールドは全て空（新規採用＝発令前データなし）
    } as AllocationRow
    this.allocationList = [...this.allocationList, newRow]
    this.emit()
  }

  // ── Undo / Redo ───────────────────────────────────────────────
  undo(): void {
    const prev = this.past.pop()
    if (!prev) return
    this.future.push(this.coreSnapshot())
    this.restoreCore(prev)
    this.emit()
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(this.coreSnapshot())
    this.restoreCore(next)
    this.emit()
  }

  // ── セッションリセット ────────────────────────────────────────
  reset(): void {
    this.allocationList      = []
    this.beforeOrganizations = []
    this.afterOrganizations  = []
    this.companies           = []
    this.codeLists           = EMPTY_CODE_LISTS
    this.past                = []
    this.future              = []
    this.emit()
  }
}

export const appService = new HRApplicationService()
