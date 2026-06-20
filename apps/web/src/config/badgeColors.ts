import type { OperationBadge } from '@personnel/domain/commands/defs/badge'

export const OPERATION_BADGE_COLORS: Record<OperationBadge, string> = {
  positive:   'bg-green-100 text-green-700',
  negative:   'bg-red-100 text-red-600',
  transfer:   'bg-blue-100 text-blue-700',
  jobChange:  'bg-purple-100 text-purple-700',
  secondment: 'bg-amber-100 text-amber-700',
  concurrent: 'bg-cyan-100 text-cyan-700',
  neutral:    'bg-gray-100 text-gray-600',
}
