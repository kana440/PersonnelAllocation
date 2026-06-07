import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { authApi, type AuthUser } from './infrastructure/api/authApi'
import { type ApiSubmission }     from './infrastructure/api/adminApi'
import { LoginView }              from './components/step2/LoginView'
import { AdminView }              from './components/admin/AdminView'
import { PortalView }             from './components/step2/PortalView'
import { SubmissionEditView }     from './components/step2/SubmissionEditView'
import { DiffReviewView }        from './components/step2/DiffReviewView'
import Step1App                   from './App'

type View = 'portal' | 'admin' | 'edit' | 'diff'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:        30 * 1000,  // 30秒はキャッシュを使う
      retry:            1,
      refetchOnWindowFocus: false,
    },
  },
})

function Step2AppInner() {
  const [authed,     setAuthed]     = useState(() => !!sessionStorage.getItem('demo_user_id'))
  const [user,       setUser]       = useState<AuthUser | null>(null)
  const [error,      setError]      = useState<string | null>(null)
  const [view,        setView]        = useState<View>('portal')
  const [submission,  setSubmission]  = useState<ApiSubmission | null>(null)
  const [diffTarget,  setDiffTarget]  = useState<ApiSubmission | null>(null)
  // STEP1 Excel ローカルモード（移行期用の裏技切り替え）
  const [step1Mode,  setStep1Mode]  = useState(false)

  const loadUser = async () => {
    setUser(null); setError(null)
    try {
      const u = await authApi.me()
      setUser(u)
      setView(u.role === 'admin' ? 'admin' : 'portal')
    } catch (e) {
      sessionStorage.removeItem('demo_user_id')
      setAuthed(false)
      setError(String(e))
    }
  }

  useEffect(() => {
    if (authed) void loadUser()
  }, [authed])

  const handleLogout = () => {
    sessionStorage.removeItem('demo_user_id')
    setAuthed(false)
    setUser(null)
    setStep1Mode(false)
  }

  const handleEdit = (sub: ApiSubmission) => {
    setSubmission(sub)
    setView('edit')
  }

  const handleBackToPortal = () => {
    setSubmission(null)
    setDiffTarget(null)
    setView('portal')
  }

  const handleDiff = (sub: ApiSubmission) => {
    setDiffTarget(sub)
    setView('diff')
  }

  // STEP1 裏技モード: 認証済みのまま STEP1 シェルをフルレンダリング
  if (step1Mode && user) {
    return <Step1App onExit={() => setStep1Mode(false)} />
  }

  if (!authed) return <LoginView onLogin={() => setAuthed(true)} />

  if (!user) {
    if (error) return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-red-600 text-sm">認証エラー: {error}</p>
          <p className="text-xs text-gray-400">サーバーが起動しているか確認してください（npm run dev:server）</p>
          <button onClick={() => setAuthed(false)} className="text-xs text-blue-600 underline mt-2">
            ログイン画面に戻る
          </button>
        </div>
      </div>
    )
    return (
      <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
        読み込み中…
      </div>
    )
  }

  if (view === 'admin') {
    return <AdminView onBack={() => setView('portal')} onLogout={handleLogout} />
  }

  if (view === 'edit' && submission) {
    return (
      <SubmissionEditView
        submission={submission}
        user={user}
        onBack={handleBackToPortal}
        onLogout={handleLogout}
      />
    )
  }

  if (view === 'diff' && diffTarget) {
    return (
      <DiffReviewView
        submission={diffTarget}
        onBack={handleBackToPortal}
      />
    )
  }

  return (
    <PortalView
      user={user}
      onAdmin={user.role === 'admin' ? () => setView('admin') : undefined}
      onLogout={handleLogout}
      onEdit={handleEdit}
      onDiff={handleDiff}
      onStep1={() => setStep1Mode(true)}
    />
  )
}

export default function Step2App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Step2AppInner />
    </QueryClientProvider>
  )
}
