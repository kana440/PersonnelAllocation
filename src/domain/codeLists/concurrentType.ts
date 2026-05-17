// 本務兼務区分 — AllocationList.concurrentType / Affiliation.type
// Fixed 2-value enum — maps directly to Affiliation.type ('primary' | 'concurrent')
export const CONCURRENT_TYPE = {
  PRIMARY:    '本務',
  CONCURRENT: '兼務',
  SECONDARY: '出向箱',
} as const

export type ConcurrentType = typeof CONCURRENT_TYPE[keyof typeof CONCURRENT_TYPE]
export const CONCURRENT_TYPES = Object.values(CONCURRENT_TYPE) as ConcurrentType[]
