export interface IssueInstance {
  rowId:      number
  personName: string  // '' = 空席ポジション
  orgCode:    string
}

export interface IssueGroup {
  /** グループキー（= message）。確認キーのプレフィックスとして使用 */
  message:   string
  instances: IssueInstance[]
}
