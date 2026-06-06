import { z } from 'zod'

// Excel フラグ列: "1" = セット、空白・スペースのみ・null = 未セット
const flagField = z.string().optional().transform((v): string | undefined => (v?.trim() ? '1' : undefined))

export const AllocationListSchema = z.object({
  // ── Metadata ──────────────────────────────────────────────────
  userId:                            z.string().optional(),
  no:                                z.string().optional(),
  groupEmployeeId:                   z.string().optional(),
  employeeNumber:                    z.string().optional(),
  lastName:                          z.string().optional(),
  firstName:                         z.string().optional(),
  transferReason:                    z.string().optional(),
  memo:                              z.string().optional(),
  promotionSign:                     flagField,
  demotionReason:                    z.string().optional(),
  payGradeChangeSign:                flagField,

  // ── After state (canonical field names, aligned with position/jobClassification) ──
  employmentType:                    z.string().optional(),
  concurrentType:                    z.string().optional(),
  concurrentReason:                  z.string().optional(),
  secondmentFromCompany:             z.string().optional(),
  secondmentFromEmployeeNumber:      z.string().optional(),
  leaveOfAbsenceSign:                flagField,
  positionCode:                      z.string().optional(),
  departmentCode:                    z.string().optional(),
  businessUnit:                      z.string().optional(),
  division:                          z.string().optional(),
  subDivision:                       z.string().optional(),
  group:                             z.string().optional(),
  team:                              z.string().optional(),
  officialPositionCode:              z.string().optional(),
  localJobTitle:                     z.string().optional(),
  secondmentToCompany:               z.string().optional(),
  location:                          z.string().optional(),
  costCenter:                        z.string().optional(),
  managerPositionCode:               z.string().optional(),
  managerName:                       z.string().optional(),
  jobFamily:                         z.string().optional(),
  jobType:                           z.string().optional(),
  positionBand:                      z.string().optional(),
  band:                              z.string().optional(),
  payGrade:                          z.string().optional(),
  trainingPositionFlag:              z.string().optional(),
  nonUnionAgreementFlag:             z.string().optional(),
  positionUnionFlag:                 z.string().optional(),
  unionFlag:                         z.string().optional(),
  positionDiscretionaryWorkFlag:     z.string().optional(),
  discretionaryWorkFlag:             z.string().optional(),

  // ── Before state (prev prefix = fields without _新 in the source Excel) ──
  prevEmploymentType:                z.string().optional(),
  prevConcurrentType:                z.string().optional(),
  prevConcurrentReason:              z.string().optional(),
  prevSecondmentFromCompany:         z.string().optional(),
  prevSecondmentFromEmployeeNumber:  z.string().optional(),
  prevLeaveOfAbsenceSign:                     flagField,
  prevPositionCode:                  z.string().optional(),
  prevDepartmentCode:                z.string().optional(),
  prevBusinessUnit:                  z.string().optional(),
  prevDivision:                      z.string().optional(),
  prevSubDivision:                   z.string().optional(),
  prevGroup:                         z.string().optional(),
  prevTeam:                          z.string().optional(),
  prevOfficialPositionCode:          z.string().optional(),
  prevLocalJobTitle:                 z.string().optional(),
  prevSecondmentToCompany:           z.string().optional(),
  prevLocation:                      z.string().optional(),
  prevCostCenter:                    z.string().optional(),
  prevManagerPositionCode:           z.string().optional(),
  prevManagerName:                   z.string().optional(),
  prevJobFamily:                     z.string().optional(),
  prevJobType:                       z.string().optional(),
  prevPositionBand:                  z.string().optional(),
  prevBand:                          z.string().optional(),
  prevPayGrade:                      z.string().optional(),
  prevTrainingPositionFlag:          z.string().optional(),
  prevNonUnionAgreementFlag:         z.string().optional(),
  prevPositionUnionFlag:             z.string().optional(),
  prevUnionFlag:                     z.string().optional(),
  prevPositionDiscretionaryWorkFlag: z.string().optional(),
  prevDiscretionaryWorkFlag:         z.string().optional(),

  // ── Audit ──────────────────────────────────────────────────────
  exclusionReason:                   z.string().optional(),

  // ── Assignee ───────────────────────────────────────────────────
  // A列（ヘッダーなし）から読み取る担当者名。マスタなし・ファイル内値をリスト化。
  // prevAssignee は持たない（変更履歴を追わない）。
  assignee:                          z.string().optional(),
})

export type AllocationList = z.infer<typeof AllocationListSchema>
