import type { AllCodeLists } from '../../domain/codeLists/aggregate'
import type { Organization }  from '../../domain/schemas'
import { CODE_LIST_LABELS }   from '../../infrastructure/codeLists/parser'

export type TableKey = keyof AllCodeLists | 'beforeOrgs' | 'afterOrgs'

export interface TableDef {
  key:   TableKey
  label: string
  group: string
}

export const TABLE_REGISTRY: TableDef[] = [
  { key: 'beforeOrgs',              label: '組織CD一覧（発令前）', group: '組織' },
  { key: 'afterOrgs',               label: '組織CD一覧（発令後）', group: '組織' },
  { key: 'companies',               label: CODE_LIST_LABELS.companies,               group: '組織' },
  { key: 'companyFilters',          label: CODE_LIST_LABELS.companyFilters,          group: '組織' },
  { key: 'employmentTypes',         label: CODE_LIST_LABELS.employmentTypes,         group: '雇用・給与' },
  { key: 'payGrades',               label: CODE_LIST_LABELS.payGrades,               group: '雇用・給与' },
  { key: 'jobLevels',               label: CODE_LIST_LABELS.jobLevels,               group: '雇用・給与' },
  { key: 'officialPositions',       label: CODE_LIST_LABELS.officialPositions,       group: '職位・勤務' },
  { key: 'workLocations',           label: CODE_LIST_LABELS.workLocations,           group: '職位・勤務' },
  { key: 'jobFamilies',             label: CODE_LIST_LABELS.jobFamilies,             group: '職務分類' },
  { key: 'subJobFamilies',          label: CODE_LIST_LABELS.subJobFamilies,          group: '職務分類' },
  { key: 'transferReasons',         label: CODE_LIST_LABELS.transferReasons,         group: '事由' },
  { key: 'concurrentReasons',       label: CODE_LIST_LABELS.concurrentReasons,       group: '事由' },
  { key: 'demotionReasons',         label: CODE_LIST_LABELS.demotionReasons,         group: '事由' },
  { key: 'trainingPositions',       label: CODE_LIST_LABELS.trainingPositions,       group: 'その他' },
  { key: 'discretionaryWorkOptions',label: CODE_LIST_LABELS.discretionaryWorkOptions,group: 'その他' },
]

export const FIELD_LABELS: Record<string, string> = {
  code:                          'コード',
  label:                         'ラベル',
  name:                          '名称',
  phase:                         'フェーズ',
  companyCode:                   '会社コード',
  parentCode:                    '上位組織コード',
  company:                       '会社名',
  businessUnit:                  'BU',
  division:                      '部門',
  department:                    '統括部',
  group:                         'グループ',
  team:                          'チーム',
  organizationLevel:             '組織レベル',
  CostCenter:                    'コストセンター',
  workLocation:                  '勤務地',
  note:                          '備考',
  band:                          'バンド',
  compensationCategory:          '報酬区分',
  jobFamilyCode:                 '職種コード',
  promotionDemotionBand:         '昇降格読替バンド',
  promotionDemotionWarningLevel: '昇降格Warnレベル',
  isDiscretionaryTarget:         '裁量対象',
  isOutsourceAcceptance:         '出向受入',
  isEmployee:                    '社員',
  isConcurrentOutsourceAcceptance: '兼務出向受入',
  isEmploymentExtension:         '雇用延長',
  isEmploymentExtensionPosition: '雇用延長(Pos)',
  isEmploymentExtensionJobClassification: '雇用延長(JC)',
  isEmployeeOrAcceptedUnionMember: '社員/受入組合員',
  isEmploymentExtensionUnionMember: '雇用延長組合員',
  isConcurrent:                  '兼務',
  isPayGradeChangeSign:          '給与等級変更',
  isFreeTitle:                   'フリータイトル',
  noCheckRequired:               'チェック不要',
  concurrentCheckSign:           '兼務チェック',
  noDiscretionaryVMAutoCreate:   '裁量VM自動作成なし',
}

export function getTableData(
  key: TableKey,
  codeLists: AllCodeLists,
  beforeOrgs: Organization[],
  afterOrgs:  Organization[],
): Record<string, unknown>[] {
  if (key === 'beforeOrgs') return beforeOrgs as unknown as Record<string, unknown>[]
  if (key === 'afterOrgs')  return afterOrgs  as unknown as Record<string, unknown>[]
  return (codeLists[key] as unknown as Record<string, unknown>[]) ?? []
}
