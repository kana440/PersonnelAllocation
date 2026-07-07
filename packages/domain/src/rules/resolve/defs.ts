import type { AllocationRow } from '../../allocationRow'
import type { ValidationResolutionDef } from './types'
import type { ValidationIssue } from '../validate/types'

/** field が一致する error/warning を修正するシンプルな ResolutionDef を生成する */
function fieldDef(
  id:          string,
  field:       keyof AllocationRow,
  shortLabel:  string,
  level:       'error' | 'warning' = 'error',
  label?:      string,
): ValidationResolutionDef {
  return {
    id,
    field,
    shortLabel,
    level,
    label,
    match(issue: ValidationIssue) {
      return issue.field === field && issue.level === level
    },
    patch(_row, values) {
      return values
    },
  }
}

// ── フィールドごとの解決定義 ─────────────────────────────────────────────────

export const RESOLUTION_DEFS: ValidationResolutionDef[] = [

  // バンド
  fieldDef('band-error',        'band',               'バンド',   'error', 'バンド'),
  fieldDef('band-warning',      'band',               'バンド注意', 'warning', 'バンド'),

  // 給与等級
  fieldDef('payGrade-error',    'payGrade',           '給与等級', 'error', '給与等級'),
  fieldDef('payGrade-warning',  'payGrade',           '等級注意', 'warning', '給与等級'),

  // ポジション_バンド
  fieldDef('positionBand-error', 'positionBand',      'Pos_Band', 'error', 'ポジション_バンド'),

  // 役職
  fieldDef('officialPos-error', 'officialPositionCode', '役職', 'error', '役職'),
  {
    id:         'officialPos-secondment',
    field:      'officialPositionCode',
    shortLabel: '役職(出向)',
    level:      'warning',
    label:      '出向者役職',
    // suggestValue は issue.suggestedPatch で代替されるため不要
    match(issue) {
      return issue.id === 'field_constraint_conditional'
        && issue.field === 'officialPositionCode'
    },
    patch(_row, values) { return values },
  },

  // 雇用タイプ
  fieldDef('employmentType-error', 'employmentType', '雇用型', 'error', '雇用タイプ'),

  // ジョブファミリー
  fieldDef('jobFamily-error',   'jobFamily',          'JFam', 'error', 'ジョブファミリー'),

  // ジョブタイプ
  fieldDef('jobType-error',     'jobType',            'JType', 'error', 'ジョブタイプ'),

  // 勤務場所
  fieldDef('location-error',    'location',           '勤務場所', 'error', '勤務場所'),
  {
    id:         'location-secondment',
    field:      'location',
    shortLabel: '場所(出向)',
    level:      'warning',
    label:      '出向勤務場所',
    // suggestValue は issue.suggestedPatch で代替されるため不要
    match(issue) {
      return issue.id === 'field_constraint_conditional'
        && issue.field === 'location'
    },
    patch(_row, values) { return values },
  },

  // 組織コード
  fieldDef('deptCode-error',    'departmentCode',     '組織CD', 'error', '組織コード'),

  // 労働組合員
  fieldDef('unionFlag-error',   'unionFlag',          '組合員', 'error', '労働組合員'),
  fieldDef('posUnionFlag-error','positionUnionFlag',  'Pos組合', 'error', 'ポジション_労働組合員'),

  // 裁量労働
  fieldDef('discretionary-error', 'discretionaryWorkFlag', '裁量労働', 'error', '裁量労働区分'),
  fieldDef('posDiscretionary-error', 'positionDiscretionaryWorkFlag', 'Pos裁量', 'error', 'ポジション_裁量労働区分'),

  // 本務兼務区分
  fieldDef('concurrentType-error', 'concurrentType', '兼務区分', 'error', '本務兼務区分'),

  // 兼務理由
  fieldDef('concurrentReason-error', 'concurrentReason', '兼務理由', 'error', '兼務理由'),

  // 業務研修ポジション
  fieldDef('trainingPos-error', 'trainingPositionFlag', '研修Pos', 'error', '業務研修ポジション'),

  // 異動事由（推奨値なので warning 相当だが、必須チェックで error になる場合も）
  fieldDef('transferReason-error', 'transferReason', '異動事由', 'error', '異動事由'),

  // 上司ポジションコード警告
  {
    id:         'managerPosCode-warning',
    field:      'managerPositionCode',
    shortLabel: '上司Pos',
    level:      'warning',
    label:      '上司ポジションコード',
    match(issue) {
      return issue.field === 'managerPositionCode' && issue.level === 'warning'
    },
    patch(_row, values) { return values },
  },

  // ポジションコード昇降格未更新 警告
  {
    id:         'positionCode-bandchange',
    field:      'positionCode',
    shortLabel: 'Pos未更新',
    level:      'warning',
    label:      'ポジションコード',
    match(issue) {
      return issue.field === 'positionCode' && issue.level === 'warning'
    },
    patch(_row, values) { return values },
  },
]
