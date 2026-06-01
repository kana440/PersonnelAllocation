import { useState, useEffect } from 'react'
import { useUserSession }    from '../../store/useUserSession'
import { OrgSearchSidebar }  from './OrgSearchSidebar'
import { PanelTabContent }   from '../canvas/StripBar'

type Tab = 'tree' | 'panels'

export function LeftSidebar() {
  const { session } = useUserSession()
  const [activeTab, setActiveTab] = useState<Tab>(
    () => session.role === 'assignee' ? 'panels' : 'tree'
  )

  // セッション変更（ロール切り替え）時に確実にタブを合わせる
  const role = session.role
  useEffect(() => {
    setActiveTab(role === 'assignee' ? 'panels' : 'tree')
  }, [role])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* タブヘッダー */}
      <div className="flex flex-shrink-0 border-b border-gray-200">
        <TabButton
          label="組織・人物"
          active={activeTab === 'tree'}
          onClick={() => setActiveTab('tree')}
        />
        <TabButton
          label="組織パネル"
          active={activeTab === 'panels'}
          onClick={() => setActiveTab('panels')}
        />
      </div>

      {/* タブコンテンツ */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'tree'   && <OrgSearchSidebar />}
        {activeTab === 'panels' && <PanelTabContent />}
      </div>
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 text-xs font-medium transition-colors border-b-2 ${
        active
          ? 'border-blue-500 text-blue-600 bg-white'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}
