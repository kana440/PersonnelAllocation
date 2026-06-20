import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { Organization }  from '@personnel/domain/schemas'
import { MASTER_LABELS }   from '../../infrastructure/masters/parser'

export type TableKey = keyof AllMasters | 'beforeOrgs' | 'afterOrgs'

export interface TableDef {
  key:   TableKey
  label: string
  group: string
}

export const TABLE_REGISTRY: TableDef[] = [
  { key: 'beforeOrgs',              label: '旧組織CD一覧', group: '組織' },
  { key: 'afterOrgs',               label: '組織CD一覧（新）', group: '組織' },
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
]

export const FIELD_LABELS: Record<string, string> = {
  code:                          'コード',
  label:                         'ラベル',
  name:                          '名称',
  phase:                         'フェーズ',
  companyCode:                   '会社コード',
  parentCode:                    '上位組織コード',
  company:                       '会社名',
  businessUnit:                  '関係部門',
  division:                      '部門',
  department:                    '統括部',
  group:                         'グループ',
  team:                          'チーム',
  orgCategory:             '組織レベル',
  costCenter:                    'コストセンター',
  workLocation:                  '勤務地',
  note:                          '備考',
  band:                          'バンド',
  compensationCategory:          '報酬区分',
  jobFamilyCode:                 '職種コード',
  promotionDemotionBand:         '昇降格読替バンド',
  promotionDemotionWarningLevel: '昇降格Warnレベル',
  isDiscretionaryTarget:         '裁量対象',
  isSecondmentAcceptance:         '出向受入',
  isRegularEmployee:                    '社員',
  isConcurrentSecondmentAcceptance: '兼務出向受入',
  isExtendedEmployee:         '雇用延長',
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

export function getTableData(
  key: TableKey,
  masters: AllMasters,
  beforeOrgs: Organization[],
  afterOrgs:  Organization[],
): Record<string, unknown>[] {
  if (key === 'beforeOrgs') return beforeOrgs as unknown as Record<string, unknown>[]
  if (key === 'afterOrgs')  return afterOrgs  as unknown as Record<string, unknown>[]
  return (masters[key] as unknown as Record<string, unknown>[]) ?? []
}
