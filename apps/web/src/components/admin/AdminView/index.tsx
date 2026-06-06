import { useState, useEffect, useCallback } from 'react'
import { adminApi } from '../../../infrastructure/api/adminApi'
import type { AdminUser, UserBody } from '../../../infrastructure/api/adminApi'
import { UserTable }     from './UserTable'
import { UserEditModal } from './UserEditModal'

type Tab = 'users' | 'positions'

interface Props {
  onBack: () => void
}

export function AdminView({ onBack }: Props) {
  const [tab,       setTab]       = useState<Tab>('users')
  const [users,     setUsers]     = useState<AdminUser[]>([])
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [editUser,  setEditUser]  = useState<AdminUser | null | undefined>(undefined) // undefined=非表示, null=新規
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await adminApi.users.list()
      setUsers(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadUsers() }, [loadUsers])

  const handleSave = async (body: UserBody) => {
    if (editUser === null) {
      await adminApi.users.create(body)
    } else if (editUser) {
      await adminApi.users.update(editUser.id, body)
    }
    setEditUser(undefined)
    await loadUsers()
  }

  const handleDelete = async (user: AdminUser) => {
    try {
      await adminApi.users.delete(user.id)
      setDeleteConfirm(null)
      await loadUsers()
    } catch (e) {
      setError(String(e))
      setDeleteConfirm(null)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">

      {/* ヘッダー */}
      <header className="bg-gray-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <button
          onClick={onBack}
          className="text-gray-300 hover:text-white text-sm flex items-center gap-1"
        >
          ← 戻る
        </button>
        <h1 className="text-base font-bold tracking-tight">管理画面</h1>
      </header>

      {/* タブ */}
      <div className="bg-white border-b border-gray-200 px-4 flex gap-0 flex-shrink-0">
        {(['users', 'positions'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'users'     ? 'ユーザー管理' : 'ポジション管理'}
            {t === 'positions' && <span className="ml-1.5 text-xs text-gray-400">（準備中）</span>}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-auto p-4">
        {tab === 'users' && (
          <div className="bg-white rounded-lg shadow max-w-4xl mx-auto">

            {/* ツールバー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">
                ユーザー一覧 {!loading && <span className="text-gray-400 font-normal">（{users.length}名）</span>}
              </span>
              <button
                onClick={() => setEditUser(null)}
                className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors"
              >
                + ユーザーを追加
              </button>
            </div>

            {/* エラー */}
            {error && (
              <div className="mx-4 mt-3 text-xs text-red-600 bg-red-50 rounded px-3 py-2">
                {error}
                <button onClick={() => setError(null)} className="ml-2 underline">閉じる</button>
              </div>
            )}

            {/* ローディング */}
            {loading ? (
              <div className="text-center py-16 text-gray-400 text-sm">読み込み中…</div>
            ) : (
              <UserTable
                users={users}
                onEdit={u => setEditUser(u)}
                onDelete={u => setDeleteConfirm(u)}
              />
            )}
          </div>
        )}

        {tab === 'positions' && (
          <div className="bg-white rounded-lg shadow max-w-4xl mx-auto p-8 text-center text-gray-400 text-sm">
            ポジション管理機能は準備中です
          </div>
        )}
      </div>

      {/* 編集モーダル */}
      {editUser !== undefined && (
        <UserEditModal
          user={editUser}
          onSave={handleSave}
          onCancel={() => setEditUser(undefined)}
        />
      )}

      {/* 削除確認 */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-800">ユーザーを削除</h2>
            <p className="text-sm text-gray-600">
              <span className="font-medium">{deleteConfirm.name}</span> を削除しますか？この操作は元に戻せません。
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => void handleDelete(deleteConfirm)}
                className="px-4 py-1.5 text-sm font-medium bg-red-600 text-white rounded hover:bg-red-700"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
