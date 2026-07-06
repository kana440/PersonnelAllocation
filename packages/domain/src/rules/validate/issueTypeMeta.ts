/**
 * issueTypeMeta.ts — 問題種別のメタデータ定義
 *
 * EditPatternMeta と対称的な構造。
 * ValidationIssue はメッセージ文字列のみで種別を持たないため、
 * match() 関数で問題種別を後解決する。
 *
 * chipLabel  : EditPatternMeta.chipLabel と同じ役割（チップ・短縮ラベル）
 * description: EditPatternMeta.description と同じ役割（発生条件の説明）
 * group      : EditPatternMeta.group と同じ役割（分類グループ）
 * defaultVisible: 標準プリセットでの初期表示
 */

import type { ValidationIssue } from './types'

export type IssueGroup =
  | 'required'     // 必須項目（A系）
  | 'format'       // 書式（B系）
  | 'consistency'  // マスタ整合性（C/D系）
  | 'interRow'     // 行間バリデーション（E/G系）
  | 'warning'      // ワーニング（W系）

export interface IssueTypeMeta {
  id:             string
  /** ValidationIssue がこの種別に該当するか判定する */
  match:          (issue: ValidationIssue) => boolean
  /** チップ表示用の短縮ラベル（EditPatternMeta.chipLabel と同じ役割） */
  chipLabel:      string
  /** 発生条件の説明（EditPatternMeta.description と同じ役割） */
  description:    string
  level:          'error' | 'warning' | 'either'
  group:          IssueGroup
  /** 標準プリセットでの初期表示 */
  defaultVisible: boolean
}

// ── 定義 ──────────────────────────────────────────────────────────────────────

export const ISSUE_TYPE_METAS: IssueTypeMeta[] = [

  // ── 必須 (required) ─────────────────────────────────────────────────────────
  {
    id:             'required_transfer_reason',
    match:          i => i.message === '申請区分（異動事由）は必須です',
    chipLabel:      '異動事由必須',
    description:    'transferReason が未設定。全行に必須。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_position_attrs',
    match:          i => i.message.endsWith('は必須です')
                      && !i.message.startsWith('申請区分')
                      && !i.message.startsWith('ユーザーID'),
    chipLabel:      'POS属性必須',
    description:    'positionCode あり時に必須なポジション属性フィールド（組織コード・役職・勤務場所・上司Pos等）が未設定。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_user_conditional',
    match:          i => i.message.startsWith('ユーザーIDが入力されている場合'),
    chipLabel:      'UID条件必須',
    description:    'userId あり時に必須な人属性フィールド（グループ社員ID・姓名・雇用タイプ・バンド等）が未設定。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_secondment_to',
    match:          i => i.message === '出向者用組織の場合、出向先会社は必須です',
    chipLabel:      '出向先必須',
    description:    '組織カテゴリが「出向者用組織」のとき secondmentToCompany が未設定。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_secondment_from',
    match:          i => i.message.startsWith('出向受入の場合、出向元'),
    chipLabel:      '出向元必須',
    description:    '雇用タイプが出向受入のとき secondmentFromCompany / secondmentFromEmployeeNumber が未設定。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_concurrent_reason',
    match:          i => i.message === '兼務チェックサインが設定されている場合、兼務理由は必須です',
    chipLabel:      '兼務理由必須',
    description:    '異動事由の concurrentCheckSign が true のとき concurrentReason が未設定。',
    level:          'error',
    group:          'required',
    defaultVisible: false,
  },
  {
    id:             'required_free_title',
    match:          i => i.message === 'フリータイトル対象の役職の場合、フリータイトルは必須です',
    chipLabel:      'FT必須',
    description:    '役職の requiresFreeTitle が true のとき localJobTitle が未設定。',
    level:          'error',
    group:          'required',
    defaultVisible: false,
  },

  // ── 書式 (format) ────────────────────────────────────────────────────────────
  {
    id:             'format_employee_number',
    match:          i => i.message === '社員番号は7桁の半角数字で入力してください',
    chipLabel:      '社員番号形式',
    description:    'employeeNumber が7桁の半角数字形式でない。',
    level:          'error',
    group:          'format',
    defaultVisible: true,
  },
  {
    id:             'format_position_code',
    match:          i => i.message.startsWith('ポジションコードは「P」'),
    chipLabel:      'POS形式',
    description:    'positionCode が「P」+ 8桁半角数字形式でない（_pos_ 始まりの内部採番は対象外）。',
    level:          'error',
    group:          'format',
    defaultVisible: true,
  },
  {
    id:             'format_cost_center',
    match:          i => i.message.startsWith('コストセンターは'),
    chipLabel:      'CC形式',
    description:    'costCenter が「数字5桁-英数字7桁」の半角大文字形式でない。',
    level:          'error',
    group:          'format',
    defaultVisible: true,
  },
  {
    id:             'format_user_id',
    match:          i => i.message === 'ユーザーIDは半角数字で入力してください',
    chipLabel:      'UID形式',
    description:    'userId が半角数字のみでない。',
    level:          'error',
    group:          'format',
    defaultVisible: true,
  },

  // ── 整合性 (consistency) ─────────────────────────────────────────────────────
  {
    id:             'consistency_org_sub',
    match:          i => i.message.includes('が組織マスタの値と異なります'),
    chipLabel:      '組織値不一致',
    description:    '組織サブフィールド（事業本部・部門・統括部・グループ・チーム）が組織マスタの値と不一致。組織コード変更時に自動補完が必要。',
    level:          'error',
    group:          'consistency',
    defaultVisible: true,
  },
  {
    id:             'consistency_location_cc',
    match:          i => i.message.startsWith('勤務場所が組織マスタ') || i.message.startsWith('コストセンターが組織マスタ'),
    chipLabel:      '勤務場所CC不一致',
    description:    '勤務場所またはコストセンターが組織マスタの設定値と不一致。',
    level:          'error',
    group:          'consistency',
    defaultVisible: true,
  },
  {
    id:             'consistency_union',
    match:          i => i.message.startsWith('非組合協定対象者'),
    chipLabel:      '非組合設定',
    description:    'nonUnionAgreementFlag が true なのに positionUnionFlag または unionFlag が「非組合員」でない。',
    level:          'error',
    group:          'consistency',
    defaultVisible: false,
  },
  {
    id:             'consistency_secondment_org',
    match:          i => i.message === '出向先会社が入力されている場合、組織コードは出向者用組織を選択してください',
    chipLabel:      '出向組織',
    description:    'secondmentToCompany が設定されているのに departmentCode の組織カテゴリが「出向者用組織」でない。',
    level:          'error',
    group:          'consistency',
    defaultVisible: true,
  },
  {
    id:             'consistency_dept_options',
    match:          i => i.message === '組織コードは有効な選択肢から選択してください',
    chipLabel:      '組織コード値',
    description:    'departmentCode が afterOrganizations に存在しない。',
    level:          'error',
    group:          'consistency',
    defaultVisible: true,
  },
  {
    id:             'consistency_job_type',
    match:          i => i.message.startsWith('ジョブタイプは'),
    chipLabel:      'JT不一致',
    description:    'jobType が有効な選択肢にないか、選択中の jobFamily に属していない。',
    level:          'error',
    group:          'consistency',
    defaultVisible: false,
  },
  {
    id:             'field_constraint',
    match:          i => i.message.includes('有効な選択肢から選択してください') || i.message.includes('無効な値が入力されています'),
    chipLabel:      'リスト外',
    description:    'フィールド値がコードリストの有効な選択肢に含まれない（役職・バンド・勤務場所・雇用タイプ・組合員区分等）。FIELD_RULES の c() 由来。',
    level:          'warning',
    group:          'consistency',
    defaultVisible: true,
  },
  {
    id:             'field_constraint_conditional',
    match:          i => i.message.includes('雇用タイプに対応する選択肢') || (i.message.includes('が入力されている場合') && i.message.includes('選択してください')) || i.message.includes('出向受入対応の雇用タイプ'),
    chipLabel:      '条件制約',
    description:    '条件付き制約違反（出向先会社設定時の役職・勤務場所制限、雇用タイプ別バンド・給与等級制限等）。FIELD_RULES の c(…, when) 由来。',
    level:          'warning',
    group:          'consistency',
    defaultVisible: true,
  },

  // ── 行間 (interRow) ──────────────────────────────────────────────────────────
  {
    id:             'interrow_manager_missing',
    match:          i => i.message.startsWith('上司ポジションコード') && !i.message.includes('自分自身') && !i.message.includes('循環'),
    chipLabel:      '上司不在',
    description:    '上司ポジションコードがこのファイルに存在しない。別組織ファイルの管轄の場合は無視して良い。',
    level:          'warning',
    group:          'interRow',
    defaultVisible: true,
  },
  {
    id:             'interrow_manager_self',
    match:          i => i.message === '自分自身を上司ポジションに設定できません',
    chipLabel:      '上司自己参照',
    description:    'managerPositionCode が自分自身の positionCode と同じ。',
    level:          'error',
    group:          'interRow',
    defaultVisible: true,
  },
  {
    id:             'interrow_manager_circular',
    match:          i => i.message === '配下のポジションを上司に設定できません（循環参照）',
    chipLabel:      '上司循環参照',
    description:    'managerPositionCode をたどると循環が発生している。',
    level:          'error',
    group:          'interRow',
    defaultVisible: true,
  },
  {
    id:             'interrow_pos_duplicate',
    match:          i => i.message.startsWith('ポジションコード') && i.message.includes('重複'),
    chipLabel:      'POS重複',
    description:    '同一 positionCode が複数の行に設定されている（兼務行・内部採番は対象外）。',
    level:          'error',
    group:          'interRow',
    defaultVisible: true,
  },
  {
    id:             'interrow_promotion_no_pos',
    match:          i => i.message === '昇級・降級が検出されましたが、ポジションコードが変更されていません（新ポジションへの登録が必要です）',
    chipLabel:      '昇降格POS未変更',
    description:    '昇格または降格（同一組織内のバンド変更）が検出されたが positionCode が変更されていない。新ポジションへの登録が必要。',
    level:          'error',
    group:          'interRow',
    defaultVisible: true,
  },

  // ── ワーニング (warning) ─────────────────────────────────────────────────────
  {
    id:             'warning_two_step',
    match:          i => i.message === '２段階の昇降格が検出されました。問題ないか確認してください',
    chipLabel:      '2段昇降格',
    description:    'バンドが2段階以上変化している。意図的な場合は無視して良い。',
    level:          'warning',
    group:          'warning',
    defaultVisible: true,
  },
  {
    id:             'warning_manager_org',
    match:          i => i.message.includes('直系上位組織以外'),
    chipLabel:      '上司組織違',
    description:    '上司のポジションが当該行の組織の直系上位組織でない。クロス組織の上司関係を持つ場合は無視して良い。',
    level:          'warning',
    group:          'warning',
    defaultVisible: false,
  },
]

// ── ユーティリティ ────────────────────────────────────────────────────────────

const ISSUE_TYPE_META_BY_ID = new Map(ISSUE_TYPE_METAS.map(m => [m.id, m]))

/** ValidationIssue に対応する IssueTypeMeta を解決する。
 *  issue.id が付与されていれば O(1) Map ルックアップ。未付与（FIELD_RULES 由来等）は match() フォールバック。 */
export function resolveIssueMeta(issue: ValidationIssue): IssueTypeMeta | undefined {
  if (issue.id) return ISSUE_TYPE_META_BY_ID.get(issue.id)
  return ISSUE_TYPE_METAS.find(m => m.match(issue))
}
