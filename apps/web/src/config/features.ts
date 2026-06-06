// STEP1/STEP2 の機能フラグ。
// .env.production に VITE_BACKEND_MODE=stub を設定すると STEP1 ビルドになり、
// STEP2 用 UI コードは tree-shake で除外される。
//
// ローカルで STEP2 デモを動かすには .env.local に VITE_BACKEND_MODE=local-server を設定する。

const mode = import.meta.env.VITE_BACKEND_MODE ?? 'stub'

export const Features = {
  // Web 提出ボタン・サーバー送信フロー
  webSubmission: mode !== 'stub',
  // 整合エラー通知バナー
  consistencyNotifications: mode !== 'stub',
  // ポジション申請ワークフロー
  positionWorkflow: mode !== 'stub',
  // ユーザー切り替えドロップダウン（デモ用スタブ認証）
  userSwitcher: mode === 'local-server',
  // ユーザー管理・管理画面
  userManagement: mode !== 'stub',
} as const

export type FeatureKey = keyof typeof Features
