import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import {
  authenticated,
  issueToken,
  listAuthUsers,
  resolveUserById,
  type AuthVariables,
} from '../auth/index.ts'

// RPC（hc<AppType>）で型推論できるよう、ルート登録は1つのチェーンにする。
// 別々の文（app.get(...); app.post(...)）にすると、export時の app の型に
// 後から追加したルートが反映されない（TypeScriptの型再代入の仕組み上）。
const app = new Hono<{ Variables: AuthVariables }>()
  // 現在のユーザー情報（認証必須）
  .get('/me', authenticated, (c) => c.json(c.get('user')))

  // デモ用: ユーザー一覧（スタブ認証のユーザー切り替え UI 用）
  .get('/users', async (c) => c.json(await listAuthUsers()))

  // ── Dev stub: JWT Cookie 発行 ────────────────────────────────────────────
  // 開発時のユーザー切り替え用。X-User-Id ヘッダーと併用可。
  // NODE_ENV=production では 404 を返す。
  .post('/stub-login', async (c) => {
    if (process.env.NODE_ENV === 'production') {
      return c.json({ error: 'Not available in production' }, 404)
    }
    const { userId } = await c.req.json<{ userId: string }>()
    const user = await resolveUserById(userId)
    if (!user) return c.json({ error: 'User not found' }, 404)
    const token = await issueToken(user)
    setCookie(c, 'session', token, {
      httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 28800,
    })
    return c.json(user)
  })

  // ── ログアウト ──────────────────────────────────────────────────────────
  .post('/logout', (c) => {
    deleteCookie(c, 'session', { path: '/' })
    return c.json({ ok: true })
  })

// ── SAML SSO（本番）─────────────────────────────────────────────────────────
// IdP メタデータが確定したら以下を実装する。
// 必要パッケージ: @node-saml/node-saml
//
// import { NodeSAML } from '@node-saml/node-saml'
//
// const saml = new NodeSAML({
//   entryPoint:  process.env.SAML_ENTRY_POINT!,    // IdP SSO URL
//   issuer:      process.env.SAML_ISSUER!,          // SP entity ID
//   cert:        process.env.SAML_IDP_CERT!,        // IdP 公開証明書
//   callbackUrl: process.env.SAML_CALLBACK_URL!,    // ACS URL
// })
//
// // SP-initiated SSO: IdP へリダイレクト
// app.get('/saml/login', async (c) => {
//   const url = await saml.getAuthorizeUrlAsync('', undefined, {})
//   return c.redirect(url)
// })
//
// // ACS: IdP からのアサーション受け取り → JWT 発行
// app.post('/saml/callback', async (c) => {
//   const body = await c.req.parseBody()
//   const { profile } = await saml.validatePostResponseAsync(
//     body as Record<string, string>
//   )
//   // profile.nameID → 社員ID / メール等でユーザーを解決
//   const user = await resolveUserById(profile?.nameID ?? '')
//   if (!user) return c.json({ error: 'ユーザーが見つかりません' }, 404)
//   const token = await issueToken(user)
//   setCookie(c, 'session', token, {
//     httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 28800,
//   })
//   return c.redirect(process.env.SAML_REDIRECT_AFTER_LOGIN ?? '/')
// })

export default app
