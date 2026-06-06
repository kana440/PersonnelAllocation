import { useState, useEffect } from 'react'
import type { AdminUser, UserBody, UserRole } from '../../../infrastructure/api/adminApi'

interface Props {
  user:     AdminUser | null  // null = 新規作成
  onSave:   (body: UserBody) => Promise<void>
  onCancel: () => void
}

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: '全権管理者',
  admin:       '取りまとめ担当',
  assignee:    '組織担当',
}

export function UserEditModal({ user, onSave, onCancel }: Props) {
  const [name,         setName]         = useState(user?.name         ?? '')
  const [email,        setEmail]        = useState(user?.email        ?? '')
  const [role,         setRole]         = useState<UserRole>(user?.role ?? 'assignee')
  const [orgLevelMin,  setOrgLevelMin]  = useState<string>(user?.policy.orgLevelMin?.toString() ?? '')
  const [orgCodes,     setOrgCodes]     = useState<string>(user?.policy.orgCodes?.join(', ') ?? '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setName(user.name)
      setEmail(user.email)
      setRole(user.role)
      setOrgLevelMin(user.policy.orgLevelMin?.toString() ?? '')
      setOrgCodes(user.policy.orgCodes?.join(', ') ?? '')
    }
  }, [user])

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      setError('名前とメールは必須です')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const parsedLevel = orgLevelMin.trim() ? Number(orgLevelMin.trim()) : null
      const parsedCodes = orgCodes.trim()
        ? orgCodes.split(',').map(s => s.trim()).filter(Boolean)
        : null
      await onSave({
        name: name.trim(),
        email: email.trim(),
        role,
        orgLevelMin: parsedLevel,
        orgCodes:    parsedCodes,
      })
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gray-800 text-white px-5 py-3">
          <h2 className="text-sm font-bold">{user ? 'ユーザーを編集' : 'ユーザーを追加'}</h2>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">表示名 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="山田 太郎"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">メールアドレス <span className="text-red-500">*</span></label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="yamada@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">ロール</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-gray-600">アクセス範囲（空白 = 制限なし）</p>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">組織レベル下限</label>
              <input
                type="number"
                min={1}
                value={orgLevelMin}
                onChange={e => setOrgLevelMin(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="例: 3（3階層以上のみ）"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">対象組織コード（カンマ区切り）</label>
              <input
                type="text"
                value={orgCodes}
                onChange={e => setOrgCodes(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="例: A01, A02, B01"
              />
              <p className="text-xs text-gray-400">空白のとき全組織が対象</p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
