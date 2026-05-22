// コードリスト（各種TBL シート）を unknown[][] から解析する純粋関数（ライブラリ非依存）

import type { AllCodeLists } from './types'
import type {
  CompanyFilterEntry,
  EmploymentTypeEntry,
  PayGradeEntry,
  OfficialPositionEntry,
  WorkLocationEntry,
  JobFamilyEntry,
  SubJobFamilyEntry,
  JobLevelEntry,
  TransferReasonEntry,
  ConcurrentReasonEntry,
  DemotionReasonEntry,
} from '../../domain/codeLists'

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
  companyFilters:           '会社絞込用',
  employmentTypes:          '雇用タイプ',
  payGrades:                '給与等級',
  officialPositions:        '役職',
  workLocations:            '勤務場所',
  jobFamilies:              '職種（Job Family）',
  subJobFamilies:           'Sub Job Family',
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
    isOutsourceAcceptance:           cellBool(raw, r, colIdx('M')),
    isEmployee:                      cellBool(raw, r, colIdx('N')),
    isConcurrentOutsourceAcceptance: cellBool(raw, r, colIdx('O')),
    isEmploymentExtension:           cellBool(raw, r, colIdx('P')),
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
      isOutsourceAcceptance:  cellBool(raw, r, colIdx('V')),
      isEmployee:             cellBool(raw, r, colIdx('W')),
      isEmploymentExtension:  cellBool(raw, r, colIdx('X')),
      isConcurrent:           cellBool(raw, r, colIdx('Y')),
      isPayGradeChangeSign:   cellBool(raw, r, colIdx('Z')),
    }
  })
}

function parseOfficialPositions(raw: unknown[][]): OfficialPositionEntry[] {
  return dataRowIndices(raw, 'AE').map(r => ({
    code:                  cellStr(raw, r, colIdx('AE')),
    label:                 cellStr(raw, r, colIdx('AF')),
    isFreeTitle:           cellBool(raw, r, colIdx('AG')),
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

function parseSubJobFamilies(raw: unknown[][]): SubJobFamilyEntry[] {
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
      isOutsourceAcceptance:                     cellBool(raw, r, colIdx('BA')),
      isEmployee:                                cellBool(raw, r, colIdx('BB')),
      isEmploymentExtensionPosition:             cellBool(raw, r, colIdx('BC')),
      isEmploymentExtensionJobClassification:    cellBool(raw, r, colIdx('BD')),
      isEmployeeOrAcceptedUnionMember:           cellBool(raw, r, colIdx('BE')),
      isEmploymentExtensionUnionMember:          cellBool(raw, r, colIdx('BF')),
      isDiscretionaryTarget:                     cellNum(raw, r, colIdx('BG')),
    }
  })
}

function parseSingleColumnList(raw: unknown[][], keyColLetter: string): string[] {
  return dataRowIndices(raw, keyColLetter)
    .map(r => cellStr(raw, r, colIdx(keyColLetter)))
    .filter(Boolean)
}

function parseCodeEntryList<T extends { code: string; label: string }>(
  raw: unknown[][], keyColLetter: string
): T[] {
  return dataRowIndices(raw, keyColLetter).map(r => {
    const text = cellStr(raw, r, colIdx(keyColLetter))
    return { code: text, label: text } as T
  })
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface ParseCodeListsResult {
  lists:          Partial<AllCodeLists>
  foundKeys:      (keyof AllCodeLists)[]
  missingKeys:    (keyof AllCodeLists)[]
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
    subJobFamilies:           parseSubJobFamilies(raw),
    jobLevels:                parseJobLevels(raw),
    trainingPositions:        parseSingleColumnList(raw, 'BI'),
    discretionaryWorkOptions: parseSingleColumnList(raw, 'BM'),
    concurrentReasons:        parseCodeEntryList<ConcurrentReasonEntry>(raw, 'BQ'),
    demotionReasons:          parseCodeEntryList<DemotionReasonEntry>(raw, 'BS'),
  }

  const allKeys     = Object.keys(CODE_LIST_LABELS) as (keyof AllCodeLists)[]
  const foundKeys   = allKeys.filter(k => (lists[k] as unknown[])?.length > 0)
  const missingKeys = allKeys.filter(k => !foundKeys.includes(k))
  return { lists, foundKeys, missingKeys }
}
