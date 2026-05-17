import * as XLSX from 'xlsx'
import type { Affiliation, Position, Person, Company, Organization } from '../types/domain'
import type { AllocationList } from '../domain/csvImport/allocationList/schema'
import type { AllocationRow } from './allocationListMapper'
import { ALLOCATION_LIST_FIELDS } from '../domain/csvImport/allocationList/labels'

// ── Export ────────────────────────────────────────────────────────────────────

// Fields shown in the Excel, grouped: metadata | after | before | audit
// (a subset of ALLOCATION_LIST_FIELDS — omit groupEmployeeId which is system-generated)
const EXPORT_FIELDS = ALLOCATION_LIST_FIELDS.filter(f =>
  f.key !== 'groupEmployeeId'
)

const EXPORT_SHEET_NAME = '要員配置リスト'

// ワークブックを組み立てて返す（ファイル書き込みは行わない）
// 元ワークブックがある場合は要員配置リストシートの同じ行・列位置に上書きし、
// それ以外の行（タイトル行など）やシートはそのまま保持する。
export function buildExportWorkbook(
  rows: AllocationRow[],
  effectiveDate: string,
  originalWorkbook?: XLSX.WorkBook,
  originalFileName?: string,
): { workbook: XLSX.WorkBook; fileName: string } {
  const baseName = (originalFileName ?? '発令一覧').replace(/\.[^.]+$/, '')
  const ext      = originalFileName?.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
  const fileName = originalWorkbook
    ? `${baseName}_${effectiveDate}.${ext}`
    : `発令一覧_${effectiveDate}.xlsx`

  // 元シートがあれば、同じ行・列オフセットにデータを書き戻す
  if (originalWorkbook?.Sheets[EXPORT_SHEET_NAME]) {
    const origSheet = originalWorkbook.Sheets[EXPORT_SHEET_NAME]
    const raw = XLSX.utils.sheet_to_json<unknown[]>(origSheet, { header: 1, defval: '' })
    const headerRowIdx = findHeaderRowIndex(raw)

    if (headerRowIdx >= 0) {
      // 元ヘッダー行のテキスト → 列インデックスのマップを作成
      const origHeaderRow = raw[headerRowIdx] as unknown[]
      const headerTextToCol = new Map<string, number>()
      origHeaderRow.forEach((cell, col) => {
        const text = typeof cell === 'string' ? (cell as string).trim() : ''
        if (text) headerTextToCol.set(text, col)
      })

      // シートをシャローコピー（!ref のみ更新し、メタ情報は保持）
      const ws: XLSX.WorkSheet = { ...origSheet }

      // ヘッダー行より下のデータセルをすべてクリア
      const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
      for (let r = headerRowIdx + 1; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          delete ws[XLSX.utils.encode_cell({ r, c })]
        }
      }

      // 新データを元の列位置に書き込む
      rows.forEach((row, idx) => {
        const r = headerRowIdx + 1 + idx
        EXPORT_FIELDS.forEach(f => {
          const col = headerTextToCol.get(f.header ?? f.key)
          if (col === undefined) return
          const val = (row as Record<string, unknown>)[f.key]
          if (val === undefined || val === null || val === '') return
          ws[XLSX.utils.encode_cell({ r, c: col })] = { v: val, t: 's' }
        })
      })

      // !ref を新しいデータ範囲に更新
      const lastDataRow = rows.length > 0 ? headerRowIdx + rows.length : headerRowIdx
      ws['!ref'] = XLSX.utils.encode_range({
        s: range.s,
        e: { r: lastDataRow, c: range.e.c },
      })

      const workbook: XLSX.WorkBook = {
        ...originalWorkbook,
        Sheets: { ...originalWorkbook.Sheets, [EXPORT_SHEET_NAME]: ws },
      }
      return { workbook, fileName }
    }
  }

  // 元シートがない場合 / ヘッダーが見つからない場合: 新規シートを作成
  const META_KEYS = new Set(['no', 'userId', 'employeeNumber', 'lastName', 'firstName',
    'transferReason', 'memo', 'promotionSign', 'demotionReason', 'payGradeChangeSign'])

  const metaCount  = EXPORT_FIELDS.filter(f => META_KEYS.has(f.key)).length
  const afterCount = EXPORT_FIELDS.filter(f => isAfterField(f.key)).length
  const prevCount  = EXPORT_FIELDS.filter(f => f.key.startsWith('prev')).length
  const auditCount = EXPORT_FIELDS.length - metaCount - afterCount - prevCount

  const fill = (n: number) => Array(Math.max(0, n - 1)).fill('')
  const groupRow = [
    '本人情報 / 変更区分', ...fill(metaCount),
    'After（発令後）',     ...fill(afterCount),
    'Before（発令前）',    ...fill(prevCount),
    ...(auditCount > 0 ? ['除外', ...fill(auditCount)] : []),
  ]
  const colRow   = EXPORT_FIELDS.map(f => f.header ?? f.key)
  const dataRows = rows.map(row =>
    EXPORT_FIELDS.map(f => (row as Record<string, unknown>)[f.key] ?? '')
  )

  const ws = XLSX.utils.aoa_to_sheet([groupRow, colRow, ...dataRows])
  ws['!cols'] = EXPORT_FIELDS.map(f => {
    if (['no'].includes(f.key))                                                  return { wch: 4 }
    if (['userId', 'employeeNumber'].includes(f.key))                            return { wch: 12 }
    if (['lastName', 'firstName'].includes(f.key))                               return { wch: 8 }
    if (['memo', 'concurrentReason', 'prevConcurrentReason'].includes(f.key))    return { wch: 20 }
    return { wch: 14 }
  })

  if (originalWorkbook) {
    // 元ワークブックは存在するが要員配置リストシートがなかった場合 → 先頭に追加
    const sheetNames = [EXPORT_SHEET_NAME, ...originalWorkbook.SheetNames.filter(n => n !== EXPORT_SHEET_NAME)]
    const workbook: XLSX.WorkBook = {
      ...originalWorkbook,
      SheetNames: sheetNames,
      Sheets: { ...originalWorkbook.Sheets, [EXPORT_SHEET_NAME]: ws },
    }
    return { workbook, fileName }
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, ws, EXPORT_SHEET_NAME)
  return { workbook, fileName }
}

export function exportToXlsx(
  rows: AllocationRow[],
  effectiveDate: string,
  originalWorkbook?: XLSX.WorkBook,
  originalFileName?: string,
): void {
  const { workbook, fileName } = buildExportWorkbook(rows, effectiveDate, originalWorkbook, originalFileName)
  XLSX.writeFile(workbook, fileName)
}

// Returns true for the after-state (新) fields — excludes prev* and metadata
function isAfterField(key: string): boolean {
  if (key.startsWith('prev')) return false
  if (key === 'exclusionReason') return false
  const metaKeys = new Set(['no', 'userId', 'groupEmployeeId', 'employeeNumber', 'lastName', 'firstName',
    'transferReason', 'memo', 'promotionSign', 'demotionReason', 'payGradeChangeSign'])
  return !metaKeys.has(key)
}

// ── Import ────────────────────────────────────────────────────────────────────

export interface ImportResult {
  rows:   AllocationList[]
  error?: string
}

// Build a header→key lookup from ALLOCATION_LIST_FIELDS (trimmed keys for robustness)
const headerToKey = new Map<string, keyof AllocationList>(
  ALLOCATION_LIST_FIELDS.flatMap(f => {
    const key = f.key as keyof AllocationList
    const header = f.header ?? f.key
    return [[header, key], [header.trim(), key]]
  })
)

// Find the header row by scoring matches against ALLOCATION_LIST_FIELDS headers
function findHeaderRowIndex(raw: unknown[][]): number {
  const headerSet = new Set(ALLOCATION_LIST_FIELDS.map(f => (f.header ?? f.key).trim()))
  let bestIdx = -1, bestScore = 1
  const limit = Math.min(10, raw.length)
  for (let i = 0; i < limit; i++) {
    const row = raw[i]
    if (!Array.isArray(row)) continue
    const score = (row as unknown[]).filter(c => typeof c === 'string' && headerSet.has((c as string).trim())).length
    if (score > bestScore) { bestScore = score; bestIdx = i }
  }
  return bestIdx
}

export async function parseXlsx(file: File): Promise<ImportResult> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = e.target?.result
        if (!data) return resolve({ rows: [], error: 'ファイルの読み込みに失敗しました' })

        const wb  = XLSX.read(data, { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

        const headerRowIdx = findHeaderRowIndex(raw)
        if (headerRowIdx < 0) {
          return resolve({ rows: [], error: 'ヘッダー行が見つかりません。要員配置リストのExcelを使用してください。' })
        }

        const headers = (raw[headerRowIdx] as unknown[]).map(c => typeof c === 'string' ? c.trim() : '')

        const rows: AllocationList[] = []
        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const dataRow = raw[i] as unknown[]
          if (dataRow.every(c => c === '' || c === null || c === undefined)) continue

          const entry: Record<string, string> = {}
          headers.forEach((header, idx) => {
            const key = headerToKey.get(header)
            if (!key) return
            const val = dataRow[idx]
            if (val !== '' && val !== null && val !== undefined) {
              entry[key] = String(val)
            }
          })

          if (!entry.userId) continue
          rows.push(entry as AllocationList)
        }

        resolve({ rows })
      } catch (err) {
        resolve({ rows: [], error: `解析エラー: ${String(err)}` })
      }
    }
    reader.onerror = () => resolve({ rows: [], error: 'ファイルの読み込みに失敗しました' })
    reader.readAsArrayBuffer(file)
  })
}

// ── Build base Domain state from imported AllocationList rows ─────────────────

export interface BaseStateFromImport {
  persons:       Person[]
  companies:     Company[]
  organizations: Organization[]
  affiliations:  Affiliation[]
  positions:     Position[]
  skippedRows:   number
}

export function buildBaseState(
  importedRows:     AllocationList[],
  existingPersons:  Person[],
  existingCompanies: Company[],
  existingOrgs:     Organization[],
): BaseStateFromImport {
  const persons:      Person[]       = [...existingPersons]
  const companies:    Company[]      = [...existingCompanies]
  const orgs:         Organization[] = [...existingOrgs]
  const affiliations: Affiliation[]  = []
  const positions:    Position[]     = []
  let skippedRows = 0

  for (const row of importedRows) {
    // ── Person: 常に作成（org/position がなくても組織図・検索に表示するため）──
    let person = row.groupEmployeeId
      ? persons.find(p => p.groupEmployeeId === row.groupEmployeeId)
      : undefined
    if (!person) person = row.userId
      ? persons.find(p => p.sfPersonId === row.userId)
      : undefined
    if (!person && row.lastName) {
      const fullName = [row.lastName, row.firstName].filter(Boolean).join(' ')
      person = persons.find(p => p.name === fullName)
    }
    if (!person) {
      const newId = `imported_p_${Date.now()}_${persons.length}`
      const fullName = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId
      person = {
        id: newId, name: fullName, sfPersonId: row.userId,
        employeeNumber:  row.employeeNumber,
        groupEmployeeId: row.groupEmployeeId,
      }
      persons.push(person)
    }

    // org/position 情報がない行は Person のみで終了（Position/Affiliation は作らない）
    const hasBeforeState = !!(row.prevDepartmentCode || row.prevPositionCode || row.prevConcurrentType)
    const hasAfterState  = !!(row.departmentCode     || row.positionCode     || row.employmentType)
    if (!hasBeforeState && !hasAfterState) { skippedRows++; continue }
    // どちらを使うか: before があれば before、なければ after（新規採用など）
    const useAfter = !hasBeforeState

    // ── Organization: look up by externalCode (departmentCode) ──
    const deptCode = useAfter ? row.departmentCode : row.prevDepartmentCode
    const org = deptCode
      ? orgs.find(o => o.externalCode === deptCode) ?? orgs.find(o => o.id === deptCode)
      : undefined

    // ── Company: derive from org, or create placeholder ─────────
    let company = org
      ? companies.find(c => c.id === org.companyId)
      : undefined
    if (!company) {
      const companyId = `imported_c_${companies.length}`
      company = { id: companyId, name: deptCode ?? 'Unknown', hasSF: true }
      companies.push(company)
    }

    // 組織マスタにないコードは「未設定」の子として追加（コードは削除しない）
    if (deptCode && !org) {
      const unassignedId = `unassigned_${company.id}`
      if (!orgs.find(o => o.id === unassignedId)) {
        orgs.push({ id: unassignedId, name: '未設定', companyId: company.id, parentId: null, level: 99, externalCode: undefined })
      }
      orgs.push({
        id: deptCode, name: deptCode, companyId: company.id,
        parentId: unassignedId, level: 2, externalCode: deptCode,
      })
    }

    // ── Position: before 列を基準、before がなければ after 列を使う ──
    const sfPosCode = useAfter ? row.positionCode : row.prevPositionCode
    const posId = sfPosCode
      ? `imported_pos_${sfPosCode}`
      : `imported_pos_${person.id}_${company.id}_${positions.length}`
    const pos: Position = {
      id:          posId,
      orgId:       org?.id ?? deptCode ?? company.id,
      companyId:   company.id,
      title:       useAfter ? row.officialPositionCode : row.prevOfficialPositionCode,
      band:        useAfter ? (row.positionBand ?? row.band) : (row.prevPositionBand ?? row.prevBand),
      isVacant:    false,
      sfPositionId:        sfPosCode,
      workLocation:        useAfter ? row.location             : row.prevLocation,
      costCenter:          useAfter ? row.costCenter           : row.prevCostCenter,
      jobFamily:           useAfter ? row.jobFamily            : row.prevJobFamily,
      jobType:             useAfter ? row.jobType              : row.prevJobType,
      managerPositionCode: useAfter ? row.managerPositionCode  : row.prevManagerPositionCode,
      isTrainingPosition:  (useAfter ? row.trainingPositionFlag         : row.prevTrainingPositionFlag)         === '○',
      isUnionPosition:     (useAfter ? row.positionUnionFlag            : row.prevPositionUnionFlag)            === '○',
      isDiscretionaryLaborPosition: (useAfter ? row.positionDiscretionaryWorkFlag : row.prevPositionDiscretionaryWorkFlag) === '○',
    }
    positions.push(pos)

    // ── Affiliation ───────────────────────────────────────────────
    const ct = useAfter ? row.concurrentType : row.prevConcurrentType
    const aff: Affiliation = {
      id:           `imported_aff_${posId}`,
      personId:     person.id,
      positionId:   posId,
      type:         ct === '兼務' ? 'concurrent' : 'primary',
      status:       'active',
      startDate:    '2000-01-01',
      employmentType:   useAfter ? row.employmentType   : row.prevEmploymentType,
      concurrentReason: useAfter ? row.concurrentReason : row.prevConcurrentReason,
      freeTitle:        useAfter ? row.localJobTitle    : row.prevLocalJobTitle,
      individualBand:   useAfter ? row.band             : row.prevBand,
      salaryGrade:      useAfter ? row.payGrade         : row.prevPayGrade,
      isOnLeave:           (useAfter ? row.leaveFlag            : row.prevLeaveFlag)           === '○',
      isNonUnionAgreement: (useAfter ? row.nonUnionAgreementFlag : row.prevNonUnionAgreementFlag) === '○',
      isUnionMember:       (useAfter ? row.unionFlag            : row.prevUnionFlag)           === '○',
      isDiscretionaryLabor:(useAfter ? row.discretionaryWorkFlag : row.prevDiscretionaryWorkFlag) === '○',
    }
    affiliations.push(aff)
  }

  return { persons, companies, organizations: orgs, affiliations, positions, skippedRows }
}
