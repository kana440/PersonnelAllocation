import * as XLSX from 'xlsx'
import type { ExcelRow, PositionSnapshot, Affiliation, Position, Person, Company, Organization } from '../types/domain'

// ── Field definitions (must stay in sync with ExcelPreview SNAPSHOT_FIELDS) ──
const SNAPSHOT_FIELDS: { key: keyof PositionSnapshot; label: string }[] = [
  { key: 'employmentType',               label: '雇用タイプ' },
  { key: 'concurrentType',               label: '本務兼務区分' },
  { key: 'concurrentReason',             label: '兼務理由' },
  { key: 'secondmentSourceCompany',      label: '出向元会社' },
  { key: 'secondmentSourceEmployeeId',   label: '出向元社員番号' },
  { key: 'isOnLeave',                    label: '休職者サイン' },
  { key: 'positionCode',                 label: 'ポジションコード' },
  { key: 'orgCode',                      label: '組織コード' },
  { key: 'jobTitle',                     label: '役職' },
  { key: 'freeTitle',                    label: 'フリータイトル' },
  { key: 'secondmentDestCompany',        label: '出向先会社' },
  { key: 'workLocation',                 label: '勤務場所' },
  { key: 'costCenter',                   label: 'コストセンター' },
  { key: 'managerPositionCode',          label: '上司ポジションコード' },
  { key: 'managerName',                  label: '上司氏名' },
  { key: 'jobFamily',                    label: 'ジョブファミリー' },
  { key: 'jobType',                      label: 'ジョブタイプ' },
  { key: 'positionBand',                 label: 'ポジションのバンド' },
  { key: 'individualBand',              label: 'バンド' },
  { key: 'salaryGrade',                  label: '給与等級' },
  { key: 'isTrainingPosition',           label: '業務研修PF' },
  { key: 'isNonUnionAgreement',          label: '非組合協定対象' },
  { key: 'isUnionPosition',             label: 'PF組合員FG' },
  { key: 'isUnionMember',               label: '組合員' },
  { key: 'isDiscretionaryLaborPosition', label: 'PF裁量労働FG' },
  { key: 'isDiscretionaryLabor',        label: '裁量労働対象' },
]

function boolCell(v: unknown): string {
  if (v === true) return '○'
  if (v === false || v === null || v === undefined) return ''
  return String(v)
}

function snapRow(snap: PositionSnapshot | null): (string | number | boolean | undefined)[] {
  if (!snap) return SNAPSHOT_FIELDS.map(() => '')
  return SNAPSHOT_FIELDS.map(f => {
    const v = snap[f.key]
    if (typeof v === 'boolean') return boolCell(v)
    return v ?? ''
  })
}

// ── Export ──────────────────────────────────────────────────────────────────

export function exportToXlsx(rows: ExcelRow[], effectiveDate: string): void {
  const N = SNAPSHOT_FIELDS.length

  // Group header row (merged visually via colspan — xlsx doesn't support colspan in aoa, we just label the first)
  const groupRow = [
    '本人情報', '', '', '', '変更区分', '', '',
    'After（発令後）', ...Array(N - 1).fill(''),
    'Before（発令前）', ...Array(N - 1).fill(''),
  ]

  // Column name row
  const colRow = [
    '社員ID', '会社ID', '会社名', '姓', '名', '申請区分', 'メモ', '昇降格',
    ...SNAPSHOT_FIELDS.map(f => `After_${f.label}`),
    ...SNAPSHOT_FIELDS.map(f => `Before_${f.label}`),
  ]

  const dataRows = rows.map(row => [
    row.sfPersonId ?? '',
    row.companyId,
    row.companyName,
    row.lastName,
    row.firstName,
    row.transferReason ?? row.operationType,
    row.memo ?? '',
    row.promotionSign ? '○' : '',
    ...snapRow(row.after),
    ...snapRow(row.before),
  ])

  const ws = XLSX.utils.aoa_to_sheet([groupRow, colRow, ...dataRows])

  // Column widths
  ws['!cols'] = [
    { wch: 10 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 8 },
    { wch: 12 }, { wch: 20 }, { wch: 6 },
    ...Array(N * 2).fill({ wch: 14 }),
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '発令一覧')
  XLSX.writeFile(wb, `発令一覧_${effectiveDate}.xlsx`)
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface ImportedRow {
  sfPersonId?: string
  companyId?: string
  companyName: string
  lastName: string
  firstName: string
  before: Partial<PositionSnapshot>
  after: Partial<PositionSnapshot>
}

export interface ImportResult {
  rows: ImportedRow[]
  error?: string
}

export async function parseXlsx(file: File): Promise<ImportResult> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = e.target?.result
        if (!data) return resolve({ rows: [], error: 'ファイルの読み込みに失敗しました' })
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

        // Find the column header row (contains '社員ID' or 'After_' prefix)
        const headerRowIdx = raw.findIndex(row =>
          row.some(cell => typeof cell === 'string' && (cell === '社員ID' || cell.startsWith('After_')))
        )
        if (headerRowIdx < 0) {
          return resolve({ rows: [], error: 'ヘッダー行が見つかりません。このアプリでエクスポートしたExcelを使用してください。' })
        }

        const headers = raw[headerRowIdx] as string[]
        const colIdx = (name: string) => headers.findIndex(h => h === name)

        const iSfId    = colIdx('社員ID')
        const iCompId  = colIdx('会社ID')
        const iCompNm  = colIdx('会社名')
        const iLast    = colIdx('姓')
        const iFirst   = colIdx('名')

        // Map snapshot field indices
        const afterIdx  = SNAPSHOT_FIELDS.map(f => colIdx(`After_${f.label}`))
        const beforeIdx = SNAPSHOT_FIELDS.map(f => colIdx(`Before_${f.label}`))

        const parseSnap = (row: string[], indices: number[]): Partial<PositionSnapshot> => {
          const snap: Record<string, unknown> = {}
          SNAPSHOT_FIELDS.forEach((f, i) => {
            const ci = indices[i]
            if (ci < 0 || ci >= row.length) return
            const raw = row[ci]
            if (raw === '' || raw === null || raw === undefined) return
            if (f.key === 'isOnLeave' || f.key === 'isTrainingPosition' ||
                f.key === 'isNonUnionAgreement' || f.key === 'isUnionPosition' ||
                f.key === 'isUnionMember' || f.key === 'isDiscretionaryLaborPosition' ||
                f.key === 'isDiscretionaryLabor') {
              snap[f.key] = raw === '○' || raw === 'true' || String(raw) === 'true'
            } else {
              snap[f.key] = String(raw)
            }
          })
          return snap as Partial<PositionSnapshot>
        }

        const rows: ImportedRow[] = []
        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const row = raw[i] as string[]
          if (row.every(c => c === '' || c === null || c === undefined)) continue
          rows.push({
            sfPersonId: iSfId >= 0 ? String(row[iSfId] ?? '').trim() || undefined : undefined,
            companyId:  iCompId >= 0 ? String(row[iCompId] ?? '').trim() || undefined : undefined,
            companyName: iCompNm >= 0 ? String(row[iCompNm] ?? '') : '',
            lastName:   iLast >= 0 ? String(row[iLast] ?? '') : '',
            firstName:  iFirst >= 0 ? String(row[iFirst] ?? '') : '',
            before: parseSnap(row, beforeIdx),
            after:  parseSnap(row, afterIdx),
          })
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

// ── Build base state from import rows ────────────────────────────────────────

export interface BaseStateFromImport {
  persons: Person[]
  companies: Company[]
  organizations: Organization[]
  affiliations: Affiliation[]
  positions: Position[]
  skippedRows: number
}

export function buildBaseState(
  importedRows: ImportedRow[],
  existingPersons: Person[],
  existingCompanies: Company[],
  existingOrgs: Organization[],
): BaseStateFromImport {
  const persons    = [...existingPersons]
  const companies  = [...existingCompanies]
  const orgs       = [...existingOrgs]
  const affiliations: Affiliation[] = []
  const positions:   Position[]    = []
  let skippedRows = 0

  for (const row of importedRows) {
    const snap = Object.keys(row.after).length > 0 ? row.after : row.before
    if (!snap) { skippedRows++; continue }

    // Match or create person
    let person = row.sfPersonId
      ? existingPersons.find(p => p.sfPersonId === row.sfPersonId)
      : existingPersons.find(p => p.name === `${row.lastName} ${row.firstName}`.trim())

    if (!person) {
      const newId = `imported_p_${Date.now()}_${persons.length}`
      person = { id: newId, name: `${row.lastName} ${row.firstName}`.trim(), sfPersonId: row.sfPersonId }
      persons.push(person)
    }

    // Match or create company
    let company = row.companyId
      ? existingCompanies.find(c => c.id === row.companyId)
      : existingCompanies.find(c => c.name === row.companyName)
    if (!company && row.companyName) {
      const newId = row.companyId ?? `imported_c_${companies.length}`
      company = { id: newId, name: row.companyName, hasSF: true }
      companies.push(company)
    }
    if (!company) { skippedRows++; continue }

    // Match org by orgCode (= our org.id)
    const orgId = snap.orgCode
    const org   = orgId ? existingOrgs.find(o => o.id === orgId) : undefined

    // Create position
    const posId = `imported_pos_${person.id}_${company.id}`
    const pos: Position = {
      id: posId,
      orgId:     org?.id ?? orgId ?? company.id,
      companyId: company.id,
      title:     snap.jobTitle,
      band:      snap.positionBand ?? snap.individualBand,
      isVacant:  false,
      sfPositionId: snap.positionCode,
      workLocation: snap.workLocation,
      costCenter:   snap.costCenter,
      jobFamily:    snap.jobFamily,
      jobType:      snap.jobType,
    }
    positions.push(pos)

    // Create affiliation
    const affId = `imported_aff_${person.id}_${company.id}`
    const aff: Affiliation = {
      id: affId,
      personId: person.id,
      positionId: posId,
      type: snap.concurrentType === '兼務' ? 'concurrent' : 'primary',
      status: 'active',
      startDate: '2000-01-01',
      employmentType:   snap.employmentType,
      concurrentReason: snap.concurrentReason,
      individualBand:   snap.individualBand,
      salaryGrade:      snap.salaryGrade,
      freeTitle:        snap.freeTitle,
      isOnLeave:        snap.isOnLeave,
    }
    affiliations.push(aff)

    // Add org if not found (minimal placeholder)
    if (orgId && !orgs.find(o => o.id === orgId)) {
      orgs.push({
        id: orgId, name: orgId, companyId: company.id,
        parentId: null, level: 2,
      })
    }
  }

  return { persons, companies, organizations: orgs, affiliations, positions, skippedRows }
}
