import type { HRApplicationService } from '../HRApplicationService'
import { detectPatterns }                  from '@personnel/domain/patterns/detection'
import type { EditPattern }                from '@personnel/domain/patterns/editPatterns'
import { ALL_EDIT_OPERATIONS, ALL_MULTI_ROW_OPERATION_DEFS, resolveAvailability } from '@personnel/domain/commands/defs'
import { validateRow }                     from '@personnel/domain/rules/validate/validateRow'
import type { ValidationIssue }            from '@personnel/domain/rules/validate/types'
import type { DomainContext }              from '@personnel/domain/context'
import type { RowChanges }                 from '@personnel/domain/patterns/detection'

// ── パターン → 関連 EditOperation IDs マッピング ──────────────────────────────
//
// 「このパターンが検出されている行で、どの EditOperation が実行・操作できるはずか」
// を表す。availableFor の網羅漏れや onValidate 失敗を検出するために使う。
//
// ポイント:
//   - パターンが示す「既に起きた変更」を再現/管理する操作を列挙する。
//   - セッション内 Cancel 系はここには含めない（cancell 可否は operationRole で管理）。
//   - 対応操作がない（termination 等）は意図的に省略 → unmappedPatterns として報告。

const PATTERN_TO_OP_IDS: Partial<Record<EditPattern, string[]>> = {
  promotion:                     ['Promotion'],
  demotion:                      ['Demotion'],
  titleChange:                   ['TitleChange'],
  mpTrackSwitch:                 ['MpTrackSwitch'],
  jobTypeChange:                 ['JobTypeChange'],
  employmentExtension:           ['EmploymentExtension'],
  employmentTypeChange:          ['EmploymentTypeChange'],
  orgTransfer:                   ['OrgTransfer'],
  orgRestructure:                ['OrgRestructure'],
  managerChange:                 ['ManagerChange'],
  concurrentAdd:                 ['ConcurrentAdd'],
  concurrentRelease:             ['ConcurrentRelease'],
  // 本務出向: SF統合先（単一行）
  secondmentOut:                 ['SecondmentOutSF', 'SecondmentOutReleaseSF'],
  // 受入中: 受入解除が関連操作
  secondmentIn:                  ['SecondmentInReleaseSF', 'SecondmentInReleaseNonSF'],
  secondmentOutRelease:          ['SecondmentOutReleaseSF'],
  secondmentInRelease:           ['SecondmentInReleaseSF', 'SecondmentInReleaseNonSF'],
  // 兼務出向系
  concurrentSecondmentOutNonSF:  ['ConcurrentSecondmentOutNonSF', 'ConcurrentSecondmentOutReleaseNonSF'],
  concurrentSecondmentIn:        ['ConcurrentSecondmentInReleaseSF', 'ConcurrentSecondmentInReleaseNonSF'],
  concurrentSecondmentOutRelease: ['ConcurrentSecondmentOutReleaseNonSF', 'ConcurrentSecondmentOutReleaseSF'],
  concurrentSecondmentInRelease: ['ConcurrentSecondmentInReleaseNonSF', 'ConcurrentSecondmentInReleaseSF'],
  // 人操作系
  leaveOfAbsence:                ['LeaveOfAbsence'],
  returnFromLeave:               ['ReturnFromLeave'],
  employmentTransfer:            ['EmploymentTransfer'],
  noChange:                      ['NoChange'],
  // termination / resignation / vacantPositionMove は対応 EditOperation なし → unmappedPatterns
}

// SF外 2行セット操作（MultiRowOperationDef）のマッピング
const PATTERN_TO_MULTI_IDS: Partial<Record<EditPattern, string[]>> = {
  secondmentOut:        ['NonSFSecondmentOut'],
  secondmentOutRelease: ['NonSFSecondmentRelease'],
}

// ── 型定義 ────────────────────────────────────────────────────────────────────

type DefCheckResult = {
  defId:          string
  defLabel:       string
  kind:           'single' | 'multiRow'
  available:      boolean
  unavailableReason?: string
  validatePassed?:    boolean
  validateError?:     string
}

export type PatternDiagnosis = {
  pattern:            EditPattern
  relatedDefs:        DefCheckResult[]
  /** available な def が1つも存在しない（availableFor ギャップ候補） */
  availForGap:        boolean
  /** available で onValidate も通る def が1つも存在しない */
  validateGap:        boolean
}

export type DiagnosePersonChangesResult = {
  rowId:            number
  personName:       string
  detectedPatterns: EditPattern[]
  patternDiagnoses: PatternDiagnosis[]
  /** PATTERN_TO_OP_IDS にエントリがない検出パターン（Command 実装漏れの可能性） */
  unmappedPatterns: EditPattern[]
  /** この行で現在 available な全操作一覧 */
  allAvailableOps:  { defId: string; defLabel: string; kind: 'single' | 'multiRow' }[]
  validationIssues: ValidationIssue[]
  summary: {
    /** パターン検出されたが関連 def の availableFor が全て false → 条件漏れ疑い */
    availForGaps:   EditPattern[]
    /** パターン検出されたが対応 Command が未登録 → 実装ギャップ */
    commandGaps:    EditPattern[]
    /** available だが onValidate 失敗 → データ不整合か def のロジック問題 */
    validateFails:  { pattern: EditPattern; defId: string; error: string }[]
    /** 現在のバリデーション問題 */
    dataIssues:     { field?: string; message: string; level: string }[]
  }
}

// ── 実装 ──────────────────────────────────────────────────────────────────────

export function createDiagnoseMethods(service: HRApplicationService) {

  function diagnosePersonChanges(rowId: number): DiagnosePersonChangesResult | { ok: false; error: string } {
    const { allocationList, afterOrganizations, masters } = service.getSnapshot()
    const row = allocationList.find(r => r.rowId === rowId)
    if (!row) return { ok: false, error: `行が見つかりません (rowId: ${rowId})` }

    const ctx: DomainContext = { allocationList, afterOrganizations, masters }

    // 1. パターン検出 & バリデーション
    const rowChanges: RowChanges   = detectPatterns(row, ctx)
    const detectedPatterns         = [...rowChanges.patterns] as EditPattern[]
    const validationIssues         = validateRow({ row, afterOrganizations, masters, allocationList, changes: rowChanges })

    // 2. パターンごとに関連 def をチェック
    const opById    = new Map(ALL_EDIT_OPERATIONS.map(d          => [d.id, d]))
    const multiById = new Map(ALL_MULTI_ROW_OPERATION_DEFS.map(d => [d.id, d]))

    const unmappedPatterns: EditPattern[]    = []
    const patternDiagnoses: PatternDiagnosis[] = []

    for (const pattern of detectedPatterns) {
      const opIds    = PATTERN_TO_OP_IDS[pattern]   ?? []
      const multiIds = PATTERN_TO_MULTI_IDS[pattern] ?? []

      if (opIds.length === 0 && multiIds.length === 0) {
        unmappedPatterns.push(pattern)
        continue
      }

      const relatedDefs: DefCheckResult[] = []

      for (const id of opIds) {
        const def = opById.get(id)
        if (!def) {
          relatedDefs.push({
            defId: id, defLabel: id, kind: 'single',
            available: false,
            unavailableReason: 'ALL_EDIT_OPERATIONS に存在しません（登録漏れ疑い）',
          })
          continue
        }
        const avail = resolveAvailability(def, row, masters)
        if (!avail.available) {
          relatedDefs.push({ defId: id, defLabel: def.label, kind: 'single', available: false, unavailableReason: avail.reason })
          continue
        }
        // available → validate を試行
        try {
          const initValues   = def.onOpen(row, ctx)
          const vResult      = def.createCommand(rowId, initValues).validate(ctx)
          if (!vResult.ok) {
            const msg = vResult.errors[0]?.message ?? '不明なエラー'
            relatedDefs.push({ defId: id, defLabel: def.label, kind: 'single', available: true, validatePassed: false, validateError: msg })
          } else {
            relatedDefs.push({ defId: id, defLabel: def.label, kind: 'single', available: true, validatePassed: true })
          }
        } catch (e) {
          relatedDefs.push({ defId: id, defLabel: def.label, kind: 'single', available: true, validatePassed: false, validateError: `例外: ${String(e)}` })
        }
      }

      for (const id of multiIds) {
        const def = multiById.get(id)
        if (!def) {
          relatedDefs.push({
            defId: id, defLabel: id, kind: 'multiRow',
            available: false,
            unavailableReason: 'ALL_MULTI_ROW_OPERATION_DEFS に存在しません（登録漏れ疑い）',
          })
          continue
        }
        const available = def.availableFor(row, masters, allocationList)
        // MultiRowOperationDef は onValidate を持たないので availableFor のみ
        relatedDefs.push({ defId: id, defLabel: def.label, kind: 'multiRow', available })
      }

      const hasAvailable      = relatedDefs.some(d => d.available)
      const hasPassingValidate = relatedDefs.some(d => d.available && d.validatePassed === true)

      patternDiagnoses.push({
        pattern,
        relatedDefs,
        availForGap:  !hasAvailable,
        validateGap:  hasAvailable && !hasPassingValidate,
      })
    }

    // 3. 全 def の availableFor チェック（この行で現在できる全操作）
    const allAvailableOps = [
      ...ALL_EDIT_OPERATIONS
        .filter(d => resolveAvailability(d, row, masters).available)
        .map(d => ({ defId: d.id, defLabel: d.label, kind: 'single' as const })),
      ...ALL_MULTI_ROW_OPERATION_DEFS
        .filter(d => d.availableFor(row, masters, allocationList))
        .map(d => ({ defId: d.id, defLabel: d.label, kind: 'multiRow' as const })),
    ]

    // 4. サマリー集約
    const availForGaps  = patternDiagnoses.filter(d => d.availForGap).map(d => d.pattern)
    const commandGaps   = unmappedPatterns
    const validateFails = patternDiagnoses.flatMap(d =>
      d.relatedDefs
        .filter(r => r.available && r.validatePassed === false)
        .map(r => ({ pattern: d.pattern, defId: r.defId, error: r.validateError ?? '' })),
    )
    const dataIssues = validationIssues.map(i => ({ field: i.field, message: i.message, level: i.level }))

    return {
      rowId,
      personName:       [row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）',
      detectedPatterns,
      patternDiagnoses,
      unmappedPatterns,
      allAvailableOps,
      validationIssues,
      summary: { availForGaps, commandGaps, validateFails, dataIssues },
    }
  }

  return { diagnosePersonChanges }
}
