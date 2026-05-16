import type { AllocationList } from './schema'
import { AllocationListSchema } from './schema'

// Input has the same field shape as AllocationList.
// Default: every field is passed through from input as-is.
// Add to OVERRIDES only when the value should differ from input.
export type AllocationListInput = AllocationList

type Resolver<T> = T | ((input: AllocationListInput) => T | undefined)

// Auto-generated pass-through: each schema field → input[field]
const passThrough = Object.fromEntries(
  Object.keys(AllocationListSchema.shape).map(k => [
    k,
    (input: AllocationListInput) => input[k as keyof AllocationList],
  ])
) as { [K in keyof AllocationList]: Resolver<AllocationList[K]> }

// Fields that deviate from pass-through.
// Fixed value  → write the value directly.
// Custom logic → write a function (input) => ...
const OVERRIDES: Partial<{ [K in keyof AllocationList]: Resolver<AllocationList[K]> }> = {
  // ── Custom logic ──────────────────────────────────────────────
  // e.g. managerPositionCode: (input) => input.managerPositionCode ?? deriveFromPosition(input),
}

const RESOLVERS = { ...passThrough, ...OVERRIDES }

function apply<T>(resolver: Resolver<T>, input: AllocationListInput): T | undefined {
  return typeof resolver === 'function'
    ? (resolver as (i: AllocationListInput) => T | undefined)(input)
    : resolver
}

export function toAllocationList(input: AllocationListInput): AllocationList {
  return Object.fromEntries(
    Object.entries(RESOLVERS).map(([key, resolver]) => [
      key,
      apply(resolver as Resolver<unknown>, input),
    ])
  ) as AllocationList
}

export function parseAllocationList(input: AllocationListInput): AllocationList {
  return AllocationListSchema.parse(toAllocationList(input))
}
