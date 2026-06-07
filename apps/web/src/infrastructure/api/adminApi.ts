// 管理画面用 API クライアント
// X-User-Id ヘッダーでユーザーを識別する（デモ用スタブ認証）
import type { RowChangeSummary } from '@personnel/domain/diffMerge'

const ADMIN_BASE = 'http://localhost:3000/api/admin'
const API_BASE   = 'http://localhost:3000/api'

export type UserRole = 'admin' | 'coordinator' | 'member'

export interface AdminUser {
  id:    string
  name:  string
  email: string
  role:  UserRole
}

export interface UserBody {
  name:  string
  email: string
  role:  UserRole
}

// ── Positions ────────────────────────────────────────────────────────────────

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

// ── Round ────────────────────────────────────────────────────────────────────

export type RoundKind   = 'annual' | 'patch'
export type RoundStatus = 'draft' | 'in_progress' | 'ready' | 'merged'

export interface ApiRound {
  id:               string
  label:            string
  kind:             RoundKind
  status:           RoundStatus
  based_on_round_id: string | null
  created_at:       string
  created_by_name:  string | null
  company_count:    number
}

export interface ApiRoundCompany {
  id:           string   // roundCompanyId
  round_id:     string
  company_id:   string
  company_name: string | null
  company_code: string | null
  status:       RoundStatus
  row_count:    number
}

export interface CreateRoundBody {
  label:               string
  kind?:               RoundKind
  companyId:           string
  basedOnRoundId?:     string
  rows?:               unknown[]
  beforeOrganizations?: unknown[]
  afterOrganizations?:  unknown[]
  codeLists?:           unknown
  excelBase64?:         string
  excelFilename?:       string
}

export interface RoundMasters {
  beforeOrganizations: unknown[]
  afterOrganizations:  unknown[]
  codeLists:           unknown
}

// ── Submission ───────────────────────────────────────────────────────────────

export type SubmissionStatus =
  'pending' | 'in_progress' | 'submitted' | 'merged' | 'accepted' | 'revision_requested' | 'cancelled'

export interface ApiSubmission {
  id:                string
  round_company_id:  string
  round_id:          string | null
  company_id:        string | null
  round_label:       string | null
  parent_id:         string | null
  assignee_id:       string
  assignee_name:     string | null
  scope:             string  // JSON
  status:            SubmissionStatus
  request_comment:   string | null
  revision_comment:  string | null
  created_at:        string
  updated_at:        string
  row_count?:        number
  child_count?:      number
  child_done_count?: number
}

export interface ChildDiff {
  id:            string
  assignee_id:   string
  assignee_name: string | null
  status:        SubmissionStatus
  diffs:         RowChangeSummary[]
}

export interface CreateSubmissionBody {
  roundCompanyId:      string
  assigneeId:          string
  parentSubmissionId?: string
  scope:               unknown
  requestComment?:     string
}

// ────────────────────────────────────────────────────────────────────────────

function getCurrentUserId(): string {
  return sessionStorage.getItem('demo_user_id') ?? 'user-admin'
}

async function apiFetch<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
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

const admin = <T>(path: string, init?: RequestInit) => apiFetch<T>(ADMIN_BASE, path, init)
const api   = <T>(path: string, init?: RequestInit) => apiFetch<T>(API_BASE,   path, init)

export const adminApi = {
  users: {
    list:   ()                               => admin<AdminUser[]>('/users'),
    get:    (id: string)                     => admin<AdminUser>(`/users/${id}`),
    create: (body: UserBody)                 => admin<AdminUser>('/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<UserBody>) =>
      admin<AdminUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string)                     => admin<void>(`/users/${id}`, { method: 'DELETE' }),
  },
  positions: {
    list:         (status?: PositionStatus) =>
      admin<AdminPosition[]>(status ? `/positions?status=${status}` : '/positions'),
    summary:      ()                        => admin<PositionSummary>('/positions/summary'),
    bulkRegister: (codes: string[])         =>
      admin<BulkRegisterResult>('/positions/bulk', { method: 'POST', body: JSON.stringify({ codes }) }),
    update:       (code: string, body: PositionUpdateBody) =>
      admin<AdminPosition>(`/positions/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete:       (code: string)            =>
      admin<void>(`/positions/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  },
  rounds: {
    list:       ()                              => api<ApiRound[]>('/rounds'),
    get:        (id: string)                    => api<ApiRound>(`/rounds/${id}`),
    create:     (body: CreateRoundBody)         =>
      api<{ id: string; roundCompanyId: string; rowCount: number }>('/rounds', { method: 'POST', body: JSON.stringify(body) }),
    getCompanies: (id: string)                  => api<ApiRoundCompany[]>(`/rounds/${id}/companies`),
    getTree:    (id: string)                    => api<ApiSubmission[]>(`/rounds/${id}/tree`),
    getMasters: (id: string, companyId: string) =>
      api<RoundMasters>(`/rounds/${id}/companies/${companyId}/masters`),
    getExcelUrl: (id: string, companyId: string) =>
      `${API_BASE}/rounds/${id}/companies/${companyId}/excel`,
    finalize:   (id: string)                    =>
      api<{ status: string; rowCount: number }>(`/rounds/${id}/finalize`, { method: 'POST' }),
  },
  submissions: {
    list:            ()                                  => api<ApiSubmission[]>('/submissions'),
    get:             (id: string)                        => api<ApiSubmission>(`/submissions/${id}`),
    create:          (body: CreateSubmissionBody)        =>
      api<{ id: string }>('/submissions', { method: 'POST', body: JSON.stringify(body) }),
    getRows:         (id: string)                        => api<unknown[]>(`/submissions/${id}/rows`),
    getChildren:     (id: string)                        => api<ApiSubmission[]>(`/submissions/${id}/children`),
    putRows:         (id: string, rows: unknown[])       =>
      api<{ saved: number }>(`/submissions/${id}/rows`, { method: 'PUT', body: JSON.stringify(rows) }),
    submit:          (id: string, opts?: { force?: boolean }) =>
      api<{ status: string }>(`/submissions/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify(opts ?? {}),
        headers: { 'Content-Type': 'application/json' },
      }),
    merge:           (id: string) =>
      api<{ status: string; conflicts: { rowId: number; fields: string[] }[] }>(
        `/submissions/${id}/merge`, { method: 'POST' }),
    sync:            (id: string) =>
      api<{ conflicts: { rowId: number; fields: string[] }[] }>(
        `/submissions/${id}/sync`, { method: 'POST' }),
    requestRevision: (id: string, comment: string) =>
      api<{ status: string }>(`/submissions/${id}/request-revision`, {
        method: 'POST', body: JSON.stringify({ comment }),
      }),
    getChildDiffs: (id: string) =>
      api<{ children: ChildDiff[] }>(`/submissions/${id}/child-diffs`),
  },
}
