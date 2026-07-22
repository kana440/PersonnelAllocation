// ドメイン層の「軽い」純粋関数を REST 化したもの。
//
// 「軽い」の基準: allocationList（最大3万行）を引数に取らない関数だけをここに公開する。
// row 単体・masters・afterOrganizations は現実的なペイロードサイズに収まるが、
// allocationList はセッション状態（サーバー側で保持する設計）が無いと毎回全件送信になり
// 非現実的なため、対象外にしている（C系・E系・G/W系バリデーション、resolveRow の収束ループ等）。
// これらは将来、セッション状態をサーバーに持たせる設計と合わせて実装する。
//
// AllocationRow / AllMasters には現時点で zod スキーマが無いため、リクエストボディは
// あえてゆるい z.record() で受けている（OpenAPI 仕様には型名として現れるが、フィールド単位の
// 検証はしていない）。将来 AllocationRow の正式な zod スキーマを作ったら差し替えること。

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { OrganizationSchema } from '@personnel/domain/schemas'
import { runAssertRequired } from '@personnel/domain/rules/validate/assertRequired'
import { runBasedOnFormat } from '@personnel/domain/rules/validate/basedOnFormat'
import { runFromFieldRules } from '@personnel/domain/rules/validate/fromFieldRules'
import { getGroupedFieldOptions } from '@personnel/domain/rules/options'
import { deriveFieldUpdates } from '@personnel/domain/rules/derive'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { Organization } from '@personnel/domain/schemas'

const app = new OpenAPIHono().basePath('/api/domain')

// ── 共有スキーマ ─────────────────────────────────────────────────────────────

const AllocationRowSchema = z.record(z.string(), z.unknown())
  .openapi('AllocationRow', { description: 'AllocationRow（正式なzodスキーマは未整備のためゆるい型）' })

const MastersSchema = z.record(z.string(), z.unknown())
  .openapi('AllMasters', { description: 'AllMasters（正式なzodスキーマは未整備のためゆるい型）' })

const ValidationIssueSchema = z.object({
  field:          z.string(),
  level:          z.enum(['error', 'warning']),
  message:        z.string(),
  id:             z.string().optional(),
  suggestedPatch: z.record(z.string(), z.unknown()).optional(),
}).openapi('ValidationIssue')

const OptionsGroupSchema = z.object({
  valid:   z.array(z.string()),
  invalid: z.array(z.string()),
}).openapi('OptionsGroup')

// ── A系: 必須項目チェック ──────────────────────────────────────────────────

const assertRequiredRoute = createRoute({
  method: 'post',
  path:   '/validate/required',
  tags:   ['validate'],
  summary: 'A系: 必須項目チェック（row + masters のみで完結）',
  request: {
    body: { content: { 'application/json': { schema: z.object({
      row:     AllocationRowSchema,
      masters: MastersSchema,
    }) } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({
      issues: z.array(ValidationIssueSchema),
    }) } } },
  },
})

app.openapi(assertRequiredRoute, (c) => {
  const { row, masters } = c.req.valid('json')
  const issues = runAssertRequired(row as unknown as AllocationRow, masters as unknown as AllMasters)
  return c.json({ issues })
})

// ── B系: 書式チェック ────────────────────────────────────────────────────────

const basedOnFormatRoute = createRoute({
  method: 'post',
  path:   '/validate/format',
  tags:   ['validate'],
  summary: 'B系: 書式チェック（row のみで完結）',
  request: {
    body: { content: { 'application/json': { schema: z.object({
      row: AllocationRowSchema,
    }) } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({
      issues: z.array(ValidationIssueSchema),
    }) } } },
  },
})

app.openapi(basedOnFormatRoute, (c) => {
  const { row } = c.req.valid('json')
  const issues = runBasedOnFormat(row as unknown as AllocationRow)
  return c.json({ issues })
})

// ── D2/F系: マスタ整合性・条件付き制約 ────────────────────────────────────────

const fieldRulesRoute = createRoute({
  method: 'post',
  path:   '/validate/field-rules',
  tags:   ['validate'],
  summary: 'D2/F系: マスタ整合性・条件付き制約チェック（row + orgs + masters で完結。allocationList不要）',
  request: {
    body: { content: { 'application/json': { schema: z.object({
      row:     AllocationRowSchema,
      orgs:    z.array(OrganizationSchema),
      masters: MastersSchema,
    }) } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({
      issues: z.array(ValidationIssueSchema),
    }) } } },
  },
})

app.openapi(fieldRulesRoute, (c) => {
  const { row, orgs, masters } = c.req.valid('json')
  const issues = runFromFieldRules(
    row as unknown as AllocationRow,
    orgs as unknown as Organization[],
    masters as unknown as AllMasters,
  )
  return c.json({ issues })
})

// ── 選択肢取得 ────────────────────────────────────────────────────────────────

const optionsRoute = createRoute({
  method: 'post',
  path:   '/options',
  tags:   ['options'],
  summary: 'フィールドの有効/無効選択肢を取得（row + masters のみで完結）',
  request: {
    body: { content: { 'application/json': { schema: z.object({
      field:      z.string(),
      row:        AllocationRowSchema,
      masters:    MastersSchema,
      jobFamily:  z.string().optional(),
    }) } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: OptionsGroupSchema } } },
  },
})

app.openapi(optionsRoute, (c) => {
  const { field, row, masters, jobFamily } = c.req.valid('json')
  const result = getGroupedFieldOptions(
    field, row as unknown as AllocationRow, masters as unknown as AllMasters, jobFamily,
  )
  return c.json(result)
})

// ── 項目自動導出 ──────────────────────────────────────────────────────────────

const deriveRoute = createRoute({
  method: 'post',
  path:   '/derive',
  tags:   ['derive'],
  summary: '項目自動導出（row + masters のみで完結。allocationList を渡さないため、'
    + '上司姓名のような他行参照が必要な導出は動作しない）',
  request: {
    body: { content: { 'application/json': { schema: z.object({
      changes: z.record(z.string(), z.unknown()),
      row:     AllocationRowSchema,
      masters: MastersSchema,
    }) } } },
  },
  responses: {
    200: { description: 'OK', content: { 'application/json': { schema: z.object({
      derived: z.record(z.string(), z.unknown()),
    }) } } },
  },
})

app.openapi(deriveRoute, (c) => {
  const { changes, row, masters } = c.req.valid('json')
  const derived = deriveFieldUpdates(
    changes as Partial<AllocationRow>,
    row as unknown as AllocationRow,
    masters as unknown as AllMasters,
    // allocationList は意図的に渡さない（"軽い" エンドポイントのスコープ外。上のコメント参照）
  )
  return c.json({ derived })
})

// ── OpenAPI仕様 + Swagger UI ──────────────────────────────────────────────────

// .basePath('/api/domain') 済みのため、ここは相対パスで登録する
// （絶対パスを渡すと /api/domain が二重に付いてしまう）
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title:       'PersonnelAllocation Domain API（軽量版）',
    version:     '1.0.0',
    description: 'allocationList を必要としない「軽い」ドメイン関数のみを公開している。'
      + '重い（行間参照が必要な）関数は未実装。',
  },
})
app.get('/doc', swaggerUI({ url: '/api/domain/openapi.json' }))

export default app
