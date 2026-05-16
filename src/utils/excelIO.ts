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

export function exportToXlsx(rows: AllocationRow[], effectiveDate: string): void {
  // Count fields per group using explicit key sets to avoid mis-classification
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

  // Column header row (Japanese labels from the field definitions)
  const colRow = EXPORT_FIELDS.map(f => f.header ?? f.key)

  const dataRows = rows.map(row =>
    EXPORT_FIELDS.map(f => {
      const val = row[f.key as keyof AllocationList]
      return val ?? ''
    })
  )

  const ws = XLSX.utils.aoa_to_sheet([groupRow, colRow, ...dataRows])

  // Column widths
  ws['!cols'] = EXPORT_FIELDS.map(f => {
    if (['no'].includes(f.key))                 return { wch: 4 }
    if (['userId', 'employeeNumber'].includes(f.key)) return { wch: 12 }
    if (['lastName', 'firstName'].includes(f.key))    return { wch: 8 }
    if (['memo', 'concurrentReason', 'prevConcurrentReason'].includes(f.key)) return { wch: 20 }
    return { wch: 14 }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '発令一覧')
  XLSX.writeFile(wb, `発令一覧_${effectiveDate}.xlsx`)
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

// Build a header→key lookup from ALLOCATION_LIST_FIELDS
const headerToKey = new Map<string, keyof AllocationList>(
  ALLOCATION_LIST_FIELDS.map(f => [f.header ?? f.key, f.key as keyof AllocationList])
)

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

        // Detect header row: look for 'No' or 'ユーザー/社員ID'
        const headerRowIdx = raw.findIndex(row =>
          Array.isArray(row) && row.some(cell =>
            typeof cell === 'string' && (cell === 'No' || cell === 'ユーザー/社員ID')
          )
        )
        if (headerRowIdx < 0) {
          return resolve({ rows: [], error: 'ヘッダー行が見つかりません。このアプリでエクスポートしたExcelを使用してください。' })
        }

        const headers = raw[headerRowIdx] as string[]

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

          if (!entry.userId) continue  // userId is required
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
    // Use after-state as the authoritative snapshot; fall back to prev if after is empty
    const hasAfterState = !!(row.positionCode || row.departmentCode || row.employmentType)
    if (!hasAfterState && !row.prevDepartmentCode) { skippedRows++; continue }

    // ── Person ──────────────────────────────────────────────────
    let person = row.userId
      ? existingPersons.find(p => p.sfPersonId === row.userId)
      : undefined
    if (!person && row.lastName) {
      const fullName = [row.lastName, row.firstName].filter(Boolean).join(' ')
      person = existingPersons.find(p => p.name === fullName)
    }
    if (!person) {
      const newId = `imported_p_${Date.now()}_${persons.length}`
      const fullName = [row.lastName, row.firstName].filter(Boolean).join(' ') || row.userId
      person = { id: newId, name: fullName, sfPersonId: row.userId }
      persons.push(person)
    }

    // ── Organization: look up by externalCode (departmentCode) ──
    const deptCode = hasAfterState ? row.departmentCode : row.prevDepartmentCode
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

    // Add org placeholder if not found
    if (deptCode && !org) {
      orgs.push({
        id: deptCode, name: deptCode, companyId: company.id,
        parentId: null, level: 2, externalCode: deptCode,
      })
    }

    // ── Position ─────────────────────────────────────────────────
    const posId = `imported_pos_${person.id}_${company.id}`
    const pos: Position = {
      id:          posId,
      orgId:       org?.id ?? deptCode ?? company.id,
      companyId:   company.id,
      title:       hasAfterState ? row.officialPositionCode : row.prevOfficialPositionCode,
      band:        hasAfterState ? (row.positionBand ?? row.band) : (row.prevPositionBand ?? row.prevBand),
      isVacant:    false,
      sfPositionId:    hasAfterState ? row.positionCode : row.prevPositionCode,
      workLocation:    hasAfterState ? row.location     : row.prevLocation,
      costCenter:      hasAfterState ? row.costCenter   : row.prevCostCenter,
      jobFamily:       hasAfterState ? row.jobFamily    : row.prevJobFamily,
      jobType:         hasAfterState ? row.jobType      : row.prevJobType,
      managerPositionCode: hasAfterState ? row.managerPositionCode : row.prevManagerPositionCode,
      isTrainingPosition:  hasAfterState
        ? row.trainingPositionFlag === '○'
        : row.prevTrainingPositionFlag === '○',
      isUnionPosition:     hasAfterState
        ? row.positionUnionFlag === '○'
        : row.prevPositionUnionFlag === '○',
      isDiscretionaryLaborPosition: hasAfterState
        ? row.positionDiscretionaryWorkFlag === '○'
        : row.prevPositionDiscretionaryWorkFlag === '○',
    }
    positions.push(pos)

    // ── Affiliation ───────────────────────────────────────────────
    const ct = hasAfterState ? row.concurrentType : row.prevConcurrentType
    const aff: Affiliation = {
      id:           `imported_aff_${person.id}_${company.id}`,
      personId:     person.id,
      positionId:   posId,
      type:         ct === '兼務' ? 'concurrent' : 'primary',
      status:       'active',
      startDate:    '2000-01-01',
      employmentType:   hasAfterState ? row.employmentType    : row.prevEmploymentType,
      concurrentReason: hasAfterState ? row.concurrentReason  : row.prevConcurrentReason,
      freeTitle:        hasAfterState ? row.localJobTitle      : row.prevLocalJobTitle,
      individualBand:   hasAfterState ? row.band               : row.prevBand,
      salaryGrade:      hasAfterState ? row.payGrade           : row.prevPayGrade,
      isOnLeave:        hasAfterState
        ? row.leaveFlag    === '○'
        : row.prevLeaveFlag === '○',
      isNonUnionAgreement: hasAfterState
        ? row.nonUnionAgreementFlag    === '○'
        : row.prevNonUnionAgreementFlag === '○',
      isUnionMember: hasAfterState
        ? row.unionFlag    === '○'
        : row.prevUnionFlag === '○',
      isDiscretionaryLabor: hasAfterState
        ? row.discretionaryWorkFlag    === '○'
        : row.prevDiscretionaryWorkFlag === '○',
    }
    affiliations.push(aff)
  }

  return { persons, companies, organizations: orgs, affiliations, positions, skippedRows }
}
