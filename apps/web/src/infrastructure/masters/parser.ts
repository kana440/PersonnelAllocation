// コードリスト（各種TBL シート）を unknown[][] から解析する純粋関数（ライブラリ非依存）

import type { AllMasters } from './types'
import type {
  CompanyEntry,
  CompanyFilterEntry,
  EmploymentTypeEntry,
  PayGradeEntry,
  OfficialPositionEntry,
  WorkLocationEntry,
  JobFamilyEntry,
  JobTypeEntry,
  JobLevelEntry,
  TransferReasonEntry,
  ConcurrentReasonEntry,
  DemotionReasonEntry,
  TrainingPositionEntry,
  DiscretionaryWorkEntry,
  PromotionMatrixEntry,
} from '@personnel/domain/masters'
import { TRAINING_POSITION_VALUES } from '@personnel/domain/masters/trainingPosition'
import { DISCRETIONARY_YES, DISCRETIONARY_NO } from '@personnel/domain/masters/discretionaryWork'
import { CONCURRENT_TYPES } from '@personnel/domain/masters/concurrentType'
import type { ColumnWarning } from '../excel/types'

// ── Cell utilities ─────────────────────────────────────────────────────────────

// r, c は 0-indexed
function cellStr(raw: unknown[][], r: number, c: number): string {
  return String(raw[r]?.[c] ?? '').trim()
}

function cellBool(raw: unknown[][], r: number, c: number): boolean {
  const v = raw[r]?.[c]
  return v === 1 || v === '1' || v === true || v === 'TRUE' || v === '○' || v === 'true'
}

function cellNum(raw: unknown[][], r: number, c: number): number {
  const v = raw[r]?.[c]
  return typeof v === 'number' ? v : (Number(String(v ?? '')) || 0)
}

// ── Anchor scan ────────────────────────────────────────────────────────────────
// 各テーブルのキー列ヘッダー文字列（Excel 行0 に記載）。
// ここを変えるだけでテーブル位置の変更に追従する。

const ANCHORS = {
  companyFilters:           '会社絞込用CD',
  transferReasons:          '異動事由',
  employmentTypes:          '雇用タイプCD',
  payGrades:                '給与等級CD',
  officialPositions:        '役職CD',
  workLocations:            '勤務場所CD',
  jobFamilies:              '職種CD',
  jobTypes:                 'Job Family CD',
  jobLevels:                '職務レベルCD',
  trainingPositions:        '業務研修ポジション',
  discretionaryWorkOptions: '裁量労働／業務研修',
  concurrentReasons:        '兼務理由',
  demotionReasons:          '降格理由',
  concurrentType:           '本務兼務区分',
  // 昇降格マトリクス（BT列〜BW列）: 列ヘッダーが '職務レベル'（'職務レベルCD' とは別）
  promotionMatrix:          '職務レベル',
} as const

type AnchorKey = keyof typeof ANCHORS

// 行 0〜3 をスキャンしてアンカー文字列 → 列インデックスのマップを返す
function scanAnchorCols(raw: unknown[][]): Map<string, number> {
  const cols     = new Map<string, number>()
  const needles  = new Set<string>(Object.values(ANCHORS))
  for (let r = 0; r <= Math.min(3, raw.length - 1); r++) {
    const row = raw[r] as unknown[]
    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] ?? '').trim()
      if (needles.has(cell) && !cols.has(cell)) cols.set(cell, c)
    }
  }
  return cols
}

// ── Row range detection ────────────────────────────────────────────────────────
// Row 0 (Excel row 1) = header。Data は row 1 から始まり、キー列が空になると終了。

const DATA_START_ROW = 1

function dataRowIndicesAt(raw: unknown[][], col: number): number[] {
  const rows: number[] = []
  for (let r = DATA_START_ROW; r < raw.length; r++) {
    if (!cellStr(raw, r, col)) break
    rows.push(r)
  }
  return rows
}

function parsePromotionMatrix(raw: unknown[][], col: number): PromotionMatrixEntry[] {
  // col = '職務レベル' 列（BT）。右に役職(BU)・M職P職(BV)・昇降格ワーニング用チェック(BW) が続く
  return dataRowIndicesAt(raw, col).map(r => ({
    jobLevel:         cellStr(raw, r, col),
    officialPosition: cellStr(raw, r, col + 1),
    jobClass:         cellStr(raw, r, col + 2),
    warningLevel:     cellNum(raw, r, col + 3),
  }))
}

// ── Human-readable labels (for SetupView UI) ──────────────────────────────────
export const MASTER_LABELS: Record<keyof AllMasters, string> = {
  orgMasterEntries:         '組織CD一覧',   // parsed by orgMasterParser, not this parser
  companies:                '会社CD一覧',   // parsed by parseCompanySheet, not this parser
  companyFilters:           '会社絞込用',
  employmentTypes:          '雇用タイプ',
  payGrades:                '給与等級',
  officialPositions:        '役職',
  workLocations:            '勤務場所',
  jobFamilies:              '職種（Job Family）',
  jobTypes:                 'Sub Job Family',
  jobLevels:                '職務レベル',
  transferReasons:          '異動事由',
  concurrentReasons:        '兼務理由',
  demotionReasons:          '昇降格理由',
  trainingPositions:        '業務研修ポジション',
  discretionaryWorkOptions: '裁量労働／業務研修',
  promotionMatrix:          '昇降格マトリクス',
}

// ── Per-group parsers（col = キー列の 0-indexed 列番号）─────────────────────────

function parseCompanyFilters(raw: unknown[][], col: number): CompanyFilterEntry[] {
  return dataRowIndicesAt(raw, col).map(r => {
    const errorType = cellStr(raw, r, col + 3)
    return {
      code:                        cellStr(raw, r, col),
      label:                       cellStr(raw, r, col + 1),
      noDiscretionaryVMAutoCreate: cellBool(raw, r, col + 2),
      ...(errorType ? { errorType } : {}),
    }
  })
}

function parseTransferReasons(raw: unknown[][], col: number): TransferReasonEntry[] {
  return dataRowIndicesAt(raw, col).map(r => {
    const text = cellStr(raw, r, col)
    const note = cellStr(raw, r, col + 3)
    return {
      code:                text,
      label:               text,
      noCheckRequired:     cellBool(raw, r, col + 1),
      concurrentCheckSign: cellBool(raw, r, col + 2),
      ...(note ? { note } : {}),
    }
  })
}

function parseEmploymentTypes(raw: unknown[][], col: number): EmploymentTypeEntry[] {
  return dataRowIndicesAt(raw, col).map(r => ({
    code:                             cellStr(raw, r, col),
    label:                            cellStr(raw, r, col + 1),
    isSecondmentAcceptance: cellBool(raw, r, col + 2),
    isRegularEmployee:      cellBool(raw, r, col + 3),
    isExtendedEmployee:     cellBool(raw, r, col + 4),
  }))
}

function parsePayGrades(raw: unknown[][], col: number): PayGradeEntry[] {
  return dataRowIndicesAt(raw, col).map(r => {
    const compensationCategory = cellStr(raw, r, col + 2)
    const band                 = cellStr(raw, r, col + 3)
    return {
      code:                   cellStr(raw, r, col),
      label:                  cellStr(raw, r, col + 1),
      ...(compensationCategory ? { compensationCategory } : {}),
      ...(band                 ? { band }                 : {}),
      isSecondmentAcceptance:  cellBool(raw, r, col + 4),
      isRegularEmployee:       cellBool(raw, r, col + 5),
      isExtendedEmployee:      cellBool(raw, r, col + 6),
      isConcurrent:            cellBool(raw, r, col + 7),
      isPayGradeChange:        cellBool(raw, r, col + 8),
    }
  })
}

function parseOfficialPositions(raw: unknown[][], col: number): OfficialPositionEntry[] {
  return dataRowIndicesAt(raw, col).map(r => ({
    code:                  cellStr(raw, r, col),
    label:                 cellStr(raw, r, col + 1),
    requiresFreeTitle:     cellBool(raw, r, col + 2),
    isDiscretionaryTarget: cellBool(raw, r, col + 3),
  }))
}

function parseWorkLocations(raw: unknown[][], col: number): WorkLocationEntry[] {
  return dataRowIndicesAt(raw, col).map(r => ({
    code:  cellStr(raw, r, col),
    label: cellStr(raw, r, col + 1),
  }))
}

function parseJobFamilies(raw: unknown[][], col: number): JobFamilyEntry[] {
  return dataRowIndicesAt(raw, col).map(r => ({
    code:  cellStr(raw, r, col),
    label: cellStr(raw, r, col + 1),
  }))
}

function parseJobTypes(raw: unknown[][], col: number): JobTypeEntry[] {
  // col = '職種CD'列 (= Job Family CD 列、テーブル左端)
  // Sub Job Family CD は col+2、ラベルは col+3
  return dataRowIndicesAt(raw, col + 2).map(r => ({
    code:                  cellStr(raw, r, col + 2),
    label:                 cellStr(raw, r, col + 3),
    jobFamilyCode:         cellStr(raw, r, col),
    isDiscretionaryTarget: cellBool(raw, r, col + 4),
    compensationCategory:  cellStr(raw, r, col + 5),
  }))
}

function parseJobLevels(raw: unknown[][], col: number): JobLevelEntry[] {
  return dataRowIndicesAt(raw, col).map(r => {
    const promotionDemotionBand = cellStr(raw, r, col + 2)
    return {
      code:                                    cellStr(raw, r, col),
      label:                                   cellStr(raw, r, col + 1),
      ...(promotionDemotionBand ? { promotionDemotionBand } : {}),
      promotionDemotionWarningLevel:                   cellNum(raw, r, col + 3),
      isSecondmentAcceptance:                          cellBool(raw, r, col + 4),
      isRegularEmployee:                               cellBool(raw, r, col + 5),
      isExtendedEmployeePosition:                      cellBool(raw, r, col + 6),
      isExtendedEmployeeJobClassification:             cellBool(raw, r, col + 7),
      isRegularEmployeeOrSecondmentAcceptance:         cellBool(raw, r, col + 8),
      isExtendedEmployeeUnionMember:                   cellBool(raw, r, col + 9),
      isDiscretionaryTarget:                           cellNum(raw, r, col + 10),
    }
  })
}

function parseCodeEntryListAt<T extends { code: string; label: string }>(
  raw: unknown[][], col: number
): T[] {
  return dataRowIndicesAt(raw, col).map(r => {
    const text = cellStr(raw, r, col)
    return { code: text, label: text } as T
  })
}

// ── 会社CD一覧シート（個別シート）──────────────────────────────────────────────
// 列ヘッダーを最初の 5 行以内でスキャンして列位置を動的に決定する。
// ヘッダーが見つからない場合は A=会社コード / B=会社名 / C=裁量対象サイン をデフォルトとする。
export function parseCompanySheet(raw: unknown[][]): CompanyEntry[] {
  const rowCount = raw.length
  if (rowCount === 0) return []

  let cCode = 0, cName = 1, cDiscretionary = 2
  let dataStartRow = 1

  const colCount = (raw[0]?.length ?? 0)
  for (let r = 0; r <= Math.min(4, rowCount - 1); r++) {
    let foundCode = false
    for (let c = 0; c < Math.min(colCount, 20); c++) {
      const h = cellStr(raw, r, c).replace(/\s/g, '')
      if (!h) continue
      if      (/会社コード|会社CD/.test(h)) { cCode = c; foundCode = true }
      else if (/会社名/.test(h))            { cName = c }
      else if (/裁量対象/.test(h))          { cDiscretionary = c }
    }
    if (foundCode) { dataStartRow = r + 1; break }
  }

  const entries: CompanyEntry[] = []
  for (let r = dataStartRow; r < rowCount; r++) {
    const code = cellStr(raw, r, cCode)
    if (!code) continue
    entries.push({
      code,
      label:                 cellStr(raw, r, cName),
      isDiscretionaryTarget: cellBool(raw, r, cDiscretionary),
    })
  }
  return entries
}

// ── Hardcoded-list compatibility check ────────────────────────────────────────

export interface CompatibilityWarning {
  field:      string
  expected:   string[]
  actual:     string[]
  unexpected: string[]
  missing:    string[]
}

function checkHardcoded(
  actual:   string[],
  expected: readonly string[],
  field:    string,
): CompatibilityWarning | null {
  const unexpected = actual.filter(v => !expected.includes(v))
  const missing    = expected.filter(v => !actual.includes(v))
  if (unexpected.length === 0 && missing.length === 0) return null
  return { field, expected: [...expected], actual, unexpected, missing }
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface ParseMastersResult {
  lists:                 Partial<AllMasters>
  foundKeys:             (keyof AllMasters)[]
  missingKeys:           (keyof AllMasters)[]
  compatibilityWarnings: CompatibilityWarning[]
  columnWarnings:        ColumnWarning[]
}

export function parseMastersFromSheet(raw: unknown[][]): ParseMastersResult {
  const SHEET      = '各種TBL'
  const anchorCols = scanAnchorCols(raw)
  const col        = (key: AnchorKey): number => anchorCols.get(ANCHORS[key]) ?? -1

  const columnWarnings: ColumnWarning[] = (Object.keys(ANCHORS) as AnchorKey[])
    .filter(key => col(key) < 0)
    .map(key => ({ sheet: SHEET, message: `「${ANCHORS[key]}」列が見つかりません（${key}）` }))

  const at = <T>(key: AnchorKey, fn: (c: number) => T[], empty: T[] = []): T[] =>
    col(key) >= 0 ? fn(col(key)) : empty

  const promotionMatrixData = at('promotionMatrix', c => parsePromotionMatrix(raw, c))
  const lists: Partial<AllMasters> = {
    companyFilters:           at('companyFilters',           c => parseCompanyFilters(raw, c)),
    transferReasons:          at('transferReasons',          c => parseTransferReasons(raw, c)),
    employmentTypes:          at('employmentTypes',          c => parseEmploymentTypes(raw, c)),
    payGrades:                at('payGrades',                c => parsePayGrades(raw, c)),
    officialPositions:        at('officialPositions',        c => parseOfficialPositions(raw, c)),
    workLocations:            at('workLocations',            c => parseWorkLocations(raw, c)),
    jobFamilies:              at('jobFamilies',              c => parseJobFamilies(raw, c)),
    jobTypes:                 at('jobTypes',                 c => parseJobTypes(raw, c)),
    jobLevels:                at('jobLevels',                c => parseJobLevels(raw, c)),
    trainingPositions:        at('trainingPositions',        c => parseCodeEntryListAt<TrainingPositionEntry>(raw, c)),
    discretionaryWorkOptions: at('discretionaryWorkOptions', c => parseCodeEntryListAt<DiscretionaryWorkEntry>(raw, c)),
    concurrentReasons:        at('concurrentReasons',        c => parseCodeEntryListAt<ConcurrentReasonEntry>(raw, c)),
    demotionReasons:          at('demotionReasons',          c => parseCodeEntryListAt<DemotionReasonEntry>(raw, c)),
    promotionMatrix:          promotionMatrixData,
  }

  const concurrentTypeActual = at('concurrentType', c =>
    dataRowIndicesAt(raw, c).map(r => cellStr(raw, r, c))
  )

  const compatibilityWarnings: CompatibilityWarning[] = [
    checkHardcoded((lists.trainingPositions        ?? []).map(e => e.label), TRAINING_POSITION_VALUES,          'trainingPositions'),
    checkHardcoded((lists.discretionaryWorkOptions ?? []).map(e => e.label), [DISCRETIONARY_YES, DISCRETIONARY_NO], 'discretionaryWorkOptions'),
    checkHardcoded(concurrentTypeActual,                                      CONCURRENT_TYPES,                  'concurrentType'),
  ].filter((w): w is CompatibilityWarning => w !== null)

  const allKeys     = Object.keys(MASTER_LABELS) as (keyof AllMasters)[]
  const foundKeys   = allKeys.filter(k => (lists[k] as unknown[])?.length > 0)
  const missingKeys = allKeys.filter(k => !foundKeys.includes(k))
  return { lists, foundKeys, missingKeys, compatibilityWarnings, columnWarnings }
}
