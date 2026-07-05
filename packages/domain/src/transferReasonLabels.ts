/**
 * transferReason 定数の単一ソース。
 * TR.XXX は文字列として既存コードで使える（既存コード変更不要）。
 * TR_SHORT はバッジ表示用短縮ラベル（キー = label 文字列 = AllocationRow.transferReason の値）。
 */
const TR_DEFS = [
  // 分掌移動
  { key: 'DIV_TRANSFER',             label: '分掌異動',        short: '分掌異動' },
  { key: 'DIV_TRANSFER_RESTRUCTURE', label: '分掌異動（改組）', short: '分掌(改組)' },
  // 本務出向
  { key: 'SECONDMENT_OUT',         label: '本務出向',               short: '本務出向' },
  { key: 'SECONDMENT_IN',          label: '本務出向受入',           short: '出向受入' },
  { key: 'SECONDMENT_OUT_RELEASE', label: '本務出向解除（社内復帰）', short: '出向解除' },
  // 社内兼務解除・本務出向受入解除（共用マスタ値）
  { key: 'CONCURRENT_OR_SECONDMENT_IN_RELEASE', label: '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除', short: '兼務/出向解除' },
  // 兼務出向
  { key: 'CONCURRENT_SECONDMENT_OUT',         label: '兼務出向',         short: '兼務出向' },
  { key: 'CONCURRENT_SECONDMENT_IN',          label: '兼務出向受入',     short: '兼務出向受入' },
  { key: 'CONCURRENT_SECONDMENT_OUT_RELEASE', label: '兼務出向解除',     short: '兼務出向解除' },
  { key: 'CONCURRENT_SECONDMENT_IN_RELEASE',  label: '兼務出向受入解除', short: '兼務出向受入解除' },
  // 従業員区分・ポジション
  { key: 'SECONDMENT_ACCEPTANCE_MODE_SWITCH', label: '従業員区分変更（出向受入⇔兼務出向受入）', short: '出向受入区分変更' },
  { key: 'NEW_POSITION',          label: 'ポジションのみ新設・更新', short: 'Pos新設' },
  { key: 'EXECUTIVE_APPOINTMENT', label: '役員就任',                short: '役員就任' },
  // 対応なし
  { key: 'NO_CHANGE', label: '【対応なし】変更なし', short: '変更なし' },
  // 個別対応
  { key: 'TRANSFER',                         label: '【個別】4/1付移籍',                                  short: '移籍' },
  { key: 'EMPLOYMENT_EXTENSION_PROCEDURE',   label: '【個別対応】3月末雇用延長手続対象者（新規・更新）',   short: '雇用延長手続' },
  { key: 'LEAVE_AND_RETURN',                 label: '【個別対応】4/1付休職・復職',                        short: '休職・復職' },
  { key: 'EMPLOYMENT_TYPE_CHANGE_PROCEDURE', label: '【個別対応】従業員区分変更（社員⇔社員B・嘱託など）', short: '区分変更手続' },
  { key: 'TERMINATION',                      label: '【対応なし】3月末までに退職／解任済み',               short: '退職' },
  // 組織・ポジション（コード参照あり）
  { key: 'ORG_TRANSFER',    label: '社内異動',    short: '社内異動' },
  { key: 'MANAGER_CHANGE',  label: '上司変更',    short: '上司変更' },
  { key: 'CONCURRENT',      label: '兼務追加',    short: '兼務追加' },
  // 職務分類（コード参照あり）
  { key: 'PROMOTION',            label: '昇格',     short: '昇格' },
  { key: 'DEMOTION',             label: '降格',     short: '降格' },
  { key: 'TITLE_CHANGE',         label: '役職変更', short: '役職変更' },
  { key: 'EMPLOYMENT_EXTENSION', label: '雇用延長', short: '雇用延長' },
] as const satisfies ReadonlyArray<{ key: string; label: string; short: string }>

/** transferReason 文字列定数（パターン検出・比較用）。既存コードは変更不要。 */
export const TR = Object.fromEntries(TR_DEFS.map(d => [d.key, d.label])) as {
  readonly [K in typeof TR_DEFS[number]['key']]: string
}

/**
 * バッジ表示用短縮ラベル。キーは label 文字列（= AllocationRow.transferReason の値）。
 * 使用例: `TR_SHORT[row.transferReason as string] ?? row.transferReason`
 */
export const TR_SHORT: Readonly<Record<string, string>> = Object.fromEntries(
  TR_DEFS.map(d => [d.label, d.short])
)
