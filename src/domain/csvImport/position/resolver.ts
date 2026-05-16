import type { PositionImport } from './schema'
import { PositionImportSchema } from './schema'

// Input has the same field shape as PositionImport.
// Default: every field is passed through from input as-is.
// Add to OVERRIDES only when the value should differ from input.
export type PositionImportInput = PositionImport

type Resolver<T> = T | ((input: PositionImportInput) => T | undefined)

// Auto-generated pass-through: each schema field → input[field]
// When a new field is added to the schema it is automatically covered.
const passThrough = Object.fromEntries(
  Object.keys(PositionImportSchema.shape).map(k => [
    k,
    (input: PositionImportInput) => input[k as keyof PositionImport],
  ])
) as { [K in keyof PositionImport]: Resolver<PositionImport[K]> }

// Fields that deviate from pass-through.
// Fixed value  → write the value directly.
// Custom logic → write a function (input) => ...
const OVERRIDES: Partial<{ [K in keyof PositionImport]: Resolver<PositionImport[K]> }> = {
  // ── Fixed values ──────────────────────────────────────────────
  cust_solution:         { externalCode: '' },
  description:           '&&NO_OVERWRITE&&',
  effectiveStatus:       'A',
  cust_scheduledEndDate: '&&NO_OVERWRITE&&',
  cust_min:              '&&NO_OVERWRITE&&',
  cust_mid:              '&&NO_OVERWRITE&&',
  cust_max:              '&&NO_OVERWRITE&&',
  vacant:                false,
  cust_assignType:       { externalCode: '' },
  standardHours:         38.75,
  targetFTE:             1,
  type:                  { code: 'C1' },

  // ── Custom logic ──────────────────────────────────────────────
  // e.g. externalName: (input) => ({ ...input.externalName, defaultValue: input.externalName?.ja_JP }),
}

const RESOLVERS = { ...passThrough, ...OVERRIDES }

function apply<T>(resolver: Resolver<T>, input: PositionImportInput): T | undefined {
  return typeof resolver === 'function'
    ? (resolver as (i: PositionImportInput) => T | undefined)(input)
    : resolver
}

// All fields are always resolved (passThrough covers everything), so return type is PositionImport.
export function toPositionImport(input: PositionImportInput): PositionImport {
  return Object.fromEntries(
    Object.entries(RESOLVERS).map(([key, resolver]) => [
      key,
      apply(resolver as Resolver<unknown>, input),
    ])
  ) as PositionImport
}

export function parsePositionImport(input: PositionImportInput): PositionImport {
  return PositionImportSchema.parse(toPositionImport(input))
}
