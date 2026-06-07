import { useState, useEffect } from 'react'
import { adminApi, type AdminUser, type CreateSubmissionBody } from '../../../infrastructure/api/adminApi'

interface Props {
  roundCompanyId: string
  parentId?:      string
  onCreated:      () => void
  onCancel:       () => void
}

type ScopeKind = 'all' | 'org' | 'level'

export function DelegationModal({ roundCompanyId, parentId, onCreated, onCancel }: Props) {
  const [users,       setUsers]       = useState<AdminUser[]>([])
  const [assigneeId,  setAssigneeId]  = useState('')
  const [scopeKind,   setScopeKind]   = useState<ScopeKind>('all')
  const [orgCodes,    setOrgCodes]    = useState('')
  const [orgLevelMin, setOrgLevelMin] = useState('')
  const [comment,     setComment]     = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    adminApi.users.list().then(u => {
      const candidates = u.filter(x => x.role !== 'admin')
      setUsers(candidates)
      if (candidates.length > 0) setAssigneeId(candidates[0].id)
    }).catch(e => setError(String(e)))
  }, [])

  const buildScope = () => {
    if (scopeKind === 'all')   return { kind: 'all' as const }
    if (scopeKind === 'org')   return { kind: 'org' as const, orgCodes: orgCodes.split(',').map(s => s.trim()).filter(Boolean) }
    return { kind: 'level' as const, orgLevelMin: Number(orgLevelMin) }
  }

  const handleSave = async () => {
    if (!assigneeId) { setError('委任先を選択してください'); return }
    if (scopeKind === 'org'   && !orgCodes.trim())   { setError('組織コードを入力してください'); return }
    if (scopeKind === 'level' && !orgLevelMin.trim()) { setError('組織レベルを入力してください'); return }
    setSaving(true); setError(null)
    try {
      const body: CreateSubmissionBody = {
        roundCompanyId,
        assigneeId,
        parentSubmissionId: parentId,
        scope: buildScope(),
        requestComment: comment.trim() || undefined,
      }
      await adminApi.submissions.create(body)
      onCreated()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const ROLE_LABELS: Record<string, string> = { coordinator: '取りまとめ', member: '担当者' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gray-800 text-white px-5 py-3">
          <h2 className="text-sm font-bold">委任を追加</h2>
        </div>
        <div className="p-5 space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">委任先 <span className="text-red-500">*</span></label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}（{ROLE_LABELS[u.role] ?? u.role}）
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">スコープ</label>
            <div className="flex gap-4">
              {(['all', 'org', 'level'] as ScopeKind[]).map(k => (
                <label key={k} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="radio" name="scope" value={k} checked={scopeKind === k}
                    onChange={() => setScopeKind(k)} />
                  <span className="text-xs">
                    {k === 'all' ? '全体' : k === 'org' ? '組織コード指定' : 'レベル指定'}
                  </span>
                </label>
              ))}
            </div>
            {scopeKind === 'org' && (
              <input type="text" value={orgCodes} onChange={e => setOrgCodes(e.target.value)}
                placeholder="例: A01, A02, B01（カンマ区切り）"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            )}
            {scopeKind === 'level' && (
              <input type="number" min={1} value={orgLevelMin} onChange={e => setOrgLevelMin(e.target.value)}
                placeholder="組織レベル下限（例: 3）"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">依頼コメント（任意）</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
              placeholder="担当者への連絡事項"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
            キャンセル
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? '送信中…' : '委任'}
          </button>
        </div>
      </div>
    </div>
  )
}
