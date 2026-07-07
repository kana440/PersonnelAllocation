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
  | 'conditional'  // 条件付き制約（C4/F系）
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
    description:    '異動事由が未入力です。全行に必須の項目です。',
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
    description:    'ポジションコードが設定されているのに必須属性（組織コード・役職・勤務場所・上司ポジションコード等）が未入力です。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_user_conditional',
    match:          i => i.message.startsWith('ユーザーIDが入力されている場合'),
    chipLabel:      'UID条件必須',
    description:    'ユーザーIDが入力されているのに必須の人属性（グループ社員ID・氏名・雇用タイプ・バンド等）が未入力です。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_secondment_to',
    match:          i => i.message === '出向者用組織の場合、出向先会社は必須です',
    chipLabel:      '出向先必須',
    description:    '出向者用組織に所属しているのに出向先会社が未入力です。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_secondment_from',
    match:          i => i.message.startsWith('出向受入の場合、出向元'),
    chipLabel:      '出向元必須',
    description:    '出向受入の雇用タイプなのに出向元会社・出向元社員番号が未入力です。',
    level:          'error',
    group:          'required',
    defaultVisible: true,
  },
  {
    id:             'required_concurrent_reason',
    match:          i => i.message === '兼務チェックサインが設定されている場合、兼務理由は必須です',
    chipLabel:      '兼務理由必須',
    description:    '兼務チェックサインが設定されているのに兼務理由が未入力です。',
    level:          'error',
    group:          'required',
    defaultVisible: false,
  },
  {
    id:             'required_free_title',
    match:          i => i.message === 'フリータイトル対象の役職の場合、フリータイトルは必須です',
    chipLabel:      'FT必須',
    description:    'フリータイトル対象の役職なのにフリータイトルが未入力です。',
    level:          'error',
    group:          'required',
    defaultVisible: false,
  },

  // ── 書式 (format) ────────────────────────────────────────────────────────────
  {
    id:             'format_employee_number',
    match:          i => i.message === '社員番号は7桁の半角数字で入力してください',
    chipLabel:      '社員番号形式',
    description:    '社員番号が7桁の半角数字形式ではありません。',
    level:          'error',
    group:          'format',
    defaultVisible: true,
  },
  {
    id:             'format_position_code',
    match:          i => i.message.startsWith('ポジションコードは「P」'),
    chipLabel:      'POS形式',
    description:    'ポジションコードが「P」+ 8桁半角数字の形式ではありません。',
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
    description:    'ユーザーIDに半角数字以外の文字が含まれています。',
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
    description:    '非組合協定対象者フラグが設定されているのに労働組合員区分が「非組合員」になっていません。',
    level:          'error',
    group:          'consistency',
    defaultVisible: false,
  },
  {
    id:             'consistency_secondment_org',
    match:          i => i.message === '出向先会社が入力されている場合、組織コードは出向者用組織を選択してください',
    chipLabel:      '出向組織',
    description:    '出向先会社が設定されているのに所属組織が出向者用組織になっていません。',
    level:          'error',
    group:          'consistency',
    defaultVisible: true,
  },
  {
    id:             'consistency_dept_options',
    match:          i => i.message === '組織コードは有効な選択肢から選択してください',
    chipLabel:      '組織コード値',
    description:    '組織コードが新組織マスタに存在しません。廃止・改称された組織コードの可能性があります。',
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
  // ── 条件付き制約（C4 / F1〜F4 / union / discretionary）────────────────────────

  // C4: 出向先会社設定時
  {
    id:             'c4_officialPosition',
    match:          i => i.id === 'c4_officialPosition',
    chipLabel:      '役職（出向時）',
    description:    '出向先会社が設定されているとき、役職は「出向者」を選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },
  {
    id:             'c4_location',
    match:          i => i.id === 'c4_location',
    chipLabel:      '勤務場所（出向時）',
    description:    '出向先会社が設定されているとき、勤務場所は「出向」を選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },

  // F1: 出向受入の雇用タイプ
  {
    id:             'f1_employmentType',
    match:          i => i.id === 'f1_employmentType',
    chipLabel:      '雇用T（出向受入）',
    description:    '出向元会社が設定されているとき（本務受入）、雇用タイプは出向受入対応の選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },
  {
    id:             'f1_band',
    match:          i => i.id === 'f1_band',
    chipLabel:      'バンド（出向受入）',
    description:    '出向受入の雇用タイプのとき、バンドは出向受入に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },
  {
    id:             'f1_payGrade',
    match:          i => i.id === 'f1_payGrade',
    chipLabel:      '等級（出向受入）',
    description:    '出向受入の雇用タイプのとき、給与等級は出向受入に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },

  // F2: 社員（userId === groupEmployeeId）
  {
    id:             'f2_band',
    match:          i => i.id === 'f2_band',
    chipLabel:      'バンド（社員）',
    description:    '社員（グループ社員ID＝ユーザーID）のとき、バンドは社員に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },
  {
    id:             'f2_positionBand',
    match:          i => i.id === 'f2_positionBand',
    chipLabel:      'POS_B（社員）',
    description:    '社員のとき、ポジション_バンドは社員に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },
  {
    id:             'f2_payGrade',
    match:          i => i.id === 'f2_payGrade',
    chipLabel:      '等級（社員）',
    description:    '社員のとき、給与等級はバンド・ジョブタイプに対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },

  // F3: 雇用延長
  {
    id:             'f3_band',
    match:          i => i.id === 'f3_band',
    chipLabel:      'バンド（延長）',
    description:    '雇用延長の雇用タイプのとき、バンドは雇用延長に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },
  {
    id:             'f3_positionBand',
    match:          i => i.id === 'f3_positionBand',
    chipLabel:      'POS_B（延長）',
    description:    '雇用延長の雇用タイプのとき、ポジション_バンドは雇用延長に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },
  {
    id:             'f3_payGrade',
    match:          i => i.id === 'f3_payGrade',
    chipLabel:      '等級（延長）',
    description:    '雇用延長の雇用タイプのとき、給与等級は雇用延長に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: true,
  },

  // F4: 兼務チェックサイン
  {
    id:             'f4_payGrade',
    match:          i => i.id === 'f4_payGrade',
    chipLabel:      '等級（兼務）',
    description:    '兼務チェックサインが立っているとき、給与等級は兼務に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'f4_leaveOfAbsence',
    match:          i => i.id === 'f4_leaveOfAbsence',
    chipLabel:      '休職（兼務）',
    description:    '兼務の場合、休職フラグは設定できません。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },

  // 組合員フラグ（条件付き）
  {
    id:             'f_posUnionFlag_f1f2',
    match:          i => i.id === 'f_posUnionFlag_f1f2',
    chipLabel:      'POS組合員（出/社）',
    description:    '出向受入または社員のとき、ポジション_労働組合員はポジション_バンドに応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'f_posUnionFlag_f3',
    match:          i => i.id === 'f_posUnionFlag_f3',
    chipLabel:      'POS組合員（延長）',
    description:    '雇用延長のとき、ポジション_労働組合員はポジション_バンドに応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'f_unionFlag_f1',
    match:          i => i.id === 'f_unionFlag_f1',
    chipLabel:      '組合員（出向受入）',
    description:    '出向受入の雇用タイプのとき、労働組合員は「非組合員」にしてください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'f_unionFlag_f2',
    match:          i => i.id === 'f_unionFlag_f2',
    chipLabel:      '組合員（社員）',
    description:    '社員のとき、労働組合員はバンドに応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'f_unionFlag_f3',
    match:          i => i.id === 'f_unionFlag_f3',
    chipLabel:      '組合員（延長）',
    description:    '雇用延長のとき、労働組合員はバンドに応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },

  // 裁量労働区分（条件付き）
  {
    id:             'd_positionBand',
    match:          i => i.id === 'd_positionBand',
    chipLabel:      'POS_B（裁量）',
    description:    'ポジション_裁量労働対象が「はい」のとき、ポジション_バンドは裁量対象に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'd_jobFamily',
    match:          i => i.id === 'd_jobFamily',
    chipLabel:      'JF（裁量）',
    description:    'ポジション_裁量労働対象が「はい」のとき、ジョブファミリーは裁量対象に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'd_jobType',
    match:          i => i.id === 'd_jobType',
    chipLabel:      'JT（裁量）',
    description:    'ポジション_裁量労働対象が「はい」のとき、ジョブタイプは裁量対象に対応する選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'd_posDisc_f1',
    match:          i => i.id === 'd_posDisc_f1',
    chipLabel:      'POS裁量（出向受入）',
    description:    '出向受入のとき、ポジション_裁量労働対象は役職・ジョブタイプ・出向元会社に応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'd_posDisc_f23',
    match:          i => i.id === 'd_posDisc_f23',
    chipLabel:      'POS裁量（社員/延長）',
    description:    '社員または雇用延長のとき、ポジション_裁量労働対象はポジション_バンド・ジョブタイプに応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'd_disc_f1',
    match:          i => i.id === 'd_disc_f1',
    chipLabel:      '裁量対象（出向受入）',
    description:    '出向受入のとき、裁量労働対象は役職・ジョブタイプ・出向元会社に応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },
  {
    id:             'd_disc_f23',
    match:          i => i.id === 'd_disc_f23',
    chipLabel:      '裁量対象（社員/延長）',
    description:    '社員または雇用延長のとき、裁量労働対象はバンド・ジョブタイプに応じた有効な選択肢から選択してください。',
    level:          'warning',
    group:          'conditional',
    defaultVisible: false,
  },

  {
    id:             'field_constraint',
    match:          i => i.message.includes('有効な選択肢から選択してください') || i.message.includes('無効な値が入力されています'),
    chipLabel:      'リスト外',
    description:    'バンド・役職・給与等級・勤務場所・雇用タイプ・ジョブファミリー・組合員区分・裁量労働区分等のコードリスト外の値が入力されています。問題チップはフィールド名（「バンド」「役職」等）で表示されます。',
    level:          'warning',
    group:          'consistency',
    defaultVisible: true,
  },
  {
    id:             'field_constraint_conditional',
    match:          i => i.message.includes('雇用タイプに対応する選択肢') || (i.message.includes('が入力されている場合') && i.message.includes('選択してください')) || i.message.includes('出向受入対応の雇用タイプ'),
    chipLabel:      '条件制約',
    description:    '条件に応じた制約違反（出向先会社設定時の役職・勤務場所制限、雇用タイプ別バンド・給与等級制限等）。',
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
    description:    '上司ポジションコードに自分自身が設定されています。',
    level:          'error',
    group:          'interRow',
    defaultVisible: true,
  },
  {
    id:             'interrow_manager_circular',
    match:          i => i.message === '配下のポジションを上司に設定できません（循環参照）',
    chipLabel:      '上司循環参照',
    description:    '上司ポジションをたどると循環参照が発生しています。',
    level:          'error',
    group:          'interRow',
    defaultVisible: true,
  },
  {
    id:             'interrow_pos_duplicate',
    match:          i => i.message.startsWith('ポジションコード') && i.message.includes('重複'),
    chipLabel:      'POS重複',
    description:    '同一ポジションコードが複数行に設定されています（兼務行を除く）。',
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
