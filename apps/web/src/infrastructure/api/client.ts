// Hono RPC クライアント
//
// サーバーの AppType をインポートすることで、
// エンドポイント URL・リクエスト型・レスポンス型がすべて自動同期される。
//
// 使い方:
//   import { client } from './client'
//   const res = await client.api.submissions.$get()
//   const subs = await res.json()  // 型: Drizzle 推論の返却型（自動）
//
// 移行方針:
//   新規コンポーネントはこの client を使う。
//   既存の adminApi.ts は互換性維持のため当面そのまま残す。

import { hc } from 'hono/client'
import type { AppType } from '@server/app'

function getHeaders(): Record<string, string> {
  const userId = sessionStorage.getItem('demo_user_id') ?? 'user-admin'
  return { 'X-User-Id': userId }
}

// 型安全クライアント（レスポンス型はサーバー定義から自動推論）
export const client = hc<AppType>('http://localhost:3000', {
  headers: getHeaders,
})
