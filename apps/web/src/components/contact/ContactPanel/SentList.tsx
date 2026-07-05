import { useShallow } from 'zustand/react/shallow'
import { useContactStore } from '../../../store/contactStore'
import { useSettingsStore } from '../../../store/settingsStore'
import { CONTACT_STATUS_LABEL } from '../../../ports/contactTypes'
import type { ContactRecord } from '../../../ports/contactTypes'

const STATUS_COLOR: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-500',
  sent:     'bg-blue-100 text-blue-700',
  answered: 'bg-green-100 text-green-700',
  applied:  'bg-gray-200 text-gray-400',
}

export function SentList() {
  const { contacts, select } = useContactStore(useShallow(s => ({ contacts: s.contacts, select: s.select })))
  const myEmail = useSettingsStore(s => s.myEmail)

  const sent = contacts
    .filter(c => !c.archived && c.requesterEmail === myEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  if (sent.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-400 p-6 text-center">
        起票した連絡票がありません
      </div>
    )
  }

  return (
    <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {sent.map(record => <Item key={record.id} record={record} onSelect={() => select(record.id)} />)}
    </ul>
  )
}

function Item({ record, onSelect }: { record: ContactRecord; onSelect: () => void }) {
  const latestMsg  = record.thread.at(-1)
  const msgCount   = record.thread.length
  const hasReply   = msgCount > 1

  return (
    <li>
      <button
        onClick={onSelect}
        className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLOR[record.status] ?? ''}`}>
            {CONTACT_STATUS_LABEL[record.status]}
          </span>
          {hasReply && (
            <span className="text-[9px] text-green-600 font-semibold">💬 {msgCount}件</span>
          )}
          <span className="ml-auto text-[10px] text-gray-400">{record.createdAt.slice(0, 10)}</span>
        </div>
        <div className="text-[11px] font-semibold text-gray-800 truncate">{record.personName}</div>
        <div className="text-[10px] text-gray-500 truncate">{record.thread[0]?.summary}</div>
        <div className="text-[10px] text-gray-400 mt-0.5">→ {record.targetOrgName}</div>
        {latestMsg && hasReply && (
          <div className="text-[10px] text-green-700 mt-1 truncate">↩ {latestMsg.summary}</div>
        )}
      </button>
    </li>
  )
}
