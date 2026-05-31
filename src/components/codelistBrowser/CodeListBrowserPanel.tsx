import { useState, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { TABLE_REGISTRY, getTableData, type TableKey } from './tableRegistry'
import { CodeListTable } from './CodeListTable'

interface Props {
  onClose: () => void
}

const GROUPS = [...new Set(TABLE_REGISTRY.map(t => t.group))]

export function CodeListBrowserPanel({ onClose }: Props) {
  const { codeLists, beforeOrganizations, afterOrganizations } = useStore()
  const [selectedKey, setSelectedKey] = useState<TableKey>('beforeOrgs')

  const data = useMemo(
    () => getTableData(selectedKey, codeLists, beforeOrganizations, afterOrganizations),
    [selectedKey, codeLists, beforeOrganizations, afterOrganizations],
  )

  const selectedDef = TABLE_REGISTRY.find(t => t.key === selectedKey)!

  return (
    <div
      className="fixed z-40 bg-white border border-gray-300 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{ top: 64, right: 16, bottom: 16, width: 860 }}
    >
      {/* ヘッダー */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-gray-800 text-white rounded-t-xl">
        <span className="text-sm font-semibold">テーブル参照</span>

        {/* テーブル選択コンボボックス */}
        <select
          value={selectedKey}
          onChange={e => setSelectedKey(e.target.value as TableKey)}
          className="ml-2 text-xs bg-gray-700 text-white border border-gray-500 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {GROUPS.map(group => (
            <optgroup key={group} label={group}>
              {TABLE_REGISTRY.filter(t => t.group === group).map(t => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </optgroup>
          ))}
        </select>

        <span className="text-xs text-gray-400">{selectedDef.label}</span>
        <span className="text-xs text-gray-500 tabular-nums">{data.length} 件</span>

        <button
          onClick={onClose}
          className="ml-auto text-gray-400 hover:text-white text-lg leading-none px-1"
          title="閉じる"
        >✕</button>
      </div>

      {/* テーブル本体 */}
      <div className="flex-1 overflow-hidden">
        <CodeListTable data={data} />
      </div>
    </div>
  )
}
