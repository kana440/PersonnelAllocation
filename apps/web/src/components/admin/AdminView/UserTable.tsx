import type { AdminUser, UserRole } from '../../../infrastructure/api/adminApi'

interface Props {
  users:    AdminUser[]
  onEdit:   (user: AdminUser) => void
  onDelete: (user: AdminUser) => void
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '全権管理者',
  admin:       '取りまとめ担当',
  assignee:    '組織担当',
}

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin:       'bg-blue-100 text-blue-700',
  assignee:    'bg-gray-100 text-gray-600',
}

function ScopeLabel({ policy }: { policy: AdminUser['policy'] }) {
  if (!policy.orgLevelMin && !policy.orgCodes) {
    return <span className="text-gray-400 text-xs">全組織</span>
  }
  const parts: string[] = []
  if (policy.orgLevelMin) parts.push(`Lv.${policy.orgLevelMin}以上`)
  if (policy.orgCodes?.length) parts.push(policy.orgCodes.slice(0, 3).join(', ') + (policy.orgCodes.length > 3 ? '…' : ''))
  return <span className="text-xs text-gray-700">{parts.join(' / ')}</span>
}

export function UserTable({ users, onEdit, onDelete }: Props) {
  if (users.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        ユーザーがいません
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-52">表示名</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">メール</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-36">ロール</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">アクセス範囲</th>
            <th className="px-4 py-2.5 w-24" />
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
              <td className="px-4 py-3 text-gray-500">{u.email}</td>
              <td className="px-4 py-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                  {ROLE_LABELS[u.role]}
                </span>
              </td>
              <td className="px-4 py-3">
                <ScopeLabel policy={u.policy} />
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => onEdit(u)}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => onDelete(u)}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline"
                  >
                    削除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
