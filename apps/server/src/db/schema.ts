import {
  pgTable, text, integer, serial, boolean,
  uniqueIndex, primaryKey, index,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

const now = sql`now()`

// ─── グループレベル ───────────────────────────────────────────────────────────

export const companies = pgTable('companies', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  code:      text('code').notNull().unique(),
  locale:    text('locale').notNull().default('ja'),
  createdAt: text('created_at').notNull().default(now),
})

// グループ横断ユーザー（company_id を持たない）
export const users = pgTable('users', {
  id:    text('id').primaryKey(),
  name:  text('name').notNull(),
  email: text('email').notNull().unique(),
  role:  text('role').notNull().default('member'), // admin | coordinator | member
})

// users ↔ companies の M:N。会社ごとの役割とアクセス制御を統合
export const userCompanyRoles = pgTable('user_company_roles', {
  userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  companyId:   text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  role:        text('role').notNull(), // coordinator | member
  orgLevelMin: integer('org_level_min'),
  orgCodes:    text('org_codes'), // JSON array
}, (t) => [primaryKey({ columns: [t.userId, t.companyId] })])

// グループレベルの作業サイクル（複数 company を束ねる）
export const rounds = pgTable('rounds', {
  id:             text('id').primaryKey(),
  label:          text('label').notNull(),
  kind:           text('kind').notNull().default('annual'),  // annual | patch
  status:         text('status').notNull().default('draft'), // draft | in_progress | ready | merged
  basedOnRoundId: text('based_on_round_id'), // self-ref（nullable = 初回）。FK なし（Drizzle 自己参照制約）
  createdBy:      text('created_by').notNull().references(() => users.id),
  createdAt:      text('created_at').notNull().default(now),
  updatedAt:      text('updated_at').notNull().default(now),
})

// ─── Round × Company（実作業単位）────────────────────────────────────────────

// 1 Round に複数 Company。UNIQUE(round_id, company_id) で二重なし
export const roundCompanies = pgTable('round_companies', {
  id:        text('id').primaryKey(),
  roundId:   text('round_id').notNull().references(() => rounds.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id),
  status:    text('status').notNull().default('draft'), // draft | in_progress | ready | merged
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
}, (t) => [uniqueIndex('round_companies_round_company').on(t.roundId, t.companyId)])

// Excel ファイル（round_company と 1:1）
export const roundCompanyFiles = pgTable('round_company_files', {
  roundCompanyId: text('round_company_id').primaryKey()
    .references(() => roundCompanies.id, { onDelete: 'cascade' }),
  filename:  text('filename').notNull(),
  data:      text('data').notNull(), // base64 encoded
  size:      integer('size').notNull(),
  createdAt: text('created_at').notNull().default(now),
})

// 組織スナップショット（before/after を同テーブルで管理、正規化ツリー）
export const roundCompanyOrgs = pgTable('round_company_orgs', {
  id:             serial('id').primaryKey(),
  roundCompanyId: text('round_company_id').notNull()
    .references(() => roundCompanies.id, { onDelete: 'cascade' }),
  isAfter:      boolean('is_after').notNull().default(false),
  externalCode: text('external_code').notNull(),
  name:         text('name').notNull(),
  parentId:     integer('parent_id'), // self-ref → round_company_orgs.id（FK なし）
  level:        integer('level').notNull().default(0),
  path:         text('path').notNull().default('/'), // マテリアライズドパス "/1/3/7/"
}, (t) => [
  index('rco_rc_idx').on(t.roundCompanyId),
  index('rco_path_idx').on(t.path),
])

// コードリスト（役職・バンド・異動事由等。正規化）
export const roundCompanyCodeItems = pgTable('round_company_code_items', {
  id:             serial('id').primaryKey(),
  roundCompanyId: text('round_company_id').notNull()
    .references(() => roundCompanies.id, { onDelete: 'cascade' }),
  category:   text('category').notNull(), // employment_type | job_level | official_position | transfer_reason | ...
  code:        text('code').notNull(),
  label:       text('label').notNull(),
  sortOrder:   integer('sort_order').notNull().default(0),
  attributes:  text('attributes'), // JSON（カテゴリ固有の追加属性。isOutsourceAcceptance 等）
}, (t) => [
  index('rcci_rc_cat_idx').on(t.roundCompanyId, t.category),
])

// ─── AllocationRows（trunk）──────────────────────────────────────────────────

export const allocationRows = pgTable('allocation_rows', {
  id:             serial('id').primaryKey(),
  roundCompanyId: text('round_company_id').notNull()
    .references(() => roundCompanies.id, { onDelete: 'cascade' }),
  submissionId: text('submission_id').references(() => submissions.id),
  rowId:        integer('row_id').notNull(),
  data:         text('data').notNull(), // JSON: AllocationRow
  createdAt:    text('created_at').notNull().default(now),
  updatedAt:    text('updated_at').notNull().default(now),
}, (t) => [uniqueIndex('allocation_rows_rc_row').on(t.roundCompanyId, t.rowId)])

// ─── Submissions（委譲ツリー）────────────────────────────────────────────────

export const submissions = pgTable('submissions', {
  id:              text('id').primaryKey(),
  roundCompanyId:  text('round_company_id').notNull()
    .references(() => roundCompanies.id, { onDelete: 'cascade' }),
  parentId:        text('parent_id'), // self-ref（FK なし）
  assigneeId:      text('assignee_id').notNull().references(() => users.id),
  scope:           text('scope').notNull(),
  status:          text('status').notNull().default('pending'),
  requestComment:  text('request_comment'),
  revisionComment: text('revision_comment'),
  snapshotData:    text('snapshot_data'), // 委譲時点の親スナップショット（委譲範囲分）
  conflictFields:  text('conflict_fields'),
  createdBy:       text('created_by').notNull().references(() => users.id),
  createdAt:       text('created_at').notNull().default(now),
  updatedAt:       text('updated_at').notNull().default(now),
})

export const submissionRows = pgTable('submission_rows', {
  submissionId: text('submission_id').notNull()
    .references(() => submissions.id, { onDelete: 'cascade' }),
  rowId:     integer('row_id').notNull(),
  data:      text('data').notNull(),
  updatedAt: text('updated_at').notNull().default(now),
}, (t) => [primaryKey({ columns: [t.submissionId, t.rowId] })])

// ─── 整合性チェック──────────────────────────────────────────────────────────

// 会社内：同一 round_company 内の submission 間の整合性問題
export const consistencyIssues = pgTable('consistency_issues', {
  id:              serial('id').primaryKey(),
  roundCompanyId:  text('round_company_id').notNull()
    .references(() => roundCompanies.id, { onDelete: 'cascade' }),
  groupEmployeeId: text('group_employee_id').notNull(),
  field:           text('field').notNull(),
  valueA:          text('value_a'),
  valueB:          text('value_b'),
  submissionAId:   text('submission_a_id').references(() => submissions.id),
  submissionBId:   text('submission_b_id').references(() => submissions.id),
  status:          text('status').notNull().default('open'),
  createdAt:       text('created_at').notNull().default(now),
})

// 会社横断：同一 round 内で同じグループ社員IDが複数会社に存在する問題
export const crossCompanyIssues = pgTable('cross_company_issues', {
  id:              serial('id').primaryKey(),
  roundId:         text('round_id').notNull()
    .references(() => rounds.id, { onDelete: 'cascade' }),
  groupEmployeeId: text('group_employee_id').notNull(),
  companyAId:      text('company_a_id').notNull().references(() => companies.id),
  companyBId:      text('company_b_id').notNull().references(() => companies.id),
  field:           text('field').notNull(),
  valueA:          text('value_a'),
  valueB:          text('value_b'),
  status:          text('status').notNull().default('open'),
  createdAt:       text('created_at').notNull().default(now),
})

// ─── ポジション（会社別）────────────────────────────────────────────────────

export const positions = pgTable('positions', {
  code:         text('code').primaryKey(),
  companyId:    text('company_id').references(() => companies.id),
  status:       text('status').notNull().default('available'), // available | in_use | retired
  acquiredBy:   text('acquired_by'),
  acquiredAt:   text('acquired_at'),
  notes:        text('notes'),
  registeredBy: text('registered_by').references(() => users.id),
  registeredAt: text('registered_at').notNull().default(now),
  updatedAt:    text('updated_at').notNull().default(now),
})

// ─── AI スキル定義 ────────────────────────────────────────────────────────────

export const skillDefs = pgTable('skill_defs', {
  id:          text('id').primaryKey(),
  toolName:    text('tool_name').notNull().unique(),
  description: text('description').notNull(),
  status:      text('status').notNull().default('draft'), // draft | approved | active | disabled
  version:     integer('version').notNull().default(1),
  approvedBy:  text('approved_by').references(() => users.id),
  approvedAt:  text('approved_at'),
  createdAt:   text('created_at').notNull().default(now),
  updatedAt:   text('updated_at').notNull().default(now),
})

// スキル（手順定義。slug ベース upsert。STEP2 DB 版）
export const skills = pgTable('skills', {
  slug:         text('slug').primaryKey(),
  name:         text('name').notNull(),
  description:  text('description').notNull().default(''),
  instructions: text('instructions').notNull().default(''),
  status:       text('status').notNull().default('draft'), // active | disabled | draft
  isBuiltin:    integer('is_builtin').notNull().default(0),
  createdAt:    text('created_at').notNull().default(now),
  updatedAt:    text('updated_at').notNull().default(now),
})

// ─── コミュニケーション系───────────────────────────────────────────────────

export const comments = pgTable('comments', {
  id:        serial('id').primaryKey(),
  issueId:   integer('issue_id').notNull()
    .references(() => consistencyIssues.id, { onDelete: 'cascade' }),
  authorId:  text('author_id').notNull().references(() => users.id),
  body:      text('body').notNull(),
  createdAt: text('created_at').notNull().default(now),
})

export const inquiries = pgTable('inquiries', {
  id:             serial('id').primaryKey(),
  rowId:          integer('row_id').notNull(),
  roundCompanyId: text('round_company_id').notNull()
    .references(() => roundCompanies.id),
  fromUserId: text('from_user_id').notNull().references(() => users.id),
  toUserId:   text('to_user_id').notNull().references(() => users.id),
  fields:     text('fields').notNull(),
  message:    text('message').notNull(),
  reply:      text('reply'),
  repliedAt:  text('replied_at'),
  createdAt:  text('created_at').notNull().default(now),
})

export const notifications = pgTable('notifications', {
  id:          serial('id').primaryKey(),
  recipientId: text('recipient_id').notNull().references(() => users.id),
  template:    text('template').notNull(),
  payload:     text('payload').notNull(),
  readAt:      text('read_at'),
  sentAt:      text('sent_at'),
})
