import type { OperationBadge } from '@personnel/domain/commands/defs/badge'

export interface BadgeDisplayInfo {
  color: string
  label: string
}

export const BADGE_DISPLAY_INFO: Record<OperationBadge, BadgeDisplayInfo> = {
  positive:   { color: 'bg-green-100 text-green-700',   label: '昇格・復職' },
  negative:   { color: 'bg-red-100 text-red-600',       label: '降格・解除' },
  transfer:   { color: 'bg-blue-100 text-blue-700',     label: '組織異動' },
  jobChange:  { color: 'bg-purple-100 text-purple-700', label: '職務変更' },
  secondment: { color: 'bg-amber-100 text-amber-700',   label: '出向' },
  concurrent: { color: 'bg-cyan-100 text-cyan-700',     label: '兼務' },
  neutral:    { color: 'bg-gray-100 text-gray-600',     label: '変更なし' },
}

export const OPERATION_BADGE_COLORS: Record<OperationBadge, string> = Object.fromEntries(
  (Object.entries(BADGE_DISPLAY_INFO) as [OperationBadge, BadgeDisplayInfo][]).map(
    ([k, v]) => [k, v.color]
  )
) as Record<OperationBadge, string>

export const ALL_OPERATION_BADGES: OperationBadge[] = Object.keys(BADGE_DISPLAY_INFO) as OperationBadge[]
