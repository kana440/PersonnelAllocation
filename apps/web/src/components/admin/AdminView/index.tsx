import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '../../../infrastructure/api/adminApi'
import type {
  AdminUser, UserBody,
  AdminSession,
  AdminPosition, PositionStatus, PositionSummary,
} from '../../../infrastructure/api/adminApi'
import { UserTable }          from './UserTable'
import { UserEditModal }      from './UserEditModal'
import { SessionTable }       from './SessionTable'
import { PositionTable }      from './PositionTable'
import { PositionEditModal }  from './PositionEditModal'
import { BulkRegisterModal }  from './BulkRegisterModal'

type Tab = 'users' | 'sessions' | 'positions'
type PosFilter = PositionStatus | 'all'

const TAB_LABELS: Record<Tab, string> = {
  users:     'ユーザー管理',
  sessions:  'セッション一覧',
  positions: 'ポジション管理',
}
const POS_FILTER_LABELS: Record<PosFilter, string> = {
  all:       'すべて',
  available: '利用可能',
  in_use:    '使用中',
  retired:   '廃止',
}

interface Props { onBack: () => void }

export function AdminView({ onBack }: Props) {
  const [tab,   setTab]   = useState<Tab>('users')
  const [error, setError] = useState<string | null>(null)

  // ── ユーザー ──────────────────────────────────────────────────
  const [users,      setUsers]      = useState<AdminUser[]>([])
  const [loadingU,   setLoadingU]   = useState(false)
  const [editUser,   setEditUser]   = useState<AdminUser | null | undefined>(undefined)
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null)

  const loadUsers = useCallback(async () => {
    setLoadingU(true); setError(null)
    try { setUsers(await adminApi.users.list()) }
    catch (e) { setError(String(e)) }
    finally { setLoadingU(false) }
  }, [])

  useEffect(() => { if (tab === 'users') void loadUsers() }, [tab, loadUsers])

  const handleSaveUser = async (body: UserBody) => {
    if (editUser === null) await adminApi.users.create(body)
    else if (editUser)     await adminApi.users.update(editUser.id, body)
    setEditUser(undefined)
    await loadUsers()
  }
  const handleDeleteUser = async (user: AdminUser) => {
    try { await adminApi.users.delete(user.id); setDeleteUser(null); await loadUsers() }
    catch (e) { setError(String(e)); setDeleteUser(null) }
  }

  // ── セッション ────────────────────────────────────────────────
  const [sessions,      setSessions]      = useState<AdminSession[]>([])
  const [loadingS,      setLoadingS]      = useState(false)
  const [deleteSession, setDeleteSession] = useState<AdminSession | null>(null)

  const loadSessions = useCallback(async () => {
    setLoadingS(true); setError(null)
    try { setSessions(await adminApi.sessions.list()) }
    catch (e) { setError(String(e)) }
    finally { setLoadingS(false) }
  }, [])

  useEffect(() => { if (tab === 'sessions') void loadSessions() }, [tab, loadSessions])


  // ── ポジション ────────────────────────────────────────────────
  const [positions,       setPositions]       = useState<AdminPosition[]>([])
  const [summary,         setSummary]         = useState<PositionSummary | null>(null)
  const [loadingP,        setLoadingP]        = useState(false)
  const [posFilter,       setPosFilter]       = useState<PosFilter>('all')
  const [showBulkModal,   setShowBulkModal]   = useState(false)
  const [editPosition,    setEditPosition]    = useState<{ pos: AdminPosition; mode: 'acquire' | 'notes' } | null>(null)
  const [retirePosition,  setRetirePosition]  = useState<AdminPosition | null>(null)
  const [deletePosition,  setDeletePosition]  = useState<AdminPosition | null>(null)

  const loadPositions = useCallback(async () => {
    setLoadingP(true); setError(null)
    try {
      const [list, sum] = await Promise.all([adminApi.positions.list(), adminApi.positions.summary()])
      setPositions(list)
      setSummary(sum)
    }
    catch (e) { setError(String(e)) }
    finally { setLoadingP(false) }
  }, [])

  useEffect(() => { if (tab === 'positions') void loadPositions() }, [tab, loadPositions])

  const handleBulkRegister = async (codes: string[]) => {
    const result = await adminApi.positions.bulkRegister(codes)
    setShowBulkModal(false)
    await loadPositions()
    if (result.skipped.length > 0) {
      setError(`${result.registered.length}件を登録しました。${result.skipped.length}件は既存のためスキップ。`)
    }
  }

  const handlePositionSave = async (
    acquiredBy: string | null, acquiredAt: string | null, notes: string | null
  ) => {
    if (!editPosition) return
    const { pos, mode } = editPosition
    await adminApi.positions.update(pos.code, {
      ...(mode === 'acquire' ? { status: 'in_use', acquired_by: acquiredBy, acquired_at: acquiredAt } : {}),
      notes,
    })
    setEditPosition(null)
    await loadPositions()
  }

  const handleRetire = async (pos: AdminPosition) => {
    try { await adminApi.positions.update(pos.code, { status: 'retired' }); setRetirePosition(null); await loadPositions() }
    catch (e) { setError(String(e)); setRetirePosition(null) }
  }

  const handleRelease = async (pos: AdminPosition) => {
    try {
      await adminApi.positions.update(pos.code, { status: 'available', acquired_by: null, acquired_at: null })
      await loadPositions()
    }
    catch (e) { setError(String(e)) }
  }

  const handleDeletePosition = async (pos: AdminPosition) => {
    try { await adminApi.positions.delete(pos.code); setDeletePosition(null); await loadPositions() }
    catch (e) { setError(String(e)); setDeletePosition(null) }
  }

  // ── レンダリング ──────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-gray-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <button onClick={onBack} className="text-gray-300 hover:text-white text-sm">← 戻る</button>
        <h1 className="text-base font-bold tracking-tight">管理画面</h1>
      </header>

      <div className="bg-white border-b border-gray-200 px-4 flex gap-0 flex-shrink-0">
        {(['users', 'sessions', 'positions'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{TAB_LABELS[t]}</button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-3 max-w-4xl mx-auto text-xs text-red-600 bg-red-50 rounded px-3 py-2">
            {error}<button onClick={() => setError(null)} className="ml-2 underline">閉じる</button>
          </div>
        )}

        {/* ユーザー管理 */}
        {tab === 'users' && (
          <div className="bg-white rounded-lg shadow max-w-4xl mx-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">
                ユーザー一覧{!loadingU && <span className="text-gray-400 font-normal ml-1">（{users.length}名）</span>}
              </span>
              <button onClick={() => setEditUser(null)} className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
                + ユーザーを追加
              </button>
            </div>
            {loadingU ? <div className="text-center py-16 text-gray-400 text-sm">読み込み中…</div>
              : <UserTable users={users} onEdit={u => setEditUser(u)} onDelete={u => setDeleteUser(u)} />}
          </div>
        )}

        {/* セッション一覧 */}
        {tab === 'sessions' && (
          <div className="bg-white rounded-lg shadow max-w-4xl mx-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">
                セッション一覧{!loadingS && <span className="text-gray-400 font-normal ml-1">（{sessions.length}件）</span>}
              </span>
              <button onClick={() => void loadSessions()} className="text-xs text-gray-500 hover:text-gray-700">更新</button>
            </div>
            {loadingS ? <div className="text-center py-16 text-gray-400 text-sm">読み込み中…</div>
              : <SessionTable sessions={sessions} onDelete={s => setDeleteSession(s)} />}
          </div>
        )}

        {/* ポジション管理 */}
        {tab === 'positions' && (
          <div className="bg-white rounded-lg shadow max-w-5xl mx-auto">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-700">ポジションプール</span>
                {summary && (
                  <div className="flex gap-3 text-xs">
                    <span className="text-green-700">利用可能: <b>{summary.available}</b></span>
                    <span className="text-blue-700">使用中: <b>{summary.in_use}</b></span>
                    <span className="text-gray-400">廃止: <b>{summary.retired}</b></span>
                  </div>
                )}
              </div>
              <button onClick={() => setShowBulkModal(true)} className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700">
                + SFコードを登録
              </button>
            </div>

            {/* フィルタタブ */}
            <div className="flex gap-0 px-4 border-b border-gray-100">
              {(['all', 'available', 'in_use', 'retired'] as PosFilter[]).map(f => (
                <button key={f} onClick={() => setPosFilter(f)}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    posFilter === f ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >{POS_FILTER_LABELS[f]}</button>
              ))}
            </div>

            {loadingP ? <div className="text-center py-16 text-gray-400 text-sm">読み込み中…</div>
              : (
                <PositionTable
                  positions={positions}
                  statusFilter={posFilter}
                  onAcquire={p   => setEditPosition({ pos: p, mode: 'acquire' })}
                  onEditNotes={p => setEditPosition({ pos: p, mode: 'notes' })}
                  onRetire={p    => setRetirePosition(p)}
                  onRelease={p   => void handleRelease(p)}
                  onDelete={p    => setDeletePosition(p)}
                />
              )}
          </div>
        )}
      </div>

      {/* ── モーダル ── */}

      {editUser !== undefined && (
        <UserEditModal user={editUser} onSave={handleSaveUser} onCancel={() => setEditUser(undefined)} />
      )}

      {showBulkModal && (
        <BulkRegisterModal onRegister={handleBulkRegister} onCancel={() => setShowBulkModal(false)} />
      )}

      {editPosition && (
        <PositionEditModal
          position={editPosition.pos}
          mode={editPosition.mode}
          onSave={handlePositionSave}
          onCancel={() => setEditPosition(null)}
        />
      )}

      {deleteUser && (
        <ConfirmDialog title="ユーザーを削除"
          message={`${deleteUser.name} を削除しますか？`}
          onConfirm={() => void handleDeleteUser(deleteUser)}
          onCancel={() => setDeleteUser(null)} />
      )}
      {deleteSession && (
        <ConfirmDialog title="セッションを削除"
          message={`「${deleteSession.name}」を削除しますか？`}
          onConfirm={() => void (async () => { await adminApi.sessions.delete(deleteSession.id); setDeleteSession(null); await loadSessions() })()}
          onCancel={() => setDeleteSession(null)} />
      )}
      {retirePosition && (
        <ConfirmDialog title="ポジションを廃止"
          message={`${retirePosition.code} を廃止しますか？`}
          onConfirm={() => void handleRetire(retirePosition)}
          onCancel={() => setRetirePosition(null)}
          confirmLabel="廃止" confirmColor="bg-gray-600 hover:bg-gray-700" />
      )}
      {deletePosition && (
        <ConfirmDialog title="プールから削除"
          message={`${deletePosition.code} をプールから削除しますか？`}
          onConfirm={() => void handleDeletePosition(deletePosition)}
          onCancel={() => setDeletePosition(null)} />
      )}
    </div>
  )
}

// ── 共通確認ダイアログ ────────────────────────────────────────────

interface ConfirmProps {
  title:         string
  message:       string
  onConfirm:     () => void
  onCancel:      () => void
  confirmLabel?: string
  confirmColor?: string
}
function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = '削除', confirmColor = 'bg-red-600 hover:bg-red-700' }: ConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-800">{title}</h2>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">キャンセル</button>
          <button onClick={onConfirm} className={`px-4 py-1.5 text-sm font-medium text-white rounded ${confirmColor}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
