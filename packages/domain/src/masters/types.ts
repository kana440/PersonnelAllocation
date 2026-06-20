// Base type for all code list entries — code is the value stored in AllocationList/domain fields
export interface CodeEntry {
  code:  string
  label: string
}

// Type helper for runtime code list arrays (populated from master data imports)
export type MasterList<T extends CodeEntry = CodeEntry> = readonly T[]
