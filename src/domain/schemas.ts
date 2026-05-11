import { z } from 'zod'

// ── Master data ──────────────────────────────────────────────
export const BandOptionSchema = z.object({
  id:        z.string(),
  label:     z.string(),
  grade:     z.string(),
  sortOrder: z.number().int(),
})

// ── Core domain ──────────────────────────────────────────────
export const CompanySchema = z.object({
  id:    z.string(),
  name:  z.string(),
  hasSF: z.boolean(),
})

export const OrganizationSchema = z.object({
  id:          z.string(),
  name:        z.string(),
  companyId:   z.string(),
  parentId:    z.string().nullable(),
  level:       z.number().int().min(1),
  isAbandoned: z.boolean().optional(),
})

export const PersonSchema = z.object({
  id:          z.string(),
  name:        z.string(),
  sfPersonId:  z.string().optional(),
})

export const PositionSchema = z.object({
  id:                           z.string(),
  orgId:                        z.string(),
  companyId:                    z.string(),
  title:                        z.string().optional(),
  band:                         z.string().optional(),
  isVacant:                     z.boolean(),
  sfPositionId:                 z.string().optional(),
  workLocation:                 z.string().optional(),
  costCenter:                   z.string().optional(),
  jobFamily:                    z.string().optional(),
  jobType:                      z.string().optional(),
  isTrainingPosition:           z.boolean().optional(),
  isUnionPosition:              z.boolean().optional(),
  isDiscretionaryLaborPosition: z.boolean().optional(),
})

export const AffiliationTypeSchema = z.enum(['primary', 'concurrent'])

export const AffiliationSchema = z.object({
  id:                          z.string(),
  personId:                    z.string(),
  positionId:                  z.string(),
  type:                        AffiliationTypeSchema,
  managerId:                   z.string().optional(),
  status:                      z.enum(['active', 'ended']),
  startDate:                   z.string(),
  endDate:                     z.string().optional(),
  employmentType:              z.string().optional(),
  concurrentReason:            z.string().optional(),
  secondmentSourceCompanyId:   z.string().optional(),
  secondmentSourceEmployeeId:  z.string().optional(),
  isOnLeave:                   z.boolean().optional(),
  individualBand:              z.string().optional(),
  salaryGrade:                 z.string().optional(),
  freeTitle:                   z.string().optional(),
  isNonUnionAgreement:         z.boolean().optional(),
  isUnionMember:               z.boolean().optional(),
  isDiscretionaryLabor:        z.boolean().optional(),
})

export const OperationKindSchema = z.enum([
  'MoveToOrg', 'AddConcurrent', 'RemoveConcurrent', 'SetManager',
  'Promote', 'SendOnSecondment', 'RecallFromSecondment', 'ChangeSecondment',
  'Hire', 'Retire', 'CreateVacantPosition', 'FillVacantPosition',
  'CreateOrg', 'AbolishOrg',
])

export const OperationSchema = z.object({
  id:                   z.string(),
  kind:                 OperationKindSchema,
  label:                z.string(),
  params:               z.record(z.string(), z.string()),
  effectiveDate:        z.string(),
  order:                z.number().int().min(1),
  transferReason:       z.string().optional(),
  memo:                 z.string().optional(),
  promotionSign:        z.boolean().optional(),
  demotionReason:       z.string().optional(),
  salaryGradeChangeSign: z.boolean().optional(),
})

// ── Inferred TypeScript types (schemas are the source of truth) ──
export type BandOption    = z.infer<typeof BandOptionSchema>
export type Company       = z.infer<typeof CompanySchema>
export type Organization  = z.infer<typeof OrganizationSchema>
export type Person        = z.infer<typeof PersonSchema>
export type Position      = z.infer<typeof PositionSchema>
export type AffiliationType = z.infer<typeof AffiliationTypeSchema>
export type Affiliation   = z.infer<typeof AffiliationSchema>
export type OperationKind = z.infer<typeof OperationKindSchema>
export type Operation     = z.infer<typeof OperationSchema>
