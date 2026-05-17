// 組織CD一覧 — 組織コードと階層パスのマスタ参照テーブル
// シート "組織CD一覧"
// 上位組織コード列があればそれを使い、なければ BU/部門/… 列名から推定する
export interface OrgMasterEntry {
  code:              string          // 組織コード
  parentCode?:       string          // 上位組織コード（Excel に列がある場合）
  name?:             string          // 組織名（Excel に列がある場合）
  businessUnit:      string          // ビジネスユニット
  division:          string          // 部門
  department:        string          // 統括部
  group:             string          // グループ
  team:              string          // チーム
  organizationLevel: number          // 組織レベル (1=BU, 2=部門, …)
}
