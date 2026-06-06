// 組織CD一覧 — 組織コードと階層パスのマスタ参照テーブル
// シート "組織CD一覧"
// 上位組織コード列があればそれを使い、なければ BU/部門/… 列名から推定する
export interface OrgMasterEntry {
  code:                string          // 組織コード
  companyCode?:        string          // 会社コード（Excel「会社コード」列。CompanyFilterEntry.code と対応）
  parentCode?:         string          // 上位組織コード（Excel に列がある場合）
  name?:               string          // 組織名
  company:             string          // 会社名
  pathBusinessUnit:    string          // 階層パス: ビジネスユニット
  pathDivision:        string          // 階層パス: 部門
  pathDepartment:      string          // 階層パス: 統括部
  pathGroup:           string          // 階層パス: グループ
  pathTeam:            string          // 階層パス: チーム
  orgCategory:         string          // 組織区分（例: '出向者用組織'）
  costCenter:          string          // コストセンター
  workLocation:        string          // 勤務地
  phase:               'before' | 'after'  // 発令前後フラグ（列なし・空セル → 'after'）
}
