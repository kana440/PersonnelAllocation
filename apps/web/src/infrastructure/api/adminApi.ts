// 管理画面用 API クライアント
// 内部実装は Hono RPC（client.ts の hc<AppType>）。サーバーのルート定義から
// URL・リクエスト/レスポンスの型が自動で同期される（手書きの fetch は使わない）。
// 呼び出し元（19ファイル）への影響をゼロにするため、公開する関数の形は変えていない。
import type { RowChangeSummary } from '@personnel/domain/diffMerge'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }  from '@personnel/domain/schemas'
import type { AllMasters }    from '@personnel/domain/masters/aggregate'
import { client } from './client'

const API_BASE = 'http://localhost:3000/api'

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
  status?:     PositionStatus
  acquiredBy?: string | null
  acquiredAt?: string | null
  notes?:      string | null
}

// ── Round ────────────────────────────────────────────────────────────────────

export type RoundKind   = 'annual' | 'patch'
export type RoundStatus = 'draft' | 'in_progress' | 'ready' | 'merged'

export interface ApiRound {
  id:             string
  label:          string
  kind:           RoundKind
  status:         RoundStatus
  basedOnRoundId: string | null
  createdAt:      string
  createdByName:  string | null
  companyCount:   number
}

export interface ApiRoundCompany {
  id:          string   // roundCompanyId
  roundId:     string
  companyId:   string
  companyName: string | null
  companyCode: string | null
  status:      RoundStatus
  rowCount:    number
}

export interface CreateRoundBody {
  label:               string
  kind?:               RoundKind
  companyId:           string
  basedOnRoundId?:     string
  rows?:               unknown[]
  beforeOrganizations?: unknown[]
  afterOrganizations?:  unknown[]
  masters?:           unknown
  excelBase64?:         string
  excelFilename?:       string
}

export interface RoundMasters {
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  masters:             Partial<AllMasters>
}

// ── Submission ───────────────────────────────────────────────────────────────

export type SubmissionStatus =
  'pending' | 'in_progress' | 'submitted' | 'merged' | 'accepted' | 'revision_requested' | 'cancelled'

export interface ApiSubmission {
  id:              string
  roundCompanyId:  string
  roundId:         string | null
  companyId:       string | null
  roundLabel:      string | null
  parentId:        string | null
  assigneeId:      string
  assigneeName:    string | null
  scope:           string  // JSON
  status:          SubmissionStatus
  requestComment:  string | null
  revisionComment: string | null
  createdAt:       string
  updatedAt:       string
  rowCount?:       number
  childCount?:     number
  childDoneCount?: number
}

export interface ChildDiff {
  id:           string
  assigneeId:   string
  assigneeName: string | null
  status:       SubmissionStatus
  diffs:        RowChangeSummary[]
}

export interface CreateSubmissionBody {
  roundCompanyId:      string
  assigneeId:          string
  parentSubmissionId?: string
  scope:               unknown
  requestComment?:     string
}

// ── Skill ─────────────────────────────────────────────────────────────────────

export type SkillStatus = 'active' | 'disabled' | 'draft'

export interface ApiSkill {
  slug:         string
  name:         string
  description:  string
  instructions: string
  status:       SkillStatus
  isBuiltin:    boolean
  createdAt:    string
  updatedAt:    string
}

export interface SkillUpsertBody {
  name?:         string
  description?:  string
  instructions?: string
  status?:       SkillStatus
  isBuiltin?:    boolean
}

// ────────────────────────────────────────────────────────────────────────────
// hc のレスポンスは Response 互換。旧 apiFetch と同じエラー処理・204対応をここで揃える。

async function unwrap<T>(resPromise: Response | Promise<Response>): Promise<T> {
  const res = await resPromise
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const adminApi = {
  users: {
    list:   ()                               => unwrap<AdminUser[]>(client.api.admin.users.$get()),
    get:    (id: string)                     => unwrap<AdminUser>(client.api.admin.users[':id'].$get({ param: { id } })),
    create: (body: UserBody)                 => unwrap<AdminUser>(client.api.admin.users.$post({ json: body })),
    update: (id: string, body: Partial<UserBody>) =>
      unwrap<AdminUser>(client.api.admin.users[':id'].$put({ param: { id }, json: body })),
    delete: (id: string)                     => unwrap<void>(client.api.admin.users[':id'].$delete({ param: { id } })),
  },
  positions: {
    list:         (status?: PositionStatus) =>
      unwrap<AdminPosition[]>(client.api.admin.positions.$get({ query: status ? { status } : {} })),
    summary:      ()                        => unwrap<PositionSummary>(client.api.admin.positions.summary.$get()),
    bulkRegister: (codes: string[])         =>
      unwrap<BulkRegisterResult>(client.api.admin.positions.bulk.$post({ json: { codes } })),
    update:       (code: string, body: PositionUpdateBody) =>
      unwrap<AdminPosition>(client.api.admin.positions[':code'].$put({ param: { code }, json: body })),
    delete:       (code: string)            =>
      unwrap<void>(client.api.admin.positions[':code'].$delete({ param: { code } })),
  },
  rounds: {
    list:       ()                              => unwrap<ApiRound[]>(client.api.rounds.$get()),
    get:        (id: string)                    => unwrap<ApiRound>(client.api.rounds[':id'].$get({ param: { id } })),
    create:     (body: CreateRoundBody)         =>
      unwrap<{ id: string; roundCompanyId: string; rowCount: number }>(
        // サーバー側の zValidator スキーマは body の詳細まで厳密に絞っていないため、
        // 呼び出し側の CreateRoundBody をそのまま渡す（hc の json 型と多少の緩さがある）。
        client.api.rounds.$post({ json: body as never })),
    getCompanies: (id: string)                  => unwrap<ApiRoundCompany[]>(client.api.rounds[':id'].companies.$get({ param: { id } })),
    getTree:    (id: string)                    => unwrap<ApiSubmission[]>(client.api.rounds[':id'].tree.$get({ param: { id } })),
    getMasters: (id: string, companyId: string) =>
      unwrap<RoundMasters>(client.api.rounds[':id'].companies[':companyId'].masters.$get({ param: { id, companyId } })),
    getExcelUrl: (id: string, companyId: string) =>
      `${API_BASE}/rounds/${id}/companies/${companyId}/excel`,
    finalize:   (id: string)                    =>
      unwrap<{ status: string; rowCount: number }>(client.api.rounds[':id'].finalize.$post({ param: { id } })),
  },
  submissions: {
    list:            ()                                  => unwrap<ApiSubmission[]>(client.api.submissions.$get()),
    get:             (id: string)                        => unwrap<ApiSubmission>(client.api.submissions[':id'].$get({ param: { id } })),
    create:          (body: CreateSubmissionBody)        =>
      unwrap<{ id: string }>(client.api.submissions.$post({ json: body as never })),
    getRows:         (id: string)                        => unwrap<AllocationRow[]>(client.api.submissions[':id'].rows.$get({ param: { id } })),
    getChildren:     (id: string)                        => unwrap<ApiSubmission[]>(client.api.submissions[':id'].children.$get({ param: { id } })),
    putRows:         (id: string, rows: unknown[])       =>
      unwrap<{ saved: number }>(client.api.submissions[':id'].rows.$put({ param: { id }, json: rows as never })),
    submit:          (id: string, opts?: { force?: boolean }) =>
      unwrap<{ status: string }>(client.api.submissions[':id'].submit.$post({ param: { id }, json: opts ?? {} })),
    merge:           (id: string) =>
      unwrap<{ status: string; conflicts: { rowId: number; fields: string[] }[] }>(
        client.api.submissions[':id'].merge.$post({ param: { id } })),
    sync:            (id: string) =>
      unwrap<{ conflicts: { rowId: number; fields: string[] }[] }>(
        client.api.submissions[':id'].sync.$post({ param: { id } })),
    requestRevision: (id: string, comment: string) =>
      unwrap<{ status: string }>(
        client.api.submissions[':id']['request-revision'].$post({ param: { id }, json: { comment } })),
    getChildDiffs: (id: string) =>
      unwrap<{ children: ChildDiff[] }>(client.api.submissions[':id']['child-diffs'].$get({ param: { id } })),
  },
  skills: {
    list:   () =>
      unwrap<ApiSkill[]>(client.api.admin.skills.$get()),
    upsert: (slug: string, body: SkillUpsertBody) =>
      unwrap<ApiSkill>(client.api.admin.skills[':slug'].$put({ param: { slug }, json: body })),
    delete: (slug: string) =>
      unwrap<void>(client.api.admin.skills[':slug'].$delete({ param: { slug } })),
  },
}
