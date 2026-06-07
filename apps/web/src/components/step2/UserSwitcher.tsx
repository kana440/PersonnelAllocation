import { useState, useEffect, useRef } from 'react'
import { authApi, type AuthUser } from '../../infrastructure/api/authApi'

interface Props {
  currentUser: AuthUser
  onSwitch:    (id: string) => void
}

const ROLE_LABELS: Record<string, string> = {
  admin:       '管理者',
  coordinator: '取りまとめ',
  member:      '担当者',
}

export function UserSwitcher({ currentUser, onSwitch }: Props) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [open,  setOpen]  = useState(false)
  const ref               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    authApi.listUsers().then(setUsers).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-yellow-400 text-yellow-900 hover:bg-yellow-300"
        title="DEV: ユーザーを切り替える"
      >
        <span>👤</span>
        <span>{currentUser.name}</span>
        <span className="opacity-70">({ROLE_LABELS[currentUser.role] ?? currentUser.role})</span>
        <span>▾</span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 bg-white border border-gray-200 rounded shadow-xl z-50 min-w-48">
          <div className="px-3 py-1.5 text-xs font-semibold text-yellow-700 bg-yellow-50 border-b border-yellow-100">
            DEV: ユーザー切り替え
          </div>
          {users.map(u => (
            <button
              key={u.id}
              onClick={() => { onSwitch(u.id); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between gap-4 ${
                u.id === currentUser.id ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700'
              }`}
            >
              <span>{u.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{ROLE_LABELS[u.role] ?? u.role}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
