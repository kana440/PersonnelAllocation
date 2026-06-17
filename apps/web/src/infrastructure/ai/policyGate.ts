// Policy Gate — ツール実行可否をコードで判定する。
//
// 設計思想:
//   LLM は「どのツールを使いたいか」を判断する。
//   コードは「そのツールを本当に実行してよいか」を判断する。
//
// ツール種別（kind）とリスク判定の対応:
//   read   → 安全（副作用なし・確認不要）
//   render → 安全（副作用なし・確認不要。UIウィジェット表示のみ）
//   confirm → 要確認（副作用あり・ユーザー承認後のみ実行）

export type ToolKind = 'read' | 'render' | 'confirm'

/** Fast Path で公開してよいツールかどうかを判定する。 */
export function isSafeKind(kind: ToolKind): boolean {
  return kind === 'read' || kind === 'render'
}

/** ツールを実行してよいかを判定する。 */
export function canExecuteKind(
  kind: ToolKind,
  userConfirmed: boolean,
): { allowed: boolean; reason: 'safe_tool' | 'confirmation_required' | 'confirmed' } {
  if (isSafeKind(kind))        return { allowed: true,  reason: 'safe_tool' }
  if (!userConfirmed)           return { allowed: false, reason: 'confirmation_required' }
  return { allowed: true, reason: 'confirmed' }
}
