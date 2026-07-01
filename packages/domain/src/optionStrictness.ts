// ── 操作メニューの非該当操作の表示設定 ──────────────────────────────────────────
//
// availableFor() を通過しない操作（この行では通常使用しない操作）の扱い:
//   'hide'          : 表示しない（デフォルト）
//   'show'          : グレーで表示し、クリック可能（デバッグ用）
//   'show-disabled' : グレーで表示するが、クリック不可
//
// ユーザーが UI から変更した値は LocalStorage に保存され、このデフォルトを上書きする。
export type UnavailableOperationDisplay = 'hide' | 'show' | 'show-disabled'
export const DEFAULT_UNAVAILABLE_OPERATION_DISPLAY: UnavailableOperationDisplay = 'hide'
