import type { JobClassificationImport } from './schema'
import { JobClassificationImportSchema } from './schema'

// Input has the same field shape as JobClassificationImport.
// Default: every field is passed through from input as-is.
// Add to OVERRIDES only when the value should differ from input.
export type JobClassificationImportInput = JobClassificationImport

type Resolver<T> = T | ((input: JobClassificationImportInput) => T | undefined)

// Auto-generated pass-through: each schema field → input[field]
const passThrough = Object.fromEntries(
  Object.keys(JobClassificationImportSchema.shape).map(k => [
    k,
    (input: JobClassificationImportInput) => input[k as keyof JobClassificationImport],
  ])
) as { [K in keyof JobClassificationImport]: Resolver<JobClassificationImport[K]> }

// Fields that deviate from pass-through.
// Fixed value  → write the value directly.
// Custom logic → write a function (input) => ...
const OVERRIDES: Partial<{ [K in keyof JobClassificationImport]: Resolver<JobClassificationImport[K]> }> = {
  // ── Fixed values ──────────────────────────────────────────────
  expectedReturnDate:    '&&NO_OVERWRITE&&',
  positionEntryDate:     '&&NO_OVERWRITE&&',
  timezone:              '&&NO_OVERWRITE&&',
  contractEndDate:       '&&NO_OVERWRITE&&',
  ccVacationEndDate:     '&&NO_OVERWRITE&&',
  jobTitle:              '&&NO_OVERWRITE&&',
  dateOfCurrentPayGrade: '&&NO_OVERWRITE&&',
  fte:                   '&&NO_OVERWRITE&&',
  standardHours:         '&&NO_OVERWRITE&&',
  shiftCode:             '&&NO_OVERWRITE&&',
  detailedReasonForLoa:  '&&NO_OVERWRITE&&',
  jobEntryDate:          '&&NO_OVERWRITE&&',
  companyEntryDate:      '&&NO_OVERWRITE&&',
  locationEntryDate:     '&&NO_OVERWRITE&&',
  departmentEntryDate:   '&&NO_OVERWRITE&&',
  hireDate:              '&&NO_OVERWRITE&&',
  originalStartDate:     '&&NO_OVERWRITE&&',
  seniorityStartDate:    '&&NO_OVERWRITE&&',
  firstDateWorked:       '&&NO_OVERWRITE&&',
  hireType:              '&&NO_OVERWRITE&&',
  hireTypeDetail:        '&&NO_OVERWRITE&&',
  localEmployeeNumber:   '&&NO_OVERWRITE&&',
  masterEmpKey:          '&&NO_OVERWRITE&&',
  timeTypeProfileCode:   '&&NO_OVERWRITE&&',
  holidayCalendarCode:   '&&NO_OVERWRITE&&',
  workscheduleCode:      '&&NO_OVERWRITE&&',
  operation:             '',

  // ── Custom logic ──────────────────────────────────────────────
}

const RESOLVERS = { ...passThrough, ...OVERRIDES }

function apply<T>(resolver: Resolver<T>, input: JobClassificationImportInput): T | undefined {
  return typeof resolver === 'function'
    ? (resolver as (i: JobClassificationImportInput) => T | undefined)(input)
    : resolver
}

export function toJobClassificationImport(input: JobClassificationImportInput): JobClassificationImport {
  return Object.fromEntries(
    Object.entries(RESOLVERS).map(([key, resolver]) => [
      key,
      apply(resolver as Resolver<unknown>, input),
    ])
  ) as JobClassificationImport
}

export function parseJobClassificationImport(input: JobClassificationImportInput): JobClassificationImport {
  return JobClassificationImportSchema.parse(toJobClassificationImport(input))
}
