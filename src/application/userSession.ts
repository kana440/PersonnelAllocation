// ユーザーセッション・権限モデル
//
// 現在は「管理者 / 担当者」の2ロールをアプリ起動時に手動選択する設計だが、
// 将来 DB 認証に移行したときは setUserSession() を認証ライブラリのコールバックで
// 呼ぶだけで切り替えられるよう、ロールとケイパビリティを分離している。
//
// コンポーネントは UserRole を直接参照せず UserCapabilities を参照すること。
// 新しいロールを追加する場合は UserRole の拡張と deriveCapabilities() の更新のみでよい。

// ── ロール ──────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'assignee'

// ── セッション ───────────────────────────────────────────────────────────────

export interface UserSession {
  role:         UserRole
  // 担当者モード時の担当者名。管理者モードでは null。
  // TODO: DB移行時はこのフィールドを userId (string) に変更し、
  //       AllocationRow.assignee も同様に名前文字列 → ユーザーID化が必要。
  assigneeName: string | null
}

// ── ケイパビリティ ──────────────────────────────────────────────────────────
// コンポーネントはこちらを参照すること。ロール直接参照は禁止。

export interface UserCapabilities {
  /** 追加読込ボタンを表示するか */
  canImport:            boolean
  /** 分割エクスポートボタンを表示するか */
  canSplitExport:       boolean
  /** 担当者プレビューフィルタを表示するか（管理者専用） */
  canSetAssigneeFilter: boolean
  /** 担当者割り当てウィザードを使えるか */
  canAssignAssignees:   boolean
  /** 行スコープ: null = 全行表示, string = この担当者名の行のみ表示 */
  rowScope:             string | null
}

// ── ケイパビリティ導出 ───────────────────────────────────────────────────────
// 純粋関数。テスト可能。ロール追加時はここだけ変更する。

export function deriveCapabilities(session: UserSession): UserCapabilities {
  const isAdmin = session.role === 'admin'
  return {
    canImport:            isAdmin,
    canSplitExport:       isAdmin,
    canSetAssigneeFilter: isAdmin,
    canAssignAssignees:   isAdmin,
    rowScope:             isAdmin ? null : session.assigneeName,
  }
}

// ── デフォルト値 ─────────────────────────────────────────────────────────────

export const DEFAULT_SESSION: UserSession = { role: 'admin', assigneeName: null }
