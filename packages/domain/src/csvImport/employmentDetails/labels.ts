import type { FieldDef } from '../types'

// Array order = CSV column order.
export const EMPLOYMENT_DETAILS_IMPORT_FIELDS: FieldDef[] = [
  { key: '[OPERATOR]',                   en: 'Supported operators: Delimit, Clear and Delete', ja: 'サポートされる操作:範囲の限定、消去、削除' },
  { key: 'externalCode',                 en: 'Secondary Assignments.Person Id External',        ja: 'セカンダリ割当.外部個人ID' },
  { key: 'effectiveStartDate',           en: 'Secondary Assignments.Effective Start Date',      ja: 'セカンダリ割当.有効開始日' },
  { key: 'allSfProcesses.externalCode',  en: 'External Code',                                  ja: '外部コード' },
  { key: 'allSfProcesses.usersSysId',    en: 'Employment / User Id',                           ja: '雇用/ユーザーID' },
]

export const EMPLOYMENT_DETAILS_IMPORT_LABEL_MAP: Record<string, Omit<FieldDef, 'key'>> = Object.fromEntries(
  EMPLOYMENT_DETAILS_IMPORT_FIELDS.map(f => [f.key, { en: f.en, ja: f.ja }])
)
