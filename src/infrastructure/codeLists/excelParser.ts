import * as XLSX from 'xlsx'
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

// Convert Excel column letter(s) to 0-based column index  (A=0, B=1, …, Z=25, AA=26 …)
function colIdx(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64)
  }
  return n - 1
}

function cellStr(ws: XLSX.WorkSheet, r: number, c: number): string {
  return String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? '').trim()
}

function cellBool(ws: XLSX.WorkSheet, r: number, c: number): boolean {
  const v = ws[XLSX.utils.encode_cell({ r, c })]?.v
  return v === 1 || v === '1' || v === true || v === 'TRUE' || v === '○' || v === 'true'
}

function cellNum(ws: XLSX.WorkSheet, r: number, c: number): number {
  const v = ws[XLSX.utils.encode_cell({ r, c })]?.v
  return typeof v === 'number' ? v : (Number(String(v ?? '')) || 0)
}

// ── Row range detection ────────────────────────────────────────────────────────
// Row 0 (Excel row 1) = header.  Data starts at row 1 (Excel row 2).
// Stop when keyCol cell is empty.

const DATA_START_ROW = 1

function dataRowIndices(ws: XLSX.WorkSheet, keyColLetter: string): number[] {
  const kc    = colIdx(keyColLetter)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  const rows: number[] = []
  for (let r = DATA_START_ROW; r <= range.e.r; r++) {
    if (!cellStr(ws, r, kc)) break
    rows.push(r)
  }
  return rows
}

// ── Human-readable labels (for MasterSetup UI) ────────────────────────────────
export const CODE_LIST_LABELS: Record<keyof AllCodeLists, string> = {
  orgMasterEntries:         '組織CD一覧',   // parsed by excelImport.ts, not this parser
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
// Each function reads from a fixed column layout as defined in CODELIST_SPEC.md.
// Columns reference spec: sheet starts at column B (data rows 2+ in Excel).

function parseCompanyFilters(ws: XLSX.WorkSheet): CompanyFilterEntry[] {
  return dataRowIndices(ws, 'B').map(r => ({
    code:                       cellStr(ws, r, colIdx('B')),
    label:                      cellStr(ws, r, colIdx('C')),
    noDiscretionaryVMAutoCreate: cellBool(ws, r, colIdx('D')),
  }))
}

function parseTransferReasons(ws: XLSX.WorkSheet): TransferReasonEntry[] {
  return dataRowIndices(ws, 'F').map(r => {
    const text = cellStr(ws, r, colIdx('F'))
    const note = cellStr(ws, r, colIdx('I'))
    return {
      code:                text,  // CDなし: code = label
      label:               text,
      noCheckRequired:     cellBool(ws, r, colIdx('G')),
      concurrentCheckSign: cellBool(ws, r, colIdx('H')),
      ...(note ? { note } : {}),
    }
  })
}

function parseEmploymentTypes(ws: XLSX.WorkSheet): EmploymentTypeEntry[] {
  return dataRowIndices(ws, 'K').map(r => ({
    code:                           cellStr(ws, r, colIdx('K')),
    label:                          cellStr(ws, r, colIdx('L')),
    isOutsourceAcceptance:           cellBool(ws, r, colIdx('M')),
    isEmployee:                      cellBool(ws, r, colIdx('N')),
    isConcurrentOutsourceAcceptance: cellBool(ws, r, colIdx('O')),
    isEmploymentExtension:           cellBool(ws, r, colIdx('P')),
  }))
}

function parsePayGrades(ws: XLSX.WorkSheet): PayGradeEntry[] {
  return dataRowIndices(ws, 'R').map(r => {
    const compensationCategory = cellStr(ws, r, colIdx('T'))
    const band                 = cellStr(ws, r, colIdx('U'))
    return {
      code:                   cellStr(ws, r, colIdx('R')),
      label:                  cellStr(ws, r, colIdx('S')),
      ...(compensationCategory ? { compensationCategory } : {}),
      ...(band               ? { band }                : {}),
      isOutsourceAcceptance:  cellBool(ws, r, colIdx('V')),
      isEmployee:             cellBool(ws, r, colIdx('W')),
      isEmploymentExtension:  cellBool(ws, r, colIdx('X')),
      isConcurrent:           cellBool(ws, r, colIdx('Y')),
      isPayGradeChangeSign:   cellBool(ws, r, colIdx('Z')),
    }
  })
}

function parseOfficialPositions(ws: XLSX.WorkSheet): OfficialPositionEntry[] {
  return dataRowIndices(ws, 'AE').map(r => ({
    code:                  cellStr(ws, r, colIdx('AE')),
    label:                 cellStr(ws, r, colIdx('AF')),
    isFreeTitle:           cellBool(ws, r, colIdx('AG')),
    isDiscretionaryTarget: cellBool(ws, r, colIdx('AH')),
  }))
}

function parseWorkLocations(ws: XLSX.WorkSheet): WorkLocationEntry[] {
  return dataRowIndices(ws, 'AJ').map(r => ({
    code:  cellStr(ws, r, colIdx('AJ')),
    label: cellStr(ws, r, colIdx('AK')),
  }))
}

// 職種テーブル (AM-AN) → jobFamilies
function parseJobFamilies(ws: XLSX.WorkSheet): JobFamilyEntry[] {
  return dataRowIndices(ws, 'AM').map(r => ({
    code:  cellStr(ws, r, colIdx('AM')),
    label: cellStr(ws, r, colIdx('AN')),
  }))
}

// SubJobFamily テーブル (AR-AU, jobFamilyCode from AP)
function parseSubJobFamilies(ws: XLSX.WorkSheet): SubJobFamilyEntry[] {
  return dataRowIndices(ws, 'AR').map(r => ({
    code:                  cellStr(ws, r, colIdx('AR')),
    label:                 cellStr(ws, r, colIdx('AS')),
    jobFamilyCode:         cellStr(ws, r, colIdx('AP')),  // 親 Job Family CD (= 職種CD)
    isDiscretionaryTarget: cellBool(ws, r, colIdx('AT')),
    compensationCategory:  cellStr(ws, r, colIdx('AU')),
  }))
}

function parseJobLevels(ws: XLSX.WorkSheet): JobLevelEntry[] {
  return dataRowIndices(ws, 'AW').map(r => {
    const promotionDemotionBand = cellStr(ws, r, colIdx('AY'))
    return {
      code:                                    cellStr(ws, r, colIdx('AW')),
      label:                                   cellStr(ws, r, colIdx('AX')),
      ...(promotionDemotionBand ? { promotionDemotionBand } : {}),
      promotionDemotionWarningLevel:             cellNum(ws, r, colIdx('AZ')),
      isOutsourceAcceptance:                     cellBool(ws, r, colIdx('BA')),
      isEmployee:                                cellBool(ws, r, colIdx('BB')),
      isEmploymentExtensionPosition:             cellBool(ws, r, colIdx('BC')),
      isEmploymentExtensionJobClassification:    cellBool(ws, r, colIdx('BD')),
      isEmployeeOrAcceptedUnionMember:           cellBool(ws, r, colIdx('BE')),
      isEmploymentExtensionUnionMember:          cellBool(ws, r, colIdx('BF')),
      isDiscretionaryTarget:                     cellNum(ws, r, colIdx('BG')),
    }
  })
}

// 単一列の純粋リスト (string[])
function parseSingleColumnList(ws: XLSX.WorkSheet, keyColLetter: string): string[] {
  return dataRowIndices(ws, keyColLetter)
    .map(r => cellStr(ws, r, colIdx(keyColLetter)))
    .filter(Boolean)
}

// CDなしの CodeEntry リスト (code = label)
function parseCodeEntryList<T extends { code: string; label: string }>(
  ws: XLSX.WorkSheet, keyColLetter: string
): T[] {
  return dataRowIndices(ws, keyColLetter).map(r => {
    const text = cellStr(ws, r, colIdx(keyColLetter))
    return { code: text, label: text } as T
  })
}

// ── Main exports ───────────────────────────────────────────────────────────────

export interface ParseCodeListsResult {
  lists:          Partial<AllCodeLists>
  foundKeys:      (keyof AllCodeLists)[]
  missingKeys:    (keyof AllCodeLists)[]
}

export function parseCodeListsFromWorkbook(
  wb: XLSX.WorkBook,
  sheetName: string,
): ParseCodeListsResult {
  const ws = wb.Sheets[sheetName]

  if (!ws) {
    const missingKeys = Object.keys(CODE_LIST_LABELS) as (keyof AllCodeLists)[]
    return { lists: {}, foundKeys: [], missingKeys }
  }

  const lists: Partial<AllCodeLists> = {
    companyFilters:           parseCompanyFilters(ws),
    transferReasons:          parseTransferReasons(ws),
    employmentTypes:          parseEmploymentTypes(ws),
    payGrades:                parsePayGrades(ws),
    officialPositions:        parseOfficialPositions(ws),
    workLocations:            parseWorkLocations(ws),
    jobFamilies:              parseJobFamilies(ws),
    subJobFamilies:           parseSubJobFamilies(ws),
    jobLevels:                parseJobLevels(ws),
    trainingPositions:        parseSingleColumnList(ws, 'BI'),
    discretionaryWorkOptions: parseSingleColumnList(ws, 'BM'),
    concurrentReasons:        parseCodeEntryList<ConcurrentReasonEntry>(ws, 'BQ'),
    demotionReasons:          parseCodeEntryList<DemotionReasonEntry>(ws, 'BS'),
  }

  const allKeys     = Object.keys(CODE_LIST_LABELS) as (keyof AllCodeLists)[]
  const foundKeys   = allKeys.filter(k => (lists[k] as unknown[])?.length > 0)
  const missingKeys = allKeys.filter(k => !foundKeys.includes(k))

  return { lists, foundKeys, missingKeys }
}

export async function parseCodeListsFromFile(
  file: File,
  sheetName: string,
): Promise<ParseCodeListsResult> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const data = e.target?.result
      if (!data) {
        resolve({ lists: {}, foundKeys: [], missingKeys: Object.keys(CODE_LIST_LABELS) as (keyof AllCodeLists)[] })
        return
      }
      const wb = XLSX.read(data, { type: 'array' })
      resolve(parseCodeListsFromWorkbook(wb, sheetName))
    }
    reader.onerror = () =>
      resolve({ lists: {}, foundKeys: [], missingKeys: Object.keys(CODE_LIST_LABELS) as (keyof AllCodeLists)[] })
    reader.readAsArrayBuffer(file)
  })
}
