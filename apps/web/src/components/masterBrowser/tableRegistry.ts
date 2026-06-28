import type { AllMasters } from '@personnel/domain/masters/aggregate'
import { MASTER_LABELS }   from '../../infrastructure/masters/parser'

export type TableKey = keyof AllMasters | 'beforeOrgs' | 'afterOrgs'

export interface TableDef {
  key:   TableKey
  label: string
  group: string
}

export const TABLE_REGISTRY: TableDef[] = [
  { key: 'afterOrgs',               label: '組織CD一覧',   group: '組織' },
  { key: 'beforeOrgs',              label: '旧組織CD一覧', group: '組織' },
  { key: 'companies',               label: MASTER_LABELS.companies,               group: '組織' },
  { key: 'companyFilters',          label: MASTER_LABELS.companyFilters,          group: '組織' },
  { key: 'employmentTypes',         label: MASTER_LABELS.employmentTypes,         group: '雇用・給与' },
  { key: 'payGrades',               label: MASTER_LABELS.payGrades,               group: '雇用・給与' },
  { key: 'jobLevels',               label: MASTER_LABELS.jobLevels,               group: '雇用・給与' },
  { key: 'officialPositions',       label: MASTER_LABELS.officialPositions,       group: '職位・勤務' },
  { key: 'workLocations',           label: MASTER_LABELS.workLocations,           group: '職位・勤務' },
  { key: 'jobFamilies',             label: MASTER_LABELS.jobFamilies,             group: '職務分類' },
  { key: 'jobTypes',          label: MASTER_LABELS.jobTypes,          group: '職務分類' },
  { key: 'transferReasons',         label: MASTER_LABELS.transferReasons,         group: '事由' },
  { key: 'concurrentReasons',       label: MASTER_LABELS.concurrentReasons,       group: '事由' },
  { key: 'demotionReasons',         label: MASTER_LABELS.demotionReasons,         group: '事由' },
  { key: 'trainingPositions',       label: MASTER_LABELS.trainingPositions,       group: 'その他' },
  { key: 'discretionaryWorkOptions',label: MASTER_LABELS.discretionaryWorkOptions,group: 'その他' },
  { key: 'promotionMatrix',         label: MASTER_LABELS.promotionMatrix,         group: '昇降格' },
]

export const FIELD_LABELS: Record<string, string> = {
  code:                          'コード',
  label:                         'ラベル',
  name:                          '名称',
  phase:                         'フェーズ',
  companyCode:                   '会社コード',
  parentCode:                    '上位組織コード',
  company:                       '会社名',
  pathBusinessUnit:              '関係部門',
  pathDivision:                  '部門',
  pathDepartment:                '統括部',
  pathGroup:                     'グループ',
  pathTeam:                      'チーム',
  businessUnit:                  '関係部門',
  division:                      '部門',
  department:                    '統括部',
  group:                         'グループ',
  team:                          'チーム',
  orgCategory:                   '組織レベル',
  costCenter:                    'コストセンター',
  workLocation:                  '勤務場所',
  note:                          '備考',
  band:                          'バンド',
  compensationCategory:          '報酬区分',
  jobFamilyCode:                 '職種コード',
  promotionDemotionBand:         '昇降格読替バンド',
  promotionDemotionWarningLevel: '昇降格Warnレベル',
  jobLevel:                      '職務レベル',
  officialPosition:              '役職',
  jobClass:                      'M職P職',
  warningLevel:                  '昇降格Warnチェック',
  isDiscretionaryTarget:         '裁量対象',
  isSecondmentAcceptance: '出向受入',
  isRegularEmployee:      '社員',
  isExtendedEmployee:     '雇用延長',
  isExtendedEmployeePosition: '雇用延長(Pos)',
  isExtendedEmployeeJobClassification: '雇用延長(JC)',
  isRegularEmployeeOrSecondmentAcceptance: '社員/受入組合員',
  isExtendedEmployeeUnionMember: '雇用延長組合員',
  isConcurrent:                  '兼務',
  isPayGradeChange:          '給与等級変更',
  requiresFreeTitle:                   'フリータイトル',
  noCheckRequired:               'チェック不要',
  concurrentCheckSign:           '兼務チェック',
  noDiscretionaryVMAutoCreate:   '裁量VM自動作成なし',
  errorType:                     'エラータイプ',
}

const ORG_FIELDS = [
  'code', 'name', 'company', 'pathBusinessUnit', 'pathDivision', 'pathDepartment',
  'pathGroup', 'pathTeam', 'orgCategory', 'costCenter', 'workLocation', 'parentCode',
] as const

export function getTableData(
  key: TableKey,
  masters: AllMasters,
): Record<string, unknown>[] {
  if (key === 'beforeOrgs' || key === 'afterOrgs') {
    const phase = key === 'afterOrgs' ? 'after' : 'before'
    return (masters.orgMasterEntries ?? [])
      .filter(e => e.phase === phase)
      .map(e => Object.fromEntries(ORG_FIELDS.map(f => [f, (e as unknown as Record<string, unknown>)[f] ?? ''])))
  }
  return (masters[key] as unknown as Record<string, unknown>[]) ?? []
}
