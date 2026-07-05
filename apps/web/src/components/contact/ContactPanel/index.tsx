import { useEffect, useState } from 'react'
import { createPortal }    from 'react-dom'
import { useShallow }      from 'zustand/react/shallow'
import { useContactStore } from '../../../store/contactStore'
import { useSettingsStore } from '../../../store/settingsStore'
import { ContactSettingsModal } from '../../contact/ContactSettingsModal'
import { SentList }    from './SentList'
import { ReceivedList } from './ReceivedList'
import { ContactForm }  from './ContactForm'
import { ThreadView }   from './ThreadView'

export function ContactPanel() {
  const { isPanelOpen, activeTab, selectedId, isFormOpen, contacts,
          closePanel, setTab, openForm, load, sync, syncResult } = useContactStore(
    useShallow(s => ({
      isPanelOpen: s.isPanelOpen, activeTab: s.activeTab, selectedId: s.selectedId,
      isFormOpen: s.isFormOpen, contacts: s.contacts, closePanel: s.closePanel,
      setTab: s.setTab, openForm: s.openForm, load: s.load, sync: s.sync, syncResult: s.syncResult,
    }))
  )
  const myEmail = useSettingsStore(s => s.myEmail)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    if (isPanelOpen) load()
  }, [isPanelOpen, load])

  const sentCount     = contacts.filter(c => !c.archived && c.requesterEmail === myEmail).length
  const receivedCount = contacts.filter(c => !c.archived && c.status === 'sent' && c.requesterEmail !== myEmail).length
  const selected      = selectedId ? contacts.find(c => c.id === selectedId) ?? null : null

  return (
    <>
    <div
      className={`fixed top-[44px] right-0 bottom-0 w-[340px] bg-white border-l border-gray-200
        shadow-xl flex flex-col z-40 transition-transform duration-200
        ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-gray-700 tracking-wide">連絡票</span>
          <button
            onClick={() => setSettingsOpen(true)}
            title="連絡票の設定"
            className="text-gray-400 hover:text-gray-600 text-sm px-1 rounded hover:bg-gray-200"
          >
            ⚙
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={sync}
            title="ファイルから再読み込み"
            className="text-[11px] text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded hover:bg-blue-50"
          >
            ↻ 同期
          </button>
          {syncResult && (
            <span className="text-[10px] text-gray-400">
              +{syncResult.added} /{syncResult.updated}更新
            </span>
          )}
          <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 text-sm leading-none">✕</button>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {(['sent', 'received'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setTab(tab)}
            className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'sent' ? `送信 (${sentCount})` : `受信 (${receivedCount})`}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {isFormOpen ? (
          <ContactForm />
        ) : selected ? (
          <ThreadView record={selected} />
        ) : (
          activeTab === 'sent'
            ? <SentList />
            : <ReceivedList />
        )}
      </div>

      {/* フッター：新規起票 */}
      {!isFormOpen && !selected && (
        <div className="border-t border-gray-200 p-2 flex-shrink-0">
          <button
            onClick={openForm}
            className="w-full py-1.5 text-xs font-medium text-blue-600 border border-blue-300
              rounded hover:bg-blue-50 transition-colors"
          >
            ＋ 新規起票
          </button>
        </div>
      )}
    </div>

    {/* 設定モーダル — transform スタック外に出すため Portal */}
    {settingsOpen && createPortal(
      <ContactSettingsModal onClose={() => setSettingsOpen(false)} />,
      document.body
    )}
    </>
  )
}
