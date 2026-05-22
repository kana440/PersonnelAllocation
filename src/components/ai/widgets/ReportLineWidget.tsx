import type { ReportLineMember } from '../types'
import { PersonTag } from '../../shared/PersonTag'

interface Props {
  managerName: string
  managerOrgName: string
  members: ReportLineMember[]
}

export function ReportLineWidget({ managerName, managerOrgName, members }: Props) {
  if (members.length === 0) return null

  const sameOrg  = members.filter(m =>  m.isSameOrg)
  const crossOrg = members.filter(m => !m.isSameOrg)

  return (
    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100">
        {managerName}（{managerOrgName}）の直属レポート
      </div>
      <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
        {sameOrg.map(m => (
          <div key={m.userId} className="px-3 py-2.5">
            <PersonTag
              name={m.name}
              userId={m.userId}
              orgName={m.orgName}
            />
          </div>
        ))}
        {crossOrg.length > 0 && (
          <>
            <div className="px-3 py-1.5 bg-purple-50 text-xs text-purple-600 font-medium">
              他組織メンバー（点線レポート）
            </div>
            {crossOrg.map(m => (
              <div key={m.userId} className="px-3 py-2.5">
                <PersonTag
                  name={m.name}
                  userId={m.userId}
                  orgName={m.orgName}
                  badge="他組織"
                  badgeColor="purple"
                />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
