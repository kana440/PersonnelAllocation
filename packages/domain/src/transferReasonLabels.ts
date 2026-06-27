/** transferReason マスタの業務上重要な文字列定数。マスタ表記が変わったらここだけ更新する。 */
export const TR = {
  // 個別対応系（人操作）
  LEAVE_AND_RETURN:  '【個別対応】4/1付休職・復職',
  TRANSFER:          '【個別】4/1付移籍',
  // 個別対応系（雇用）
  EMPLOYMENT_EXTENSION_PROCEDURE: '【個別対応】3月末雇用延長手続対象者（新規・更新）',
  EMPLOYMENT_TYPE_CHANGE_PROCEDURE: '【個別対応】従業員区分変更（社員⇔社員B・嘱託など）',
  // 対応なし系
  TERMINATION: '【対応なし】3月末までに退職／解任済み',
  NO_CHANGE:   '【対応なし】変更なし',
  // 組織・ポジション
  ORG_TRANSFER:    '社内異動',
  ORG_RESTRUCTURE: '組織改変',
  MANAGER_CHANGE:       '上司変更',
  NEW_POSITION:         'ポジションのみ新設・更新',
  EXECUTIVE_APPOINTMENT: '役員就任',
  // 分掌移動（組織改変に伴う異動事由）
  DIV_TRANSFER:            '分掌移動',
  DIV_TRANSFER_REFORM:     '分掌移動（改組）',
  DIV_TRANSFER_RESTRUCTURE: '分掌移動（組改）',

  CONCURRENT:     '兼務追加',
  // 雇用区分変更（出向受入）
  SECONDMENT_ACCEPTANCE_MODE_SWITCH: '従業員区分変更（出向受入⇔兼務出向受入）',
  // 職務分類
  PROMOTION:            '昇格',
  DEMOTION:             '降格',
  TITLE_CHANGE:         '役職変更',
  EMPLOYMENT_EXTENSION: '雇用延長',
  // 本務出向
  SECONDMENT_OUT:         '本務出向',
  SECONDMENT_IN:          '本務出向受入',
  SECONDMENT_OUT_RELEASE: '本務出向解除（社内復帰）',
  // 社内兼務解除・本務出向受入解除に共通するマスタ値（concurrentRelease と secondmentInRelease で共用）
  CONCURRENT_OR_SECONDMENT_IN_RELEASE: '社内兼務解除、兼務出向解除、出向受入・兼務出向受入解除',
  // 兼務出向
  CONCURRENT_SECONDMENT_OUT:         '兼務出向',
  CONCURRENT_SECONDMENT_IN:          '兼務出向受入',
  CONCURRENT_SECONDMENT_OUT_RELEASE: '兼務出向解除',
  CONCURRENT_SECONDMENT_IN_RELEASE:  '兼務出向受入解除',
} as const
