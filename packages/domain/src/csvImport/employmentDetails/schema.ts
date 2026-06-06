import { z } from 'zod'

export const EmploymentDetailsImportSchema = z.object({
  // ── Required ─────────────────────────────────────────────────
  externalCode:      z.string(),
  effectiveStartDate: z.string(), // YYYY-MM-DD

  // ── Scalar strings ───────────────────────────────────────────
  '[OPERATOR]':      z.string().optional(),

  // ── Nested object ────────────────────────────────────────────
  allSfProcesses:    z.object({
    externalCode: z.string().optional(),
    usersSysId:   z.string().optional(),
  }).optional(),
})

export type EmploymentDetailsImport = z.infer<typeof EmploymentDetailsImportSchema>
