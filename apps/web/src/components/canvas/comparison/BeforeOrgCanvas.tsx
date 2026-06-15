import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import { BeforeOrgWindow } from './BeforeOrgWindow'

interface Props {
  beforeOrgs:     Organization[]
  allocationList: AllocationRow[]
}

export function BeforeOrgCanvas({ beforeOrgs, allocationList }: Props) {
  if (beforeOrgs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-stone-400 text-sm">
        旧組織を読み込んでいます...
      </div>
    )
  }

  // 親が beforeOrgs 内に存在しないものがルート
  const orgIdSet = new Set(beforeOrgs.map(o => o.id))
  const roots = beforeOrgs.filter(o => !o.parentId || !orgIdSet.has(o.parentId))

  return (
    <div className="h-full overflow-auto bg-[#eae6e2] p-4">
      {/* ラベル */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">旧組織</span>
        <span className="text-[10px] text-stone-400">各ウィンドウをドラッグして右側の新組織にドロップ</span>
      </div>

      {/* 階層ツリー（ルートを縦に並べる） */}
      <div className="flex flex-col gap-3">
        {roots.map(org => (
          <BeforeOrgWindow
            key={org.id}
            beforeOrg={org}
            allBeforeOrgs={beforeOrgs}
            allocationList={allocationList}
          />
        ))}
      </div>
    </div>
  )
}
