// 組織CD一覧 — 組織コードと階層パスのマスタ参照テーブル
// シート "組織CD一覧"
// 上位組織コード列があればそれを使い、なければ BU/部門/… 列名から推定する
export interface OrgMasterEntry {
  code:              string          // 組織コード
  companyCode?:      string          // 会社コード（Excel「会社コード」列。CompanyFilterEntry.code と対応）
  parentCode?:       string          // 上位組織コード（Excel に列がある場合）
  name?:             string          // 組織名
  company:            string          // 会社名
  businessUnit:      string          // ビジネスユニット
  division:          string          // 部門
  department:        string          // 統括部
  group:             string          // グループ
  team:              string          // チーム
  organizationLevel: string          // 出向者用の組織かの判定（出向者用＝出向者用組織）
  CostCenter:        string          // コストセンター
  workLocation:      string          // 勤務地
  phase:             'before' | 'after'  // 発令前後フラグ（列なし・空セル → 'after'）
}
