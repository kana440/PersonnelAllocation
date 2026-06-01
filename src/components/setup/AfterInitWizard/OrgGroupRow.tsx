import type { Organization }    from '../../../domain/schemas'
import type { OrgMappingGroup } from '../../../domain/setup/afterInit'

interface Props {
  group:      OrgMappingGroup
  allOrgs:    Organization[]
  onChange:   (prevCode: string | null, newOrgCode: string | null) => void
}

export function OrgGroupRow({ group, allOrgs, onChange }: Props) {
  const { prevCode, prevOrgName, newOrgCode, autoMatched, rowIds } = group
  const activeOrgs = allOrgs.filter(o => !o.isAbandoned)

  const isNewHire = prevCode === null

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(prevCode, e.target.value || null)
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
      isNewHire      ? 'border-gray-200 bg-gray-50'
      : autoMatched  ? 'border-green-200 bg-green-50'
      :                'border-orange-200 bg-orange-50'
    }`}>
      {/* 旧組織 */}
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${isNewHire ? 'text-gray-400 italic' : 'text-gray-700'}`}>
          {isNewHire ? '（旧コードなし / 新入社員）' : (prevOrgName ?? prevCode)}
        </div>
        {!isNewHire && prevCode && prevOrgName !== prevCode && (
          <div className="text-[10px] text-gray-400 font-mono mt-0.5">{prevCode}</div>
        )}
      </div>

      <span className="flex-shrink-0 text-gray-400">→</span>

      {/* 新組織セレクト */}
      <div className="flex-shrink-0 w-48">
        {isNewHire ? (
          <span className="text-gray-400 italic text-[10px]">後で個別設定</span>
        ) : (
          <select
            value={newOrgCode ?? ''}
            onChange={handleChange}
            className={`w-full border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-blue-400 ${
              newOrgCode
                ? autoMatched
                  ? 'border-green-300 bg-white text-green-700'
                  : 'border-blue-300 bg-white text-blue-700'
                : 'border-orange-300 bg-orange-50 text-orange-600'
            }`}
          >
            <option value="">（後で設定）</option>
            {activeOrgs.map(o => (
              <option key={o.id} value={o.externalCode ?? o.id}>
                {o.name}{o.externalCode ? ` (${o.externalCode})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 人数バッジ */}
      <span className="flex-shrink-0 text-[10px] text-gray-400 whitespace-nowrap">
        {rowIds.length}人
      </span>

      {/* 状態アイコン */}
      <span className="flex-shrink-0 text-[10px] w-4 text-center">
        {isNewHire  ? ''
        : newOrgCode ? '✓'
        :              '⚠'}
      </span>
    </div>
  )
}
