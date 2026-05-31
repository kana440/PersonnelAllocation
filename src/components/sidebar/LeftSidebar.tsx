import { useState } from 'react'
import { useUserSession }    from '../../store/useUserSession'
import { OrgSearchSidebar }  from './OrgSearchSidebar'
import { PanelTabContent }   from '../canvas/StripBar'

type Tab = 'tree' | 'panels'

function defaultTab(rowScope: string | null): Tab {
  // 担当者（rowScope あり）は組織パネルをデフォルト
  // 管理者（rowScope なし）は組織・人物をデフォルト
  return rowScope !== null ? 'panels' : 'tree'
}

export function LeftSidebar() {
  const { capabilities } = useUserSession()
  const [activeTab, setActiveTab] = useState<Tab>(() => defaultTab(capabilities.rowScope))

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
