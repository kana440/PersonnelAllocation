import { useState, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { TABLE_REGISTRY, getTableData, type TableKey } from './tableRegistry'
import { MasterTable } from './MasterTable'

interface Props {
  onClose: () => void
}

const GROUPS = [...new Set(TABLE_REGISTRY.map(t => t.group))]

export function MasterBrowserPanel({ onClose }: Props) {
  const { masters, masterWarnings } = useStore()
  const [selectedKey, setSelectedKey] = useState<TableKey>('afterOrgs')
  const [warningsExpanded, setWarningsExpanded] = useState(true)

  const data = useMemo(
    () => getTableData(selectedKey, masters),
    [selectedKey, masters],
  )

  const selectedDef = TABLE_REGISTRY.find(t => t.key === selectedKey)!
  const warnCount   = masterWarnings.length
  const catACount   = masterWarnings.filter(w => w.category === 'A').length
  const catBCount   = masterWarnings.filter(w => w.category === 'B').length

  return (
    <div
      className="fixed z-40 bg-white border border-gray-300 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{ top: 64, right: 16, bottom: 16, width: 860 }}
    >
      {/* ヘッダー */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-gray-800 text-white rounded-t-xl">
        <span className="text-sm font-semibold">テーブル参照</span>

        {warnCount > 0 && (
          <span className="flex items-center gap-1 text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
            ⚠ {warnCount} 件の整合性問題
          </span>
        )}

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

      {/* マスタ整合性警告エリア */}
      {warnCount > 0 && (
        <div className="flex-shrink-0 border-b border-amber-200 bg-amber-50">
          <button
            className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-amber-100 transition-colors"
            onClick={() => setWarningsExpanded(v => !v)}
          >
            <span className="text-amber-700 font-semibold text-xs">⚠ マスタ整合性の問題</span>
            <span className="text-xs text-amber-600">
              参照整合（A）: {catACount} 件　給与等級導出（B）: {catBCount} 件
            </span>
            <span className="ml-auto text-amber-500 text-xs">{warningsExpanded ? '▲ 折りたたむ' : '▼ 展開'}</span>
          </button>
          {warningsExpanded && (
            <div className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
              {masterWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px]">
                  <span className={`flex-shrink-0 mt-0.5 font-bold ${w.category === 'B' ? 'text-orange-600' : 'text-amber-600'}`}>
                    [{w.category}]
                  </span>
                  <span className="text-amber-900 leading-relaxed">{w.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* テーブル本体 */}
      <div className="flex-1 overflow-hidden">
        <MasterTable data={data} />
      </div>
    </div>
  )
}
