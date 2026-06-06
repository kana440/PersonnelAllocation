// 労働組合会員CD — AllocationList.unionFlag / Affiliation.isUnionMember
// Fixed 3-value enum: values are stable across all customers.
// Note: AllocationList.unionFlag currently stores '○'/'' (boolean); this enum
// captures the full SF code when the field is used as a select list.
export const UNION_MEMBER_CODE = {
  MEMBER:         '組合員',
  SPECIAL_MEMBER: '特別組合員',
  NON_MEMBER:     '非組合員',
} as const

export type UnionMemberCode = typeof UNION_MEMBER_CODE[keyof typeof UNION_MEMBER_CODE]
export const UNION_MEMBER_CODES = Object.values(UNION_MEMBER_CODE) as UnionMemberCode[]
