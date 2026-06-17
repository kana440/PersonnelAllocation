/**
 * ツールの管理者向け説明。
 * LLM に渡す description（toolRegistry）とは別に、スキル手順を書くときの参照用。
 * 「何をもとに（入力データ）」「何をするか（出力・副作用）」の 2 フィールド。
 */
export interface ToolAdminMeta {
  basis:  string  // 何をもとに（入力・参照するデータ）
  action: string  // 何をするか（出力・副作用）
}

export const TOOL_ADMIN_META: Record<string, ToolAdminMeta> = {
  findPersons:                     { basis: '氏名・各種ID・subtreeOrgCode・filter',          action: '条件に合う従業員一覧を返す。subtreeOrgCode で組織配下を一括取得可（副作用なし）' },
  findOrgs:                        { basis: '組織名・コード・階層レベル（任意）',              action: '組織一覧を返す。descendantOrgCodes[] に配下の全 orgCode が含まれる（副作用なし）' },
  getPersonsDetail:                { basis: 'rowIds[]（findPersons の positions[].rowId）',   action: '指定行の全フィールド詳細を返す（副作用なし）' },
  getReviewSummary:                { basis: '現在の状態（引数なし）',                         action: '変更件数・エラー件数のサマリーを返す（副作用なし）' },
  getOrgTree:                      { basis: '起点組織コード（省略可）',                       action: '組織ツリーをウィジェット表示（副作用: UI表示）' },
  getChangedRows:                  { basis: 'kinds・氏名・ID・組織・limit/offset（全任意）', action: '変更のある行を種別・前後情報付きで絞り込み返す。ページング対応（副作用なし）' },
  getValidationIssues:             { basis: 'level（error/warning・任意）',                  action: 'バリデーション問題を1件ずつ一覧返す（副作用なし）' },
  findVacantPositions:             { basis: '組織コード（任意）',                             action: '空席ポジション一覧を返す（副作用なし）' },
  getValidationDiagnosis:          { basis: '現在の状態（引数なし）',                         action: 'バリデーション問題をフィールド別に集計し修正方法を返す（副作用なし）' },
  getFieldOptions:                 { basis: 'rowId・フィールド名',                            action: 'そのフィールドの有効選択肢を返す（副作用なし）' },
  undo:                            { basis: '（引数なし）',                                   action: '直前の操作を取り消す（副作用: 状態変更）' },
  show_org_members:                { basis: '組織コード',                                    action: 'メンバー一覧をウィジェット表示（副作用: UI表示）' },
  propose_bulk_transfer:           { basis: 'sourceOrgCode・targetOrgCode',                  action: '組織全体を一括異動提案 → 確認後に departmentCode を変更' },
  propose_field_edit:              { basis: 'userId・フィールド名・新しい値',                 action: 'フィールド変更を提案 → 確認後に1フィールドを変更' },
  propose_bulk_set_field:          { basis: 'rowIds・フィールド名・新しい値',                 action: '複数行の同一フィールドを一括変更提案 → 確認後に実行' },
  propose_transfer:                { basis: 'userIds・targetOrgCode',                        action: '個別異動を提案 → 確認後に departmentCode を変更' },
  propose_promotion:               { basis: 'userIds',                                       action: '昇格を提案 → 確認後に promotionSign="1" を設定' },
  propose_create_position:         { basis: '組織コード・役職名',                            action: '空席ポジション作成を提案 → 確認後に新規行を作成' },
  propose_assign_person:           { basis: 'vacantRowId・userId',                           action: '空席ポジションへの配属を提案 → 確認後に userId を設定' },
  propose_change_position:         { basis: 'userId・新しい役職名',                           action: 'ポジション変更を提案 → 確認後に役職名を変更し旧ポジションを削除' },
  propose_set_manager_position:    { basis: 'rowId・上司ポジションコード',                   action: '上司ポジション設定を提案 → 確認後に managerPositionCode を設定' },
  propose_re_derive_manager_names: { basis: '（引数なし・全行対象）',                         action: '全行の managerName を一括更新提案 → 確認後に実行' },
  getUnassignedPositions:          { basis: '（引数なし）',                                   action: '内部採番コード（_pos_）のポジション一覧を返す（副作用なし）' },
  propose_assign_position_codes:   { basis: '（rowId・新コード）のペア配列',                  action: 'ポジションコード割り当てを提案 → 確認後に positionCode を変更' },
  propose_re_derive_org_sub_fields:{ basis: '（引数なし・全行対象）',                         action: '全行の組織サブフィールドを一括再導出提案 → 確認後に実行' },
  propose_leave_of_absence:        { basis: 'userId・メモ（任意）',                           action: '休職を提案 → 確認後に leaveOfAbsenceSign="1" を設定' },
  propose_return_from_leave:       { basis: 'userId',                                        action: '復職を提案 → 確認後に leaveOfAbsenceSign をクリア' },
  propose_concurrent_add:          { basis: 'userId・兼務先組織コード・兼務理由（任意）',      action: '社内兼務追加を提案 → 確認後に兼務行を新規作成' },
  propose_concurrent_release:      { basis: 'userId・兼務先組織コード（任意）',               action: '社内兼務解除を提案 → 確認後に兼務行を削除' },
  propose_secondment_to_concurrent:{ basis: 'rowId（本務出向行）・兼務理由（任意）',          action: '本務出向→兼務出向変換を提案 → 確認後に2ステップで変換' },
  propose_secondment_transfer:     { basis: 'rowId（本務出向行）・異動事由',                  action: '出向先転籍を提案 → 確認後に出向解除＋転籍を実行' },
  propose_demotion:                { basis: 'userId・役職/バンド/等級/降格理由（任意）',       action: '降格を提案 → 確認後に役職・バンド等を変更' },
}
