import { useState, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { OrgSearchSidebar } from './OrgSearchSidebar'
import { BeforeOrgSearchSidebar } from './BeforeOrgSearchSidebar'

export function LeftSidebar() {
  const comparisonMode     = useCanvasLayoutStore(s => s.comparisonMode)
  const selectedCardSource = useStore(s => s.selectedCardSource)
  const [activeTab, setActiveTab] = useState<'after' | 'before'>('after')

  useEffect(() => {
    if (selectedCardSource === 'before') setActiveTab('before')
    else if (selectedCardSource === 'after') setActiveTab('after')
  }, [selectedCardSource])

  if (!comparisonMode) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <OrgSearchSidebar />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* タブヘッダー */}
      <div className="flex-shrink-0 flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('after')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'after'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          新組織
        </button>
        <button
          onClick={() => setActiveTab('before')}
          className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'before'
              ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          旧組織
        </button>
      </div>

      {/* タブコンテンツ（両方常時マウントし CSS で切り替え → expandedOrgIds 状態を保持） */}
      <div className="flex-1 overflow-hidden min-h-0 relative">
        <div className={activeTab === 'after' ? 'absolute inset-0' : 'hidden'}>
          <OrgSearchSidebar />
        </div>
        <div className={activeTab === 'before' ? 'absolute inset-0' : 'hidden'}>
          <BeforeOrgSearchSidebar />
        </div>
      </div>
    </div>
  )
}
