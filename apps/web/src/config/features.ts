// STEP1/STEP2 の機能フラグ。
//
// 2変数で制御する:
//   VITE_APP_MODE  : step1 | step2
//   VITE_AUTH_MODE : none | stub | sso   (STEP2 のみ有効)
//
//  VITE_APP_MODE=step1, VITE_AUTH_MODE=none  → STEP1 本番（デフォルト）
//  VITE_APP_MODE=step2, VITE_AUTH_MODE=stub  → STEP2 DEV（Hono+SQLite+スタブ認証）
//  VITE_APP_MODE=step2, VITE_AUTH_MODE=sso   → STEP2 本番（Aurora+SAML SSO）

const appMode  = import.meta.env.VITE_APP_MODE  ?? 'step1'
const authMode = import.meta.env.VITE_AUTH_MODE ?? 'none'

const isStep2 = appMode === 'step2'

export const Features = {
  // Web 提出ボタン・サーバー送信フロー
  webSubmission: isStep2,
  // 整合エラー通知バナー
  consistencyNotifications: isStep2,
  // ポジション申請ワークフロー
  positionWorkflow: isStep2,
  // ユーザー切り替えドロップダウン（STEP2 DEV のスタブ認証のみ）
  userSwitcher: isStep2 && authMode === 'stub',
  // ユーザー管理・管理画面
  userManagement: isStep2,
} as const

export type FeatureKey = keyof typeof Features
