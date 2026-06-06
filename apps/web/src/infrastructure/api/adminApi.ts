// 管理���面用 API クライアント
// X-User-Id ヘッダーでユーザーを���別する（デモ用スタブ認証）

const BASE = 'http://localhost:3000/api/admin'

export type UserRole = 'super_admin' | 'admin' | 'assignee'

export interface AdminUser {
  id:    string
  name:  string
  email: string
  role:  UserRole
  policy: {
    orgLevelMin: number | null
    orgCodes:    string[] | null
  }
}

export interface UserBody {
  name:         string
  email:        string
  role:         UserRole
  orgLevelMin?: number | null
  orgCodes?:    string[] | null
}

export type SessionStatus = 'draft' | 'submitted' | 'finalized'

export interface AdminSession {
  id:           string
  name:         string
  status:       SessionStatus
  created_by:   string
  creator_name: string | null
  created_at:   string
  row_count:    number
}

export type PositionStatus = 'available' | 'in_use' | 'retired'

export interface AdminPosition {
  code:         string
  status:       PositionStatus
  acquiredBy:   string | null
  acquiredAt:   string | null
  notes:        string | null
  registeredBy: string | null
  registeredAt: string
  updatedAt:    string
}

export interface PositionSummary {
  available: number
  in_use:    number
  retired:   number
}

export interface BulkRegisterResult {
  registered: string[]
  skipped:    string[]
}

export interface PositionUpdateBody {
  status?:      PositionStatus
  acquired_by?: string | null
  acquired_at?: string | null
  notes?:       string | null
}

// ────────────────────────────────────────────────────────────────

function getCurrentUserId(): string {
  return sessionStorage.getItem('demo_user_id') ?? 'user-admin'
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getCurrentUserId(),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const adminApi = {
  users: {
    list:   ()                               => apiFetch<AdminUser[]>('/users'),
    get:    (id: string)                     => apiFetch<AdminUser>(`/users/${id}`),
    create: (body: UserBody)                 => apiFetch<AdminUser>('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<UserBody>) =>
      apiFetch<AdminUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string)                     => apiFetch<void>(`/users/${id}`, { method: 'DELETE' }),
  },
  sessions: {
    list:   ()           => apiFetch<AdminSession[]>('/sessions'),
    delete: (id: string) => apiFetch<void>(`/sessions/${id}`, { method: 'DELETE' }),
  },
  positions: {
    list:         (status?: PositionStatus) =>
      apiFetch<AdminPosition[]>(status ? `/positions?status=${status}` : '/positions'),
    summary:      ()                        => apiFetch<PositionSummary>('/positions/summary'),
    bulkRegister: (codes: string[])         =>
      apiFetch<BulkRegisterResult>('/positions/bulk', { method: 'POST', body: JSON.stringify({ codes }) }),
    update:       (code: string, body: PositionUpdateBody) =>
      apiFetch<AdminPosition>(`/positions/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete:       (code: string)            =>
      apiFetch<void>(`/positions/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  },
}
