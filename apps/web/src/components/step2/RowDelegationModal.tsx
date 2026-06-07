import { useState, useEffect } from 'react'
import { adminApi, type ApiSubmission, type AdminUser, type CreateSubmissionBody } from '../../infrastructure/api/adminApi'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Props {
  submission: ApiSubmission
  onCreated:  () => void
  onCancel:   () => void
}

function rowLabel(row: AllocationRow): string {
  const person = [row.lastName, row.firstName].filter(Boolean).join(' ') || '（空席）'
  const dept   = row.departmentCode ?? '—'
  const pos    = row.positionCode?.startsWith('_pos_') ? '' : (row.positionCode ?? '')
  return `${person}　${dept}${pos ? '　' + pos : ''}`
}

export function RowDelegationModal({ submission, onCreated, onCancel }: Props) {
  const [rows,       setRows]       = useState<AllocationRow[]>([])
  const [users,      setUsers]      = useState<AdminUser[]>([])
  const [selected,   setSelected]   = useState<Set<number>>(new Set())
  const [assigneeId, setAssigneeId] = useState('')
  const [comment,    setComment]    = useState('')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [filter,     setFilter]     = useState('')

  useEffect(() => {
    Promise.all([
      adminApi.submissions.getRows(submission.id) as Promise<AllocationRow[]>,
      adminApi.users.list(),
    ]).then(([r, u]) => {
      setRows(r)
      // coordinator は coordinator 宛のみ委任可（サーバー側でも強制）
      const candidates = u.filter(x => x.role === 'coordinator' || x.role === 'admin')
      setUsers(candidates)
      if (candidates.length > 0) setAssigneeId(candidates[0].id)
    }).catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [submission.id])

  const toggle = (rowId: number) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(rowId) ? next.delete(rowId) : next.add(rowId)
      return next
    })

  const toggleAll = () => {
    const visible = filtered.map(r => r.rowId)
    const allSelected = visible.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      visible.forEach(id => allSelected ? next.delete(id) : next.add(id))
      return next
    })
  }

  const filtered = rows.filter(r => {
    if (!filter) return true
    const lbl = rowLabel(r).toLowerCase()
    return lbl.includes(filter.toLowerCase())
  })

  const handleSave = async () => {
    if (!assigneeId)       { setError('委任先を選択してください'); return }
    if (selected.size === 0) { setError('1行以上選択してください'); return }
    setSaving(true); setError(null)
    try {
      const body: CreateSubmissionBody = {
        roundCompanyId:      submission.round_company_id,
        assigneeId,
        parentSubmissionId:  submission.id,
        scope:               { kind: 'manual', rowIds: [...selected] },
        requestComment:      comment.trim() || undefined,
      }
      await adminApi.submissions.create(body)
      onCreated()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const ROLE_LABELS: Record<string, string> = { coordinator: '取りまとめ', admin: '管理者' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="bg-gray-800 text-white px-5 py-3 flex-shrink-0">
          <h2 className="text-sm font-bold">行を選択して委任</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            担当者に渡す行をチェックしてから委任先を選択してください
          </p>
        </div>

        <div className="p-4 space-y-3 flex-shrink-0">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
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
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-gray-700">依頼コメント（任意）</label>
              <input type="text" value={comment} onChange={e => setComment(e.target.value)}
                placeholder="担当者への連絡事項"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text" value={filter} onChange={e => setFilter(e.target.value)}
              placeholder="氏名・組織コードで絞り込み"
              className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span className="text-xs text-gray-500 shrink-0">
              {selected.size} 件選択 / 全 {rows.length} 件
            </span>
          </div>
        </div>

        {/* 行リスト */}
        <div className="flex-1 overflow-y-auto border-t border-gray-200 min-h-0">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">読み込み中…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">行がありません</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="border-b border-gray-200">
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(r => selected.has(r.rowId))}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500">氏名</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500 w-32">組織コード</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500 w-32">ポジション</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-500 w-16">兼務</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr
                    key={row.rowId}
                    onClick={() => toggle(row.rowId)}
                    className={`border-b border-gray-100 cursor-pointer ${
                      selected.has(row.rowId) ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(row.rowId)}
                        onChange={() => toggle(row.rowId)}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {[row.lastName, row.firstName].filter(Boolean).join(' ') || (
                        <span className="text-gray-400">（空席）</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{row.departmentCode ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500">
                      {row.positionCode?.startsWith('_pos_') ? '' : (row.positionCode ?? '—')}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{row.concurrentType ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex gap-2 justify-end flex-shrink-0 bg-white">
          <button onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
            キャンセル
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || selected.size === 0}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '送信中…' : `選択した ${selected.size} 行を委任`}
          </button>
        </div>
      </div>
    </div>
  )
}
