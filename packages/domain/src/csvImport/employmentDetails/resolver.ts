import type { EmploymentDetailsImport } from './schema'
import { EmploymentDetailsImportSchema } from './schema'

// Input has the same field shape as EmploymentDetailsImport.
// Default: every field is passed through from input as-is.
// Add to OVERRIDES only when the value should differ from input.
export type EmploymentDetailsImportInput = EmploymentDetailsImport

type Resolver<T> = T | ((input: EmploymentDetailsImportInput) => T | undefined)

// Auto-generated pass-through: each schema field → input[field]
const passThrough = Object.fromEntries(
  Object.keys(EmploymentDetailsImportSchema.shape).map(k => [
    k,
    (input: EmploymentDetailsImportInput) => input[k as keyof EmploymentDetailsImport],
  ])
) as { [K in keyof EmploymentDetailsImport]: Resolver<EmploymentDetailsImport[K]> }

// Fields that deviate from pass-through.
// Fixed value  → write the value directly.
// Custom logic → write a function (input) => ...
const OVERRIDES: Partial<{ [K in keyof EmploymentDetailsImport]: Resolver<EmploymentDetailsImport[K]> }> = {
  // ── Fixed values ──────────────────────────────────────────────

  // ── Custom logic ──────────────────────────────────────────────
}

const RESOLVERS = { ...passThrough, ...OVERRIDES }

function apply<T>(resolver: Resolver<T>, input: EmploymentDetailsImportInput): T | undefined {
  return typeof resolver === 'function'
    ? (resolver as (i: EmploymentDetailsImportInput) => T | undefined)(input)
    : resolver
}

export function toEmploymentDetailsImport(input: EmploymentDetailsImportInput): EmploymentDetailsImport {
  return Object.fromEntries(
    Object.entries(RESOLVERS).map(([key, resolver]) => [
      key,
      apply(resolver as Resolver<unknown>, input),
    ])
  ) as EmploymentDetailsImport
}

export function parseEmploymentDetailsImport(input: EmploymentDetailsImportInput): EmploymentDetailsImport {
  return EmploymentDetailsImportSchema.parse(toEmploymentDetailsImport(input))
}
