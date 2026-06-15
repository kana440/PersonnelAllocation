import { useState, useEffect } from 'react'
import { useOrgView } from '../OrgViewContext'
import { subtreeRowCount } from '../panel/helpers'
import { TreeNode } from './TreeNode'

interface TreeWindowProps {
  orgId:      string
  panelId:    string
  colorIndex: number
  onRemove:   () => void
}

export function TreeWindow({ orgId, panelId, onRemove }: TreeWindowProps) {
  const {
    organizations, positionTreeByOrgId,
    dragOverOrgId, handleDragOver, handleDragLeave, handleDrop,
  } = useOrgView()

  const [rootPath, setRootPath] = useState<string[]>([orgId])

  // パネルの orgId が変わったらパスをリセット
  useEffect(() => { setRootPath([orgId]) }, [orgId])

  const currentRootId = rootPath[rootPath.length - 1]
  const currentOrg    = organizations.find(o => o.id === currentRootId)
  const totalCount    = subtreeRowCount(currentRootId, organizations, positionTreeByOrgId)
  const isDragOver    = dragOverOrgId === currentRootId

  const navigateTo = (childOrgId: string) =>
    setRootPath(prev => [...prev, childOrgId])

  const navigateToIndex = (idx: number) =>
    setRootPath(prev => prev.slice(0, idx + 1))

  return (
    <div
      className={`flex-shrink-0 w-72 max-h-full flex flex-col border-2 rounded-xl shadow-sm transition-colors
        ${isDragOver ? 'border-blue-400 bg-blue-50/30' : 'border-gray-200 bg-white'}`}
      onDragOver={e => handleDragOver(e, currentRootId)}
      onDragLeave={handleDragLeave}
      onDrop={e => handleDrop(e, currentRootId)}
    >
      {/* ヘッダー */}
      <div className="flex-shrink-0 px-2 py-1.5 border-b border-gray-200">
        {/* パンくず（ドリルダウン時のみ） */}
        {rootPath.length > 1 && (
          <div className="flex items-center gap-0.5 mb-1 min-w-0">
            <button
              onClick={() => navigateToIndex(rootPath.length - 2)}
              className="flex-shrink-0 text-[10px] text-blue-500 hover:text-blue-700 px-0.5"
              title="一つ上の組織へ"
            >↑</button>
            <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
              {rootPath.map((id, i) => {
                const o      = organizations.find(o => o.id === id)
                const isLast = i === rootPath.length - 1
                return (
                  <span key={id} className="flex items-center gap-0.5 flex-shrink-0">
                    {i > 0 && <span className="text-gray-300 text-[9px]">/</span>}
                    <button
                      onClick={() => navigateToIndex(i)}
                      className={`text-[10px] max-w-[5rem] truncate ${
                        isLast
                          ? 'font-semibold text-gray-800 cursor-default'
                          : 'text-blue-500 hover:text-blue-700'
                      }`}
                    >{o?.name ?? id}</button>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* 現在のルート組織名 */}
        <div className="flex items-center gap-1.5">
          <span className="flex-1 text-xs font-semibold text-gray-800 truncate">
            {currentOrg?.name ?? currentRootId}
          </span>
          <span className="text-[10px] text-gray-400 flex-shrink-0">{totalCount}名</span>
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-gray-600 text-[10px] flex-shrink-0 ml-0.5"
            title="ウィンドウを閉じる"
          >✕</button>
        </div>
      </div>

      {/* ツリー本体 */}
      <div className="flex-1 overflow-y-auto p-1.5 min-h-0">
        {currentOrg ? (
          <TreeNode
            orgId={currentRootId}
            treeId={panelId}
            depth={0}
            onNavigate={navigateTo}
            isRoot
          />
        ) : (
          <div className="text-xs text-gray-400 text-center py-4">組織が見つかりません</div>
        )}
      </div>
    </div>
  )
}
