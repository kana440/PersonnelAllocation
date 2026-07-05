import { useState, useMemo } from 'react'
import { useContactStore }    from '../../../store/contactStore'
import { useStore }           from '../../../store/useStore'
import { useSettingsStore }   from '../../../store/settingsStore'
import { CONTACT_STATUS_LABEL, REQUEST_TYPE_LABEL } from '../../../ports/contactTypes'
import type { ContactRecord, ContactMessage, ContactAnchor } from '../../../ports/contactTypes'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Props { record: ContactRecord }

export function ThreadView({ record }: Props) {
  const { select, markSent, archive, submitMessage,
          copyHeader, copyRequest, copyFull, setAnchor } = useContactStore()
  const myEmail        = useSettingsStore(s => s.myEmail)
  const allocationList = useStore(s => s.allocationList)

  const [replyText,  setReplyText]  = useState('')
  const [replyType,  setReplyType]  = useState<ContactMessage['type']>('answer')
  const [submitting, setSubmitting] = useState(false)
  const [copied,     setCopied]     = useState<string | null>(null)
  const [conflict,   setConflict]   = useState(false)

  const isRespondent = record.requesterEmail !== myEmail

  const handleCopy = (fn: () => void, label: string) => {
    fn()
    setCopied(label)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleReply = async () => {
    if (!replyText.trim()) return
    setSubmitting(true)
    setConflict(false)
    try {
      const result = await submitMessage(record.id, {
        type:    replyType,
        summary: replyText.trim(),
        data:    replyType === 'answer'
          ? { answeredValue: replyText.trim(), fieldKey: record.fieldKey }
          : undefined,
      })
      if (result.status === 'conflict') {
        setConflict(true)
      } else {
        setReplyText('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleMarkUnknown = async () => {
    setSubmitting(true)
    setConflict(false)
    try {
      const result = await submitMessage(record.id, {
        type:    'unknown',
        summary: '情報を確認できませんでした',
        data:    { answeredValue: '__unknown__', fieldKey: record.fieldKey },
      })
      if (result.status === 'conflict') setConflict(true)
    } finally { setSubmitting(false) }
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* 戻るボタン + 概要 */}
      <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <button onClick={() => select(null)} className="text-[10px] text-blue-500 hover:text-blue-700 mb-1">
          ← 一覧に戻る
        </button>
        <div className="text-[11px] font-bold text-gray-800">{record.personName}</div>
        <div className="text-[10px] text-gray-500">
          {REQUEST_TYPE_LABEL[record.requestType]} → {record.targetOrgName}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
            {CONTACT_STATUS_LABEL[record.status]}
          </span>
          <span className="text-[9px] text-gray-400">{record.id}</span>
        </div>
      </div>

      {/* アンカー（回答者のみ表示） */}
      {isRespondent && (
        <AnchorSection
          record={record}
          allocationList={allocationList}
          onSetAnchor={(anchor) => setAnchor(record.id, anchor)}
        />
      )}

      {/* 競合バナー */}
      {conflict && (
        <div className="mx-3 mt-2 rounded px-3 py-2 text-[11px] bg-amber-50 border border-amber-300 text-amber-800 flex-shrink-0">
          <div className="font-bold mb-0.5">⚠ 更新がありました</div>
          <div>他の人が回答を追加しています。内容を確認してから再度送信してください。</div>
          <div className="text-[10px] text-amber-600 mt-1">入力済みのテキストはそのまま残しています。</div>
        </div>
      )}

      {/* スレッド */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {record.thread.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
      </div>

      {/* コピーボタン群 */}
      <div className="border-t border-gray-100 px-3 py-2 flex flex-col gap-1.5 flex-shrink-0">
        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Excel 連絡票へコピー</div>
        <div className="flex gap-1.5 flex-wrap">
          <CopyBtn label="① ヘッダー" onClick={() => handleCopy(copyHeader, 'header')} copied={copied === 'header'} />
          <CopyBtn label="② 起票行"   onClick={() => handleCopy(() => copyRequest(record), 'request')} copied={copied === 'request'} />
          {record.status === 'draft' && (
            <button
              onClick={() => markSent(record.id)}
              className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
            >
              送信済みにする
            </button>
          )}
          {record.status !== 'draft' && (
            <CopyBtn label="③ 回答行" onClick={() => handleCopy(() => copyFull(record), 'full')} copied={copied === 'full'} />
          )}
        </div>
      </div>

      {/* 返信入力 */}
      {record.status !== 'applied' && (
        <div className="border-t border-gray-200 px-3 py-2 flex-shrink-0">
          <div className="flex gap-1 mb-1.5">
            {(['answer', 'followup'] as const).map(t => (
              <button
                key={t}
                onClick={() => setReplyType(t)}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  replyType === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                }`}
              >
                {t === 'answer' ? '回答' : '追記'}
              </button>
            ))}
            <button
              onClick={handleMarkUnknown}
              disabled={submitting}
              className="text-[10px] px-2 py-0.5 rounded border border-gray-300 text-gray-500 hover:bg-gray-50 ml-auto"
            >
              不明
            </button>
          </div>
          <textarea
            value={replyText} onChange={e => setReplyText(e.target.value)}
            className={`w-full text-xs border rounded px-2 py-1 resize-none h-14 focus:outline-none transition-colors ${
              conflict ? 'border-amber-400 bg-amber-50' : 'border-gray-300 focus:border-blue-400'
            }`}
            placeholder={replyType === 'answer' ? '回答値を入力…' : '追記コメントを入力…'}
          />
          <button
            onClick={handleReply} disabled={submitting || !replyText.trim()}
            className="mt-1 w-full py-1 text-xs font-semibold text-white bg-blue-600 rounded
              hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {submitting ? '確認中…' : conflict ? '再送信' : '送信'}
          </button>
        </div>
      )}

      {/* アーカイブ */}
      {record.status === 'applied' && (
        <div className="border-t border-gray-100 px-3 py-2 flex-shrink-0">
          <button
            onClick={() => archive(record.id)}
            className="text-[10px] text-gray-400 hover:text-gray-600"
          >
            アーカイブ（タスクから削除）
          </button>
        </div>
      )}
    </div>
  )
}

// ── アンカーセクション ─────────────────────────────────────────

interface AnchorSectionProps {
  record:          ContactRecord
  allocationList:  AllocationRow[]
  onSetAnchor:     (anchor: ContactAnchor) => Promise<void>
}

function AnchorSection({ record, allocationList, onSetAnchor }: AnchorSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [setting,    setSetting]    = useState(false)

  // 現在のアンカー行を allocationList から探す
  const anchoredRow = useMemo(() => {
    const { anchor } = record
    if (!anchor) return undefined
    if (anchor.kind === 'person') {
      return allocationList.find(r =>
        r.groupEmployeeId === anchor.groupEmployeeId && r.userId === anchor.userId
      )
    }
    return allocationList.find(r => r.positionCode === anchor.positionCode)
  }, [record, allocationList])

  // 変更検知: アンカー設定時の値と現在の値を比較
  const hasChanged = useMemo(() => {
    if (!record.anchor?.fieldValueAtAnchor || !anchoredRow) return false
    const current = String(anchoredRow[record.fieldKey as keyof AllocationRow] ?? '')
    return current !== record.anchor.fieldValueAtAnchor
  }, [record.anchor, anchoredRow, record.fieldKey])

  // 対象者名でフィルタした候補行
  const candidates = useMemo(() => {
    const targetName = record.personName.replace(/\s+/g, '')
    return allocationList.filter(r => {
      const full = [r.lastName, r.firstName].filter(Boolean).join('')
      return full === targetName || (r.groupEmployeeId && r.groupEmployeeId === record.personName)
    }).slice(0, 10)
  }, [allocationList, record.personName])

  const handleSelect = async (row: AllocationRow) => {
    setSetting(true)
    try {
      const fieldValue = String(row[record.fieldKey as keyof AllocationRow] ?? '')
      const anchor: ContactAnchor = (row.groupEmployeeId && row.userId)
        ? { kind: 'person', groupEmployeeId: row.groupEmployeeId, userId: row.userId, fieldValueAtAnchor: fieldValue }
        : { kind: 'position', positionCode: row.positionCode ?? '', fieldValueAtAnchor: fieldValue }
      await onSetAnchor(anchor)
      setPickerOpen(false)
    } finally {
      setSetting(false)
    }
  }

  const { anchor } = record

  return (
    <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold text-gray-500">紐付け行</div>
        <button
          onClick={() => setPickerOpen(p => !p)}
          className="text-[10px] text-blue-500 hover:text-blue-700"
        >
          {anchor ? '変更' : '行を指定'}
        </button>
      </div>

      {anchor ? (
        <div className="mt-0.5 text-[10px] text-gray-700">
          {anchor.kind === 'person'
            ? `${anchor.groupEmployeeId} / ${anchor.userId}`
            : `POS: ${anchor.positionCode}`}
          {anchor.fieldValueAtAnchor && (
            <span className="ml-1.5 text-gray-400">（設定時: {anchor.fieldValueAtAnchor}）</span>
          )}
        </div>
      ) : (
        <div className="mt-0.5 text-[10px] text-gray-400">未設定</div>
      )}

      {hasChanged && (
        <div className="mt-1 rounded px-2 py-1 text-[10px] bg-amber-50 border border-amber-200 text-amber-700">
          ⚠ 紐付け先のフィールド値が変更されています（依頼者への連絡を検討してください）
        </div>
      )}

      {pickerOpen && (
        <div className="mt-2 rounded border border-gray-200 bg-white shadow-sm max-h-40 overflow-y-auto">
          {candidates.length === 0 ? (
            <div className="px-2 py-2 text-[10px] text-gray-400 text-center">
              「{record.personName}」に一致する行が見つかりません
            </div>
          ) : (
            <ul>
              {candidates.map(row => (
                <li key={row.rowId}>
                  <button
                    onClick={() => handleSelect(row)}
                    disabled={setting}
                    className="w-full text-left px-2 py-1.5 text-[10px] hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0"
                  >
                    <div className="font-semibold text-gray-700">
                      {[row.lastName, row.firstName].filter(Boolean).join(' ')}
                      {row.groupEmployeeId && (
                        <span className="ml-1.5 font-mono text-gray-400">{row.groupEmployeeId}</span>
                      )}
                    </div>
                    <div className="text-gray-400 mt-0.5">
                      {row.positionCode || '—'} / {row.departmentCode || '—'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ── サブコンポーネント ─────────────────────────────────────────

function MessageBubble({ msg }: { msg: ContactMessage }) {
  const isUnknown = msg.type === 'unknown'

  return (
    <div className={`rounded px-2.5 py-2 text-[11px] ${
      msg.type === 'request'  ? 'bg-gray-100 text-gray-700' :
      isUnknown               ? 'bg-orange-50 border border-orange-200 text-orange-700' :
      msg.type === 'followup' ? 'bg-blue-50 border border-blue-200 text-blue-800' :
                                'bg-green-50 border border-green-200 text-green-800'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold text-[10px]">
          {msg.type === 'request' ? '依頼' : isUnknown ? '確認不可' : msg.type === 'answer' ? '回答' : '追記'}
        </span>
        <span className="text-[9px] text-gray-400">{msg.authorEmail}</span>
        <span className="ml-auto text-[9px] text-gray-400">{msg.createdAt.slice(0, 10)}</span>
      </div>
      <div className="leading-relaxed">{msg.summary}</div>
      {msg.type === 'answer' && msg.data?.answeredValue && msg.data.answeredValue !== '__unknown__' && (
        <div className="mt-1 font-mono text-[10px] bg-white/60 px-1.5 py-0.5 rounded inline-block">
          値: {msg.data.answeredValue}
        </div>
      )}
    </div>
  )
}

function CopyBtn({ label, onClick, copied }: { label: string; onClick: () => void; copied: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
        copied
          ? 'bg-green-100 text-green-700 border-green-300'
          : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100'
      }`}
    >
      {copied ? '✓ コピー済' : label}
    </button>
  )
}
