// 認証 API クライアント（STEP2 シェル用）
// スタブ認証: X-User-Id ヘッダーで識別。本番 SSO では同インターフェースのアダプタに差し替える。

const BASE = 'http://localhost:3000/api'

function getUserId(): string {
  return sessionStorage.getItem('demo_user_id') ?? 'user-admin'
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getUserId(),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export type UserRole = 'admin' | 'coordinator' | 'member'

export interface AuthUser {
  id:    string
  name:  string
  email: string
  role:  UserRole
}

export const authApi = {
  me:          ()           => apiFetch<AuthUser>(`${BASE}/auth/me`),
  listUsers:   ()           => apiFetch<AuthUser[]>(`${BASE}/auth/users`),
  getCurrentId: ()          => getUserId(),
  switchUser:  (id: string) => sessionStorage.setItem('demo_user_id', id),
}
