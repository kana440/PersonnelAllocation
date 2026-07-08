import { memo, useState, useMemo } from 'react'
import { PersonRow } from './PersonRow'
import type { CompactOrgSection } from './useCompactData'

interface Props {
  section:        CompactOrgSection
  onOrgClick:     (orgId: string, isOldSection: boolean) => void
  onPersonFocus:  (rowId: number) => void
  onDoubleClick:  (rowId: number) => void
}

export const OrgSection = memo(function OrgSection({ section, onOrgClick, onPersonFocus, onDoubleClick }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  // 2つの filter() を1回のループにまとめる
  const { changedCount, issueCount } = useMemo(() => {
    let changed = 0
    let issues  = 0
    for (const r of section.rows) {
      if (r.hasChanges) changed++
      if (r.hasIssues)  issues++
    }
    return { changedCount: changed, issueCount: issues }
  }, [section.rows])

  // フルパス（"_unmapped_" プレフィックスを除去）
  const fullPath = section.isUnmapped && section.orgPath.startsWith('_unmapped_')
    ? section.orgPath.slice(10)
    : section.orgPath || section.orgName

  // 葉ノード名と親パス部分に分割
  const pathParts  = fullPath.split(' › ')
  const leafName   = pathParts.at(-1) ?? fullPath
  const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join(' › ') : ''

  return (
    <div className={section.isOldSection ? 'border-l-2 border-amber-300' : ''}>
      {/* セクションヘッダー */}
      <div
        className={`flex items-start gap-1 px-2 py-1 sticky top-0 z-10 select-none transition-colors ${
          section.isOldSection
            ? 'bg-amber-50 hover:bg-amber-100'
            : 'bg-gray-100 hover:bg-gray-200'
        } ${section.orgId ? 'cursor-pointer' : 'cursor-default'}`}
        title={fullPath}
        onClick={() => { if (section.orgId) onOrgClick(section.orgId, section.isOldSection) }}
      >
        {/* 折りたたみトグル */}
        <button
          className="text-gray-400 w-3 text-[10px] flex-shrink-0 mt-0.5 hover:text-gray-700"
          onClick={e => { e.stopPropagation(); setCollapsed(v => !v) }}
        >
          {collapsed ? '▶' : '▼'}
        </button>

        {/* 組織名（2行：葉名 + 親パス） */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1">
            {/* 色だけに頼らず「旧」「旧のみ」「新のみ」「未設定」を明示するバッジ（a11y）。
                旧優先モードは通常セクションも含めて「旧」を常時表示する（色だけだと見落として
                旧データと気づかないまま編集してしまうのを防ぐため）。フェールオーバー
                （isUnmapped）のときは「旧のみ」に変えて、通常表示と区別する。 */}
            {section.isOldSection && (
              <span className="flex-shrink-0 text-[8px] px-1 rounded bg-amber-200 text-amber-800 border border-amber-400 leading-tight">
                {section.isUnmapped ? '旧のみ' : '旧'}
              </span>
            )}
            {section.isUnmapped && !section.isOldSection && section.orgCode && (
              <span className="flex-shrink-0 text-[8px] px-1 rounded bg-blue-100 text-blue-700 border border-blue-300 leading-tight">新のみ</span>
            )}
            {section.isUnmapped && !section.isOldSection && !section.orgCode && (
              <span className="flex-shrink-0 text-[8px] px-1 rounded bg-gray-200 text-gray-600 border border-gray-300 leading-tight">未設定</span>
            )}
            <div className={`text-[10px] font-semibold truncate leading-tight ${
              section.isOldSection ? 'text-amber-800' : 'text-gray-800'
            }`}>
              {leafName}
            </div>
          </div>
          {parentPath && (
            <div className="text-[9px] text-gray-400 truncate leading-tight">
              {parentPath}
            </div>
          )}
        </div>

        {/* バッジ（人数・変更・問題） */}
        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
          <span className="text-[9px] text-gray-400 whitespace-nowrap">{section.rows.length}人</span>
          {changedCount > 0 && (
            <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded border border-blue-200 whitespace-nowrap">
              {changedCount}変
            </span>
          )}
          {issueCount > 0 && (
            <span className="text-[9px] text-red-600 bg-red-50 px-1 rounded border border-red-200 whitespace-nowrap">
              ⚠{issueCount}
            </span>
          )}
        </div>
      </div>

      {/* 人物リスト */}
      {!collapsed && (
        <div>
          {section.rows.length === 0 ? (
            <div className="px-6 py-1 text-[10px] text-gray-300 italic">（該当なし）</div>
          ) : (
            section.rows.map(row => (
              <PersonRow
                key={row.rowId}
                row={row}
                fromOrgId={section.orgId}
                onFocus={onPersonFocus}
                onDoubleClick={onDoubleClick}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
})
