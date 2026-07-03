export interface IssueInstance {
  rowId:      number
  personName: string  // '' = 空席ポジション
  orgCode:    string
}

export interface IssueGroup {
  /** グループキー（= message）。確認キーのプレフィックスとして使用 */
  message:   string
  /** このバリデーション問題が対象とするフィールド（一括修正で使用） */
  field:     string
  instances: IssueInstance[]
}
