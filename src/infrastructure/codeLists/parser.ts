// コードリスト（各種TBL シート）を unknown[][] から解析する純粋関数（ライブラリ非依存）

import type { AllCodeLists } from './types'
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
} from '../../domain/codeLists'
import { TRAINING_POSITION_VALUES } from '../../domain/codeLists/trainingPosition'
import { DISCRETIONARY_YES, DISCRETIONARY_NO } from '../../domain/codeLists/discretionaryWork'
import { CONCURRENT_TYPES } from '../../domain/codeLists/concurrentType'

// ── Column utilities ───────────────────────────────────────────────────────────

function colIdx(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

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

// ── Row range detection ────────────────────────────────────────────────────────
// Row 0 (Excel row 1) = header.  Data starts at row 1 (Excel row 2).
// Stop when keyCol cell is empty.

const DATA_START_ROW = 1

function dataRowIndices(raw: unknown[][], keyColLetter: string): number[] {
  const kc   = colIdx(keyColLetter)
  const rows: number[] = []
  for (let r = DATA_START_ROW; r < raw.length; r++) {
    if (!cellStr(raw, r, kc)) break
    rows.push(r)
  }
  return rows
}

// ── Human-readable labels (for SetupView UI) ──────────────────────────────────
export const CODE_LIST_LABELS: Record<keyof AllCodeLists, string> = {
  orgMasterEntries:         '組織CD一覧',   // parsed by orgMasterParser, not this parser
  companies:                '会社CD一覧',   // parsed by parseCompanySheet, not this parser
  companyFilters:           '会社絞込用',
  employmentTypes:          '雇用タイプ',
  payGrades:                '給与等級',
  officialPositions:        '役職',
  workLocations:            '勤務場所',
  jobFamilies:              '職種（Job Family）',
  jobTypes:           'Sub Job Family',
  jobLevels:                '職務レベル',
  transferReasons:          '異動事由',
  concurrentReasons:        '兼務理由',
  demotionReasons:          '昇降格理由',
  trainingPositions:        '業務研修ポジション',
  discretionaryWorkOptions: '裁量労働／業務研修',
}

// ── Per-group parsers ──────────────────────────────────────────────────────────

function parseCompanyFilters(raw: unknown[][]): CompanyFilterEntry[] {
  return dataRowIndices(raw, 'B').map(r => ({
    code:                        cellStr(raw, r, colIdx('B')),
    label:                       cellStr(raw, r, colIdx('C')),
    noDiscretionaryVMAutoCreate: cellBool(raw, r, colIdx('D')),
  }))
}

function parseTransferReasons(raw: unknown[][]): TransferReasonEntry[] {
  return dataRowIndices(raw, 'F').map(r => {
    const text = cellStr(raw, r, colIdx('F'))
    const note = cellStr(raw, r, colIdx('I'))
    return {
      code:                text,
      label:               text,
      noCheckRequired:     cellBool(raw, r, colIdx('G')),
      concurrentCheckSign: cellBool(raw, r, colIdx('H')),
      ...(note ? { note } : {}),
    }
  })
}

function parseEmploymentTypes(raw: unknown[][]): EmploymentTypeEntry[] {
  return dataRowIndices(raw, 'K').map(r => ({
    code:                            cellStr(raw, r, colIdx('K')),
    label:                           cellStr(raw, r, colIdx('L')),
    isSecondmentAcceptance:           cellBool(raw, r, colIdx('M')),
    isRegularEmployee:                      cellBool(raw, r, colIdx('N')),
    isConcurrentSecondmentAcceptance: cellBool(raw, r, colIdx('O')),
    isExtendedEmployee:           cellBool(raw, r, colIdx('P')),
  }))
}

function parsePayGrades(raw: unknown[][]): PayGradeEntry[] {
  return dataRowIndices(raw, 'R').map(r => {
    const compensationCategory = cellStr(raw, r, colIdx('T'))
    const band                 = cellStr(raw, r, colIdx('U'))
    return {
      code:                   cellStr(raw, r, colIdx('R')),
      label:                  cellStr(raw, r, colIdx('S')),
      ...(compensationCategory ? { compensationCategory } : {}),
      ...(band               ? { band }                : {}),
      isSecondmentAcceptance:  cellBool(raw, r, colIdx('V')),
      isRegularEmployee:             cellBool(raw, r, colIdx('W')),
      isExtendedEmployee:  cellBool(raw, r, colIdx('X')),
      isConcurrent:           cellBool(raw, r, colIdx('Y')),
      isPayGradeChange:   cellBool(raw, r, colIdx('Z')),
    }
  })
}

function parseOfficialPositions(raw: unknown[][]): OfficialPositionEntry[] {
  return dataRowIndices(raw, 'AE').map(r => ({
    code:                  cellStr(raw, r, colIdx('AE')),
    label:                 cellStr(raw, r, colIdx('AF')),
    requiresFreeTitle:           cellBool(raw, r, colIdx('AG')),
    isDiscretionaryTarget: cellBool(raw, r, colIdx('AH')),
  }))
}

function parseWorkLocations(raw: unknown[][]): WorkLocationEntry[] {
  return dataRowIndices(raw, 'AJ').map(r => ({
    code:  cellStr(raw, r, colIdx('AJ')),
    label: cellStr(raw, r, colIdx('AK')),
  }))
}

function parseJobFamilies(raw: unknown[][]): JobFamilyEntry[] {
  return dataRowIndices(raw, 'AM').map(r => ({
    code:  cellStr(raw, r, colIdx('AM')),
    label: cellStr(raw, r, colIdx('AN')),
  }))
}

function parseJobTypes(raw: unknown[][]): JobTypeEntry[] {
  return dataRowIndices(raw, 'AR').map(r => ({
    code:                  cellStr(raw, r, colIdx('AR')),
    label:                 cellStr(raw, r, colIdx('AS')),
    jobFamilyCode:         cellStr(raw, r, colIdx('AP')),
    isDiscretionaryTarget: cellBool(raw, r, colIdx('AT')),
    compensationCategory:  cellStr(raw, r, colIdx('AU')),
  }))
}

function parseJobLevels(raw: unknown[][]): JobLevelEntry[] {
  return dataRowIndices(raw, 'AW').map(r => {
    const promotionDemotionBand = cellStr(raw, r, colIdx('AY'))
    return {
      code:                                    cellStr(raw, r, colIdx('AW')),
      label:                                   cellStr(raw, r, colIdx('AX')),
      ...(promotionDemotionBand ? { promotionDemotionBand } : {}),
      promotionDemotionWarningLevel:             cellNum(raw, r, colIdx('AZ')),
      isSecondmentAcceptance:                     cellBool(raw, r, colIdx('BA')),
      isRegularEmployee:                                cellBool(raw, r, colIdx('BB')),
      isExtendedEmployeePosition:             cellBool(raw, r, colIdx('BC')),
      isExtendedEmployeeJobClassification:    cellBool(raw, r, colIdx('BD')),
      isRegularEmployeeOrSecondmentAcceptance:           cellBool(raw, r, colIdx('BE')),
      isExtendedEmployeeUnionMember:          cellBool(raw, r, colIdx('BF')),
      isDiscretionaryTarget:                     cellNum(raw, r, colIdx('BG')),
    }
  })
}

function parseCodeEntryList<T extends { code: string; label: string }>(
  raw: unknown[][], keyColLetter: string
): T[] {
  return dataRowIndices(raw, keyColLetter).map(r => {
    const text = cellStr(raw, r, colIdx(keyColLetter))
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
// ドメイン層でハードコードされた選択肢と Excel の実データを照合する。
// 不一致があれば警告として返す（Excel 後方互換の破損検出）。

export interface CompatibilityWarning {
  field:      string    // チェック対象フィールド名
  expected:   string[]  // ハードコード定数側の値
  actual:     string[]  // Excel から読み取った値
  unexpected: string[]  // Excel にあってハードコードにない値
  missing:    string[]  // ハードコードにあって Excel にない値
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

export interface ParseCodeListsResult {
  lists:                 Partial<AllCodeLists>
  foundKeys:             (keyof AllCodeLists)[]
  missingKeys:           (keyof AllCodeLists)[]
  compatibilityWarnings: CompatibilityWarning[]
}

export function parseCodeListsFromSheet(raw: unknown[][]): ParseCodeListsResult {
  const lists: Partial<AllCodeLists> = {
    companyFilters:           parseCompanyFilters(raw),
    transferReasons:          parseTransferReasons(raw),
    employmentTypes:          parseEmploymentTypes(raw),
    payGrades:                parsePayGrades(raw),
    officialPositions:        parseOfficialPositions(raw),
    workLocations:            parseWorkLocations(raw),
    jobFamilies:              parseJobFamilies(raw),
    jobTypes:                 parseJobTypes(raw),
    jobLevels:                parseJobLevels(raw),
    trainingPositions:        parseCodeEntryList<TrainingPositionEntry>(raw, 'BI'),
    discretionaryWorkOptions: parseCodeEntryList<DiscretionaryWorkEntry>(raw, 'BM'),
    concurrentReasons:        parseCodeEntryList<ConcurrentReasonEntry>(raw, 'BQ'),
    demotionReasons:          parseCodeEntryList<DemotionReasonEntry>(raw, 'BS'),
  }

  const concurrentTypeActual = dataRowIndices(raw, 'BK').map(r => cellStr(raw, r, colIdx('BK')))

  const compatibilityWarnings: CompatibilityWarning[] = [
    checkHardcoded(
      (lists.trainingPositions ?? []).map(e => e.label),
      TRAINING_POSITION_VALUES,
      'trainingPositions',
    ),
    checkHardcoded(
      (lists.discretionaryWorkOptions ?? []).map(e => e.label),
      [DISCRETIONARY_YES, DISCRETIONARY_NO],
      'discretionaryWorkOptions',
    ),
    checkHardcoded(
      concurrentTypeActual,
      CONCURRENT_TYPES,
      'concurrentType',
    ),
  ].filter((w): w is CompatibilityWarning => w !== null)

  const allKeys     = Object.keys(CODE_LIST_LABELS) as (keyof AllCodeLists)[]
  const foundKeys   = allKeys.filter(k => (lists[k] as unknown[])?.length > 0)
  const missingKeys = allKeys.filter(k => !foundKeys.includes(k))
  return { lists, foundKeys, missingKeys, compatibilityWarnings }
}
