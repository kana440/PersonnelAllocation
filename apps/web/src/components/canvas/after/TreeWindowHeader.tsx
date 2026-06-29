import type { PanelDef }        from '../../../store/canvasLayoutStore'
import { useStore }             from '../../../store/useStore'
import { AddRowDropdown }       from '../AddRowDropdown'
import { Tooltip }              from '../../common/Tooltip'
import type { Organization }    from '@personnel/domain/schemas'
import type React               from 'react'

interface TreeWindowHeaderProps {
  panel:              PanelDef
  rootPath:           string[]
  organizations:      Organization[]
  currentOrg:         Organization | undefined
  totalCount:         number
  headerBg:           string
  onToggleOpen:       () => void
  onNavigateToIdx:    (idx: number) => void
  onHeaderMouseDown:  (e: React.MouseEvent) => void
}

export function TreeWindowHeader({
  panel, rootPath, organizations, currentOrg, totalCount,
  headerBg, onToggleOpen, onNavigateToIdx, onHeaderMouseDown,
}: TreeWindowHeaderProps) {
  const selectOrg = useStore(s => s.selectOrg)

  return (
    <div
      onMouseDown={onHeaderMouseDown}
      onClick={() => selectOrg(panel.orgId)}
      className="flex-shrink-0 flex flex-col cursor-grab active:cursor-grabbing"
      style={{ background: headerBg, userSelect: 'none' }}
    >
      <div className="flex items-center gap-1 px-2" style={{ height: 28 }}>
        <div className="flex-1 flex items-center gap-0.5 min-w-0 overflow-hidden">
          {rootPath.length > 1 ? (
            rootPath.map((id, i) => {
              const o      = organizations.find(o => o.id === id)
              const isLast = i === rootPath.length - 1
              const name   = o?.name ?? id
              return (
                <span key={id} className="flex items-center gap-0.5 flex-shrink-0">
                  {i > 0 && <span className="text-blue-300 text-[9px]">/</span>}
                  <Tooltip label={name}>
                    <button
                      onClick={() => onNavigateToIdx(i)}
                      className={`text-[10px] max-w-[5rem] truncate ${
                        isLast ? 'font-semibold text-white cursor-default' : 'text-blue-200 hover:text-white'
                      }`}
                    >{name}</button>
                  </Tooltip>
                </span>
              )
            })
          ) : (
            <Tooltip label={currentOrg?.name ?? panel.orgId}>
              <span className="text-xs font-semibold text-white truncate">{currentOrg?.name ?? panel.orgId}</span>
            </Tooltip>
          )}
          <span className="text-[10px] text-blue-200 flex-shrink-0 ml-0.5">({totalCount})</span>
          <AddRowDropdown orgCode={currentOrg?.externalCode ?? ''} variant="header" />
        </div>
        <div className="flex items-center flex-shrink-0">
          {rootPath.length > 1 && (
            <button
              onClick={() => onNavigateToIdx(rootPath.length - 2)}
              className="w-5 h-5 flex items-center justify-center text-[10px] text-blue-200 hover:text-white hover:bg-blue-700 rounded transition-colors"
              title="一つ上へ"
            >↑</button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onToggleOpen() }}
            title={panel.open ? '折りたたむ' : '展開'}
            className="w-7 h-7 flex items-center justify-center text-white hover:bg-blue-700 text-xs transition-colors"
          >{panel.open ? '─' : '▲'}</button>
        </div>
      </div>
    </div>
  )
}
