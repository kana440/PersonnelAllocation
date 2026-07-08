import { useState } from 'react'
import type { MergeHistoryEntry, MergeHistoryRowSummary } from '../../infrastructure/workspace'

const OUTCOME_LABEL: Record<MergeHistoryRowSummary['outcome'], string> = {
  committed: '反映',
  confirmed: '確認済み',
  rejected:  '却下',
  returned:  '差し戻し',
  abandoned: '未解決のまま終了',
}
const OUTCOME_BADGE_CLS: Record<MergeHistoryRowSummary['outcome'], string> = {
  committed: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-gray-100 text-gray-500',
  rejected:  'bg-gray-200 text-gray-600',
  returned:  'bg-amber-100 text-amber-700',
  abandoned: 'bg-red-100 text-red-700',
}

function summarizeCounts(rows: MergeHistoryRowSummary[]): string {
  const counts = new Map<MergeHistoryRowSummary['outcome'], number>()
  for (const r of rows) counts.set(r.outcome, (counts.get(r.outcome) ?? 0) + 1)
  return [...counts.entries()]
    .map(([outcome, n]) => `${OUTCOME_LABEL[outcome]} ${n}件`)
    .join(' ・ ')
}

function HistoryEntryRow({ entry }: { entry: MergeHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50"
      >
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
          entry.endReason === 'released' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'
        }`}>
          {entry.mode === 'rebase' ? 'リベース' : 'マージ'}・{entry.endReason === 'released' ? 'リリース済み' : '破棄'}
        </span>
        <span className="text-xs font-medium text-gray-800 truncate">{entry.sourceFileName}</span>
        <span className="text-[10px] text-gray-400 flex-shrink-0 ml-auto">
          {new Date(entry.endedAt).toLocaleString('ja-JP')}
        </span>
        <span className="text-gray-400 text-xs flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>
      <div className="px-4 pb-2 text-[11px] text-gray-500">{summarizeCounts(entry.rows)}</div>
      {expanded && (
        <table className="w-full text-xs border-collapse border-t border-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-1.5 text-gray-500 font-medium">No.</th>
              <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-20">種別</th>
              <th className="text-left px-3 py-1.5 text-gray-500 font-medium w-28">結果</th>
              <th className="text-left px-3 py-1.5 text-gray-500 font-medium">差し戻し先</th>
            </tr>
          </thead>
          <tbody>
            {entry.rows.map(r => (
              <tr key={r.key} className="border-t border-gray-50">
                <td className="px-3 py-1 font-mono text-gray-600">{r.key}</td>
                <td className="px-3 py-1 text-gray-500">{r.kind}</td>
                <td className="px-3 py-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${OUTCOME_BADGE_CLS[r.outcome]}`}>
                    {OUTCOME_LABEL[r.outcome]}
                  </span>
                </td>
                <td className="px-3 py-1 text-gray-600">{r.assignee || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function MergeHistoryModal({ history, onClose }: { history: MergeHistoryEntry[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ width: '720px', maxHeight: '80vh' }}>
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0 flex items-center gap-3">
          <div className="text-sm font-bold text-gray-800">マージ/リベース履歴</div>
          <button onClick={onClose} className="ml-auto text-xs px-2.5 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
            閉じる
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {history.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-8">まだ記録がありません</div>
          ) : (
            history.map((entry, i) => <HistoryEntryRow key={`${entry.endedAt}-${i}`} entry={entry} />)
          )}
        </div>
      </div>
    </div>
  )
}
