import { useState } from 'react'
import { Features } from '../../config/features'
import { authApi } from '../../infrastructure/api/authApi'

interface Props {
  onLogin: () => void
}

export function LoginView({ onLogin }: Props) {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError(null)
    try {
      if (Features.userSwitcher) {
        // DEV スタブ: メールアドレスからユーザーを検索して sessionStorage にセット
        const users = await authApi.listUsers()
        const matched = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase())
        if (!matched) {
          setError('このメールアドレスのユーザーが見つかりません')
          return
        }
        authApi.switchUser(matched.id)
      }
      // SSO 本番の場合はここで IdP へリダイレクト（stub では上記の処理後に onLogin へ）
      onLogin()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm mx-4">

        {/* アプリヘッダー */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 mb-4">
            <span className="text-white text-2xl">📋</span>
          </div>
          <h1 className="text-xl font-bold text-gray-800">要員配置リスト</h1>
          <p className="text-sm text-gray-500 mt-1">ログインして続行してください</p>
        </div>

        {/* ログインカード */}
        <div className="bg-white rounded-2xl shadow-md p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-700">
                社内メールアドレス
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                placeholder="your@example.com"
                autoFocus
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'ログイン中…' : 'ログイン'}
            </button>
          </form>
        </div>

        {/* DEV 注記 */}
        {Features.userSwitcher && (
          <div className="mt-4">
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 text-center">
              DEV モード — デモユーザーのメールアドレスを入力
            </p>
            <div className="mt-2 text-xs text-gray-400 space-y-1">
              <p className="font-medium text-gray-500 text-center mb-1">管理者 × 1</p>
              <button type="button" onClick={() => setEmail('admin@example.com')}
                className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 flex justify-between">
                <span>管理者A</span>
                <span className="text-gray-300">admin@example.com</span>
              </button>
              <p className="font-medium text-gray-500 text-center mt-2 mb-1">人事（取りまとめ）× 2</p>
              <button type="button" onClick={() => setEmail('hr1@example.com')}
                className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 flex justify-between">
                <span>HR担当A</span>
                <span className="text-gray-300">hr1@example.com</span>
              </button>
              <button type="button" onClick={() => setEmail('hr2@example.com')}
                className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 flex justify-between">
                <span>HR担当B</span>
                <span className="text-gray-300">hr2@example.com</span>
              </button>
              <p className="font-medium text-gray-500 text-center mt-2 mb-1">部門担当 × 2</p>
              <button type="button" onClick={() => setEmail('department1@example.com')}
                className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 flex justify-between">
                <span>部門A担当</span>
                <span className="text-gray-300">department1@example.com</span>
              </button>
              <button type="button" onClick={() => setEmail('department2@example.com')}
                className="w-full text-left px-3 py-1.5 rounded hover:bg-gray-100 flex justify-between">
                <span>部門B担当</span>
                <span className="text-gray-300">department2@example.com</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
