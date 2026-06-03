import type { EditCommand } from './types'

/**
 * 1件以上の EditCommand を業務意図でまとめた複合操作。
 *
 * - 単一操作も EditScenario でラップすることで統一インターフェースを実現する。
 * - 実行後は全 Command に同一 txId が付与され、UndoStack に1つの StatePatch として積まれる。
 * - EditScenario オブジェクト自体は永続化しない。
 *
 * @see docs/12-operation-framework.md
 */
export interface EditScenario {
  readonly label:    string          // 業務名称（履歴パネル・Undo ラベル）
  readonly commands: EditCommand[]   // 1件でも複数件でも同じ構造
}
