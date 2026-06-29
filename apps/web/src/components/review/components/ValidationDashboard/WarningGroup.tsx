import { useState }       from 'react'
import { makeWarningKey } from '@personnel/domain/acknowledgment'
import type { IssueGroup, IssueInstance } from './types'

interface Props {
  group:          IssueGroup
  acknowledged:   Set<string>    // confirmed warningKeys
  onAcknowledge:  (key: string) => void
  onUnacknowledge:(key: string) => void
}

export function WarningGroup({ group, acknowledged, onAcknowledge, onUnacknowledge }: Props) {
  const [expanded, setExpanded] = useState(false)

  const keys       = group.instances.map(i => makeWarningKey(i.rowId, group.message))
  const doneCount  = keys.filter(k => acknowledged.has(k)).length
  const allDone    = doneCount === keys.length && keys.length > 0

  const handleAcknowledgeAll = () => {
    keys.forEach(k => { if (!acknowledged.has(k)) onAcknowledge(k) })
  }
  const handleUnacknowledgeAll = () => {
    keys.forEach(k => { if (acknowledged.has(k)) onUnacknowledge(k) })
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${allDone ? 'border-green-200' : 'border-orange-200'}`}>
      {/* ヘッダー行 */}
      <div className={`flex items-center gap-2 px-3 py-2 ${allDone ? 'bg-green-50' : 'bg-orange-50'}`}>
        <button onClick={() => setExpanded(v => !v)} className="flex-shrink-0 text-gray-400 text-[10px]">
          {expanded ? '▾' : '▸'}
        </button>
        <span className={`font-bold text-[11px] ${allDone ? 'text-green-600' : 'text-orange-500'}`}>
          {allDone ? '✓' : '⚠'}
        </span>
        <span className="flex-1 text-xs font-medium text-gray-700">{group.message}</span>
        <span className={`text-[10px] font-semibold ${allDone ? 'text-green-600' : 'text-orange-600'}`}>
          {doneCount}/{keys.length}
        </span>
        {!allDone ? (
          <button
            onClick={handleAcknowledgeAll}
            className="text-[10px] px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
          >
            全件OK ✓
          </button>
        ) : (
          <button
            onClick={handleUnacknowledgeAll}
            className="text-[10px] px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            取り消し
          </button>
        )}
      </div>

      {/* 展開: インスタンス一覧 */}
      {expanded && (
        <div className="px-3 py-1.5 space-y-0.5 bg-white">
          {group.instances.map((inst, idx) => (
            <InstanceRow
              key={inst.rowId}
              inst={inst}
              index={idx}
              warningKey={makeWarningKey(inst.rowId, group.message)}
              acknowledged={acknowledged}
              onAcknowledge={onAcknowledge}
              onUnacknowledge={onUnacknowledge}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InstanceRow({ inst, index: _index, warningKey, acknowledged, onAcknowledge, onUnacknowledge }: {
  inst:           IssueInstance
  index:          number
  warningKey:     string
  acknowledged:   Set<string>
  onAcknowledge:  (key: string) => void
  onUnacknowledge:(key: string) => void
}) {
  const isDone = acknowledged.has(warningKey)
  return (
    <div className={`flex items-center gap-1.5 text-[11px] rounded px-1 py-0.5 ${isDone ? 'text-gray-400' : 'text-gray-600'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDone ? 'bg-green-400' : 'bg-orange-400'}`} />
      <span className={`font-medium flex-1 ${isDone ? 'line-through' : ''}`}>
        {inst.personName || '（空席）'}
      </span>
      {inst.orgCode && <span className="text-gray-400 text-[10px]">{inst.orgCode}</span>}
      <button
        onClick={() => isDone ? onUnacknowledge(warningKey) : onAcknowledge(warningKey)}
        className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
          isDone
            ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            : 'text-green-700 hover:bg-green-50'
        }`}
      >
        {isDone ? '✕' : 'OK'}
      </button>
    </div>
  )
}
