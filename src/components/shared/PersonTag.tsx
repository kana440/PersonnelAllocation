interface Props {
  name: string
  userId?: string
  orgName?: string
  badge?: string
  badgeColor?: 'blue' | 'purple' | 'orange' | 'amber'
  avatarColor?: 'blue' | 'gray' | 'amber'
}

const AVATAR_COLORS = {
  blue:  'bg-blue-100 text-blue-700',
  gray:  'bg-gray-100 text-gray-600',
  amber: 'bg-amber-100 text-amber-700',
}

const BADGE_COLORS = {
  blue:   'bg-blue-50 text-blue-600 border-blue-200',
  purple: 'bg-purple-50 text-purple-600 border-purple-200',
  orange: 'bg-orange-50 text-orange-600 border-orange-200',
  amber:  'bg-amber-50 text-amber-600 border-amber-200',
}

export function PersonTag({
  name,
  userId,
  orgName,
  badge,
  badgeColor = 'blue',
  avatarColor = 'blue',
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${AVATAR_COLORS[avatarColor]}`}>
        {name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{name}</span>
          {badge && (
            <span className={`text-xs px-1.5 py-0.5 rounded border ${BADGE_COLORS[badgeColor]}`}>
              {badge}
            </span>
          )}
        </div>
        {(orgName || userId) && (
          <div className="text-xs text-gray-400 flex gap-2">
            {orgName && <span>{orgName}</span>}
            {userId && <span className="font-mono">{userId}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
