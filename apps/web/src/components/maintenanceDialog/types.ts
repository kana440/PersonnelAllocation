export interface FieldChange {
  field:  string
  label:  string
  before: string
  after:  string
}

export interface PersonChange {
  rowId:          number
  userId:         string
  name:           string
  departmentCode: string
  orgName:        string
  changes:        FieldChange[]
}

export interface OrgPreview {
  orgId:           string
  orgCode:         string
  orgName:         string
  totalMembers:    number
  affected:        PersonChange[]
}

export interface OperationDef {
  id:          string
  icon:        string
  label:       string
  description: string
  kind:        'auto' | 'manual'   // auto = 直接実行可, manual = 別途入力が必要
  /** 現在の状態から変更内容を計算する（副作用なし） */
  computeChanges(): PersonChange[]
  /** kind === 'auto' のとき実行して変更件数を返す */
  execute?(): number
  /** kind === 'manual' のとき実行（別ダイアログを開くなど） */
  openDialog?(): void
}
