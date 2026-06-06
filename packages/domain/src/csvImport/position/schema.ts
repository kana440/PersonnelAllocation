import { z } from 'zod'

// Shared shape for fields that nest as { externalCode: string }
const extCode = z.object({ externalCode: z.string() })

export const PositionImportSchema = z.object({
  // ── Required ─────────────────────────────────────────────────
  code:                                    z.string(),
  effectiveStartDate:                      z.string(), // YYYY-MM-DD

  // ── externalCode refs ─────────────────────────────────────────
  changeReason:                            extCode.optional(),
  cust_jobFamily:                          extCode.optional(),
  cust_jobFunction:                        extCode.optional(),
  company:                                 extCode.optional(),
  businessUnit:                            extCode.optional(),
  division:                                extCode.optional(),
  department:                              extCode.optional(),
  cust_solution:                           extCode.optional(),
  cust_ShukkoHakenFlag:                    extCode.optional(),
  cust_SecondedCompany:                    extCode.optional(),
  cust_officialPositionCode:               extCode.optional(),
  location:                                extCode.optional(),
  costCenter:                              extCode.optional(),
  jobCode:                                 extCode.optional(),
  jobLevel:                                extCode.optional(),
  payGrade:                                extCode.optional(),
  payRange:                                extCode.optional(),
  cust_assignType:                         extCode.optional(),
  employeeClass:                           extCode.optional(),
  cust_employmentType:                     extCode.optional(),
  cust_UnionFlag:                          extCode.optional(),
  cust_PositionCreateReason:               extCode.optional(),

  // ── code refs (not externalCode) ─────────────────────────────
  type:                                    z.object({ code: z.string() }).optional(),
  parentPosition:                          z.object({ code: z.string() }).optional(),

  // ── Localised name ───────────────────────────────────────────
  externalName:                            z.object({
    en_US:        z.string().optional(),
    defaultValue: z.string().optional(),
    ja_JP:        z.string().optional(),
  }).optional(),

  // ── Scalar strings ───────────────────────────────────────────
  description:                             z.string().optional(),
  effectiveStatus:                         z.string().optional(),
  cust_min:                                z.string().optional(),
  cust_mid:                                z.string().optional(),
  cust_max:                                z.string().optional(),
  technicalParameters:                     z.string().optional(),

  // ── Scalar dates (YYYY-MM-DD strings) ────────────────────────
  cust_ExpectedFulfillmentDate:            z.string().optional(),
  cust_scheduledEndDate:                   z.string().optional(),

  // ── Scalar numbers ───────────────────────────────────────────
  standardHours:                           z.number().optional(),
  targetFTE:                               z.number().optional(),

  // ── Scalar booleans ──────────────────────────────────────────
  vacant:                                  z.boolean().optional(),
  multipleIncumbentsAllowed:               z.boolean().optional(),
  positionControlled:                      z.boolean().optional(),
  cust_TrainingAssignmentFlag:             z.boolean().optional(),
  cust_LaborUnionFull_timeAssignmentFlag:  z.boolean().optional(),
  cust_V_WorkFlag:                         z.boolean().optional(),
})

export type PositionImport = z.infer<typeof PositionImportSchema>
