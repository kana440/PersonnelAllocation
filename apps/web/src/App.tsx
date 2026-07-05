import { useState, useEffect, useCallback, useMemo } from 'react'
import { AdminView }          from './components/admin/AdminView'
import { Features }           from './config/features'
import { SetupView }          from './components/setup/SetupView'
import { ClearSessionDialog } from './components/common/ClearSessionDialog'
import { useStore }           from './store/useStore'
import { useUserSession }     from './store/useUserSession'
import { useMasterStore }   from './store/masterStore'
import { ScopeSelector }          from './components/header/ScopeSelector'
import { MergeImportButton }      from './components/header/MergeImportButton'
import { AssigneeWizard }         from './components/header/AssigneeWizard'
import { SplitExportButton }      from './components/header/SplitExportButton'
import { EditViewCore, HeaderButton } from './components/editor/EditViewCore'
import { workspaceStore, buildPersistedPayload, buildWorkspaceMeta } from './infrastructure/workspace'
import { appService } from './application/HRApplicationService'
import { ContactPanel }          from './components/contact/ContactPanel'
import { ContactSettingsModal }  from './components/contact/ContactSettingsModal'
import { useContactStore }       from './store/contactStore'
import { useSettingsStore }      from './store/settingsStore'
import { initContactSource } from './infrastructure/contact'
import { useShallow } from 'zustand/react/shallow'

// ── 担当者割り当てウィザードボタン（管理者のみ表示）─────────────────────────
function AssigneeWizardButton({ onOpen }: { onOpen: () => void }) {
  const { capabilities } = useUserSession()
  if (!capabilities.canAssignAssignees) return null
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
      title="担当者を一括で割り当てる"
    >
      <span>👤</span><span>担当者を割り当て</span>
    </button>
  )
}

// ── 管理者用担当者プレビューフィルタ（管理者のみ表示）───────────────────────
function AdminAssigneeFilterSelect() {
  const { capabilities } = useUserSession()
  const { allocationList, adminAssigneeFilter, setAdminAssigneeFilter } = useStore()
  const assignees = useMemo(() => {
    const names = new Set(allocationList.map(r => r.assignee).filter(Boolean) as string[])
    return [...names].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [allocationList])
  if (!capabilities.canSetAssigneeFilter || assignees.length === 0) return null
  return (
    <div className="flex items-center gap-1" title="担当者フィルタ（プレビュー）">
      <select
        value={adminAssigneeFilter ?? ''}
        onChange={e => setAdminAssigneeFilter(e.target.value || null)}
        className="text-xs bg-gray-700 text-gray-300 border border-gray-600 rounded px-2 py-0.5 hover:bg-gray-600 focus:outline-none max-w-[120px]"
      >
        <option value="">全担当者</option>
        {assignees.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      {adminAssigneeFilter && (
        <button
          onClick={() => setAdminAssigneeFilter(null)}
          className="text-gray-400 hover:text-gray-200 text-xs leading-none"
          title="フィルタ解除"
        >×</button>
      )}
    </div>
  )
}

interface Props {
  /** STEP2 シェルから STEP1 モードで開いた場合に渡す「戻る」ハンドラ */
  onExit?: () => void
}

export default function App({ onExit }: Props = {}) {
  const { isLoading } = useStore()
  const { isChecked, checkStorage } = useMasterStore()

  const [appMode,      setAppMode]      = useState<'editor' | 'admin'>('editor')
  const [sessionReady, setSessionReady] = useState(false)
  const [clearDialogOpen,     setClearDialogOpen]     = useState(false)
  const [assigneeWizardOpen,  setAssigneeWizardOpen]  = useState(false)
  const [contactSettingsOpen, setContactSettingsOpen] = useState(false)

  const { isPanelOpen: isContactPanelOpen, openPanel: openContactPanel, contacts } = useContactStore(
    useShallow(s => ({ isPanelOpen: s.isPanelOpen, openPanel: s.openPanel, contacts: s.contacts }))
  )
  const { myEmail, contactSourceMode, setHasContactFileHandle } = useSettingsStore(
    useShallow(s => ({ myEmail: s.myEmail, contactSourceMode: s.contactSourceMode, setHasContactFileHandle: s.setHasContactFileHandle }))
  )
  const isContactEnabled = !!myEmail && contactSourceMode !== null
  const pendingContactCount = contacts.filter(c =>
    !c.archived && c.status === 'sent' && c.requesterEmail !== myEmail
  ).length

  useEffect(() => { checkStorage() }, [checkStorage])

  // 起動時にIndexedDB保存済みのファイルハンドルを確認
  useEffect(() => {
    initContactSource().then(has => {
      setHasContactFileHandle(has)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveWorkspace = useCallback(() => {
    if (!sessionReady || appMode !== 'editor') return
    const { effectiveDate, userSession } = useStore.getState()
    const snapshot = appService.getSnapshot()
    if (snapshot.allocationList.length === 0) return
    const payload = buildPersistedPayload(snapshot, effectiveDate, userSession)
    const meta    = buildWorkspaceMeta(payload)
    workspaceStore.save(meta, payload).catch(console.error)
  }, [sessionReady, appMode])

  // セッション開始時に保存
  useEffect(() => {
    if (!sessionReady || appMode !== 'editor') return
    saveWorkspace()
  }, [sessionReady, appMode, saveWorkspace])

  // タブ非表示・クローズ時に保存（visibilitychange は beforeunload より確実）
  useEffect(() => {
    if (!sessionReady || appMode !== 'editor') return
    const handler = () => { if (document.visibilityState === 'hidden') saveWorkspace() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [sessionReady, appMode, saveWorkspace])

  useEffect(() => {
    if (!sessionReady || appMode !== 'editor') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      saveWorkspace()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [sessionReady, appMode, saveWorkspace])

  if (!isChecked) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">読み込み中…</div>
  )

  if (appMode === 'admin') {
    return <AdminView onBack={() => setAppMode('editor')} />
  }

  if (!sessionReady) return <SetupView onReady={() => setSessionReady(true)} />

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">読み込み中…</div>
  )

  return (
    <>
      {clearDialogOpen && (
        <ClearSessionDialog
          onCleared={() => { setClearDialogOpen(false); setSessionReady(false) }}
          onCancel={() => setClearDialogOpen(false)}
        />
      )}
      {assigneeWizardOpen && (
        <AssigneeWizard onClose={() => setAssigneeWizardOpen(false)} />
      )}

      <EditViewCore
        headerLeft={
          <>
            {onExit && (
              <button onClick={onExit} className="text-gray-300 hover:text-white text-sm shrink-0">
                ← ポータルへ戻る
              </button>
            )}
            <h1 className="text-base font-bold tracking-tight">要員配置リスト編集</h1>
            <ScopeSelector />
          </>
        }
        headerMid={
          <>
            <MergeImportButton />
            <AssigneeWizardButton onOpen={() => setAssigneeWizardOpen(true)} />
            <SplitExportButton />
            <AdminAssigneeFilterSelect />
          </>
        }
        headerRight={
          <>
            {/* 連絡票ボタン */}
            <HeaderButton
              onClick={isContactEnabled ? openContactPanel : () => setContactSettingsOpen(true)}
              active={isContactPanelOpen}
              title={isContactEnabled ? '連絡票パネルを開く' : '連絡票の設定が必要です'}
            >
              <span>📋</span>
              <span>
                連絡票{isContactEnabled && pendingContactCount > 0 ? ` (${pendingContactCount})` : ''}
              </span>
            </HeaderButton>

            {Features.userManagement && (
              <HeaderButton
                onClick={() => setAppMode('admin')}
                title="管理画面（ユーザー管理・ポジション管理）"
              >
                <span>⚙</span><span>管理</span>
              </HeaderButton>
            )}
            <HeaderButton
              onClick={() => setClearDialogOpen(true)}
              activeClass="bg-red-700 text-white"
              title="セッションをクリアして最初から始める"
            >
              <span>↺</span><span>クリア</span>
            </HeaderButton>
          </>
        }
      />

      {/* 連絡票パネル（固定サイドパネル） */}
      <ContactPanel />

      {/* 連絡票設定モーダル */}
      {contactSettingsOpen && (
        <ContactSettingsModal onClose={() => setContactSettingsOpen(false)} />
      )}
    </>
  )
}
