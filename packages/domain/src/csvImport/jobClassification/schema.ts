import { z } from 'zod'

export const JobClassificationImportSchema = z.object({
  // ── Required ─────────────────────────────────────────────────
  userId:                z.string(),
  startDate:             z.string(), // YYYY-MM-DD

  // ── Scalar strings ───────────────────────────────────────────
  seqNumber:             z.string().optional(),
  eventReason:           z.string().optional(),
  position:              z.string().optional(),
  company:               z.string().optional(),
  businessUnit:          z.string().optional(),
  division:              z.string().optional(),
  department:            z.string().optional(),
  location:              z.string().optional(),
  costCenter:            z.string().optional(),
  timezone:              z.string().optional(),
  concurrentType:        z.string().optional(),
  employeeClass:         z.string().optional(),
  employmentType:        z.string().optional(),
  managerId:             z.string().optional(),
  jobCode:               z.string().optional(),
  jobTitle:              z.string().optional(),
  jobFamily:             z.string().optional(),
  jobType:               z.string().optional(),
  officialPositionCode:  z.string().optional(),
  localJobTitle:         z.string().optional(),
  jobLevel:              z.string().optional(),
  jobLevelPosition:      z.string().optional(),
  payGrade:              z.string().optional(),
  unionFlag:             z.string().optional(),
  unionCode:             z.string().optional(),
  gvWorkFlag:            z.string().optional(),
  shiftCode:             z.string().optional(),
  detailedReasonForLoa:  z.string().optional(),
  sickNameForLoa:        z.string().optional(),
  corporation:           z.string().optional(),
  hireType:              z.string().optional(),
  hireTypeDetail:        z.string().optional(),
  localEmployeeNumber:   z.string().optional(),
  masterEmpKey:          z.string().optional(),
  timeTypeProfileCode:   z.string().optional(),
  holidayCalendarCode:   z.string().optional(),
  workscheduleCode:      z.string().optional(),
  operation:             z.string().optional(),

  // ── Scalar dates (YYYY-MM-DD strings) ────────────────────────
  expectedReturnDate:    z.string().optional(),
  contractEndDate:       z.string().optional(),
  ccVacationEndDate:     z.string().optional(),
  dateOfCurrentPayGrade: z.string().optional(),
  entryIntoGroup:        z.string().optional(),
  originalStartDate:     z.string().optional(),
  seniorityStartDate:    z.string().optional(),
  firstDateWorked:       z.string().optional(),
  positionEntryDate:     z.string().optional(),
  jobEntryDate:          z.string().optional(),
  companyEntryDate:      z.string().optional(),
  locationEntryDate:     z.string().optional(),
  departmentEntryDate:   z.string().optional(),
  hireDate:              z.string().optional(),

  // ── Numeric as string (CSV output) ───────────────────────────
  fte:                   z.string().optional(),
  standardHours:         z.string().optional(),
})

export type JobClassificationImport = z.infer<typeof JobClassificationImportSchema>
