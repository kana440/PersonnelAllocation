import { useMemo }          from 'react'
import { useShallow }        from 'zustand/react/shallow'
import { useContactStore }   from '../../../store/contactStore'
import { useSettingsStore }  from '../../../store/settingsStore'
import { useStore }          from '../../../store/useStore'
import type { ContactRecord } from '../../../ports/contactTypes'
import { REQUEST_TYPE_LABEL } from '../../../ports/contactTypes'
import { getDescendantOrgIds } from '@personnel/domain/rules/options/orgTree'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }  from '@personnel/domain/schemas'

export function ReceivedList() {
  const { contacts, select } = useContactStore(useShallow(s => ({ contacts: s.contacts, select: s.select })))
  const myEmail              = useSettingsStore(s => s.myEmail)
  const allocationList       = useStore(s => s.allocationList)
  const beforeOrganizations  = useStore(s => s.beforeOrganizations)

  const received = useMemo(() => {
    // 他者の起票はすべて表示。自身の起票は関連がある場合のみ表示
    const base = contacts.filter(c =>
      !c.archived &&
      (c.status === 'sent' || c.status === 'answered') &&
      (
        c.requesterEmail !== myEmail ||
        isRelevant(c, allocationList, beforeOrganizations)
      )
    )

    return base
      .map(c => ({ record: c, relevant: isRelevant(c, allocationList, beforeOrganizations) }))
      .sort((a, b) => {
        // 関連あり → 回答待ち → 回答済み → 日付降順
        if (a.relevant !== b.relevant) return a.relevant ? -1 : 1
        if (a.record.status === 'sent' && b.record.status !== 'sent') return -1
        if (a.record.status !== 'sent' && b.record.status === 'sent') return 1
        return b.record.createdAt.localeCompare(a.record.createdAt)
      })
  }, [contacts, myEmail, allocationList, beforeOrganizations])

  if (received.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-gray-400 p-6 text-center">
        受信した連絡票がありません
        <br />
        <span className="text-[10px] mt-1 block">「同期」ボタンでファイルを読み込んでください</span>
      </div>
    )
  }

  return (
    <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {received.map(({ record, relevant }) => (
        <Item key={record.id} record={record} relevant={relevant} onSelect={() => select(record.id)} />
      ))}
    </ul>
  )
}

function Item({ record, relevant, onSelect }: {
  record: ContactRecord
  relevant: boolean
  onSelect: () => void
}) {
  const myEmail      = useSettingsStore(s => s.myEmail)
  const isPending    = record.status === 'sent'
  const isSelf       = record.requesterEmail === myEmail
  const latestAnswer = [...record.thread].reverse().find(m => m.type === 'answer' || m.type === 'unknown')

  return (
    <li>
      <button
        onClick={onSelect}
        className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
          isPending
            ? 'hover:bg-amber-50 border-amber-400'
            : 'hover:bg-gray-50 border-green-400'
        }`}
      >
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {relevant && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              関連あり
            </span>
          )}
          {isSelf && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
              自分の起票
            </span>
          )}
          {isPending ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              回答待ち
            </span>
          ) : (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
              回答済み
            </span>
          )}
          <span className="ml-auto text-[10px] text-gray-400">{record.createdAt.slice(0, 10)}</span>
        </div>
        <div className="text-[11px] font-semibold text-gray-800 truncate">{record.personName}</div>
        {record.beforeOrgCodeHint && (
          <div className="text-[10px] text-gray-400 mt-0.5">Before: {record.beforeOrgCodeHint}</div>
        )}
        <div className="text-[10px] text-gray-500 mt-0.5">
          {REQUEST_TYPE_LABEL[record.requestType]}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5 truncate">{record.thread[0]?.summary}</div>
        {latestAnswer && (
          <div className="text-[10px] text-green-700 mt-0.5 truncate">↩ {latestAnswer.summary}</div>
        )}
        <div className="text-[10px] text-blue-500 mt-1">依頼者: {record.requesterEmail}</div>
      </button>
    </li>
  )
}

// ── マッチング判定 ─────────────────────────────────────────────

function isRelevant(
  ticket: ContactRecord,
  allocationList: AllocationRow[],
  beforeOrganizations: Organization[],
): boolean {
  // 1. 氏名マッチ（姓名の結合で比較、スペースあり・なし両対応）
  if (ticket.personName) {
    const targetName = ticket.personName.replace(/\s+/g, '')
    const nameMatch = allocationList.some(r => {
      const full = [r.lastName, r.firstName].filter(Boolean).join('')
      return full === targetName
    })
    if (nameMatch) return true
  }

  // 2. Before組織サブツリーマッチ
  if (ticket.beforeOrgCodeHint && beforeOrganizations.length > 0) {
    const rootOrg = beforeOrganizations.find(o => o.externalCode === ticket.beforeOrgCodeHint)
    if (rootOrg) {
      const descendantIds = getDescendantOrgIds(rootOrg.id, beforeOrganizations)
      descendantIds.add(rootOrg.id)

      const descendantCodes = new Set<string>()
      for (const org of beforeOrganizations) {
        if (descendantIds.has(org.id) && org.externalCode) {
          descendantCodes.add(org.externalCode)
        }
      }

      if (allocationList.some(r => r.prevDepartmentCode && descendantCodes.has(r.prevDepartmentCode))) {
        return true
      }
    }
  }

  return false
}
