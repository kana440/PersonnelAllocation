import type { PanelDef }        from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import { AddRowDropdown }       from '../AddRowDropdown'
import type { Organization }    from '@personnel/domain/schemas'
import type React               from 'react'

interface TreeWindowHeaderProps {
  panel:             PanelDef
  currentOrg:        Organization | undefined
  totalCount:        number
  headerBg:          string
  onFocusParent?:    () => void
  onHeaderMouseDown: (e: React.MouseEvent) => void
}

export function TreeWindowHeader({
  panel, currentOrg, totalCount, headerBg, onFocusParent, onHeaderMouseDown,
}: TreeWindowHeaderProps) {
  const selectOrg = useStore(s => s.selectOrg)

  return (
    <div
      onMouseDown={onHeaderMouseDown}
      onClick={() => selectOrg(panel.orgId)}
      className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
      style={{ background: headerBg, userSelect: 'none' }}
    >
      {/* 1行目: 組織コード + 人数 + 親フォーカス + 追加 */}
      <div className="flex items-center gap-1 px-2 pt-1">
        <span className="text-[10px] text-blue-200 font-mono flex-1 truncate min-w-0">
          {currentOrg?.externalCode ?? panel.orgId}
        </span>
        <span className="text-[10px] text-blue-200 flex-shrink-0">({totalCount})</span>
        {onFocusParent && (
          <button
            onClick={e => { e.stopPropagation(); onFocusParent() }}
            title="親組織へ"
            className="w-5 h-5 flex items-center justify-center text-[10px] text-blue-200 hover:text-white hover:bg-blue-700 rounded transition-colors flex-shrink-0"
          >↑</button>
        )}
        <AddRowDropdown orgCode={currentOrg?.externalCode ?? ''} variant="header" />
      </div>
      {/* 2行目: 組織名 */}
      <div className="px-2 pb-1">
        <span className="text-xs font-semibold text-white block truncate">
          {currentOrg?.name ?? panel.orgId}
        </span>
      </div>
    </div>
  )
}
