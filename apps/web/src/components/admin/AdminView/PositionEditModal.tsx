import { useState, useEffect } from 'react'
import type { AdminPosition } from '../../../infrastructure/api/adminApi'

interface Props {
  position:   AdminPosition
  mode:       'acquire' | 'notes'  // acquire=取得, notes=備考のみ編集
  onSave:     (acquiredBy: string | null, acquiredAt: string | null, notes: string | null) => Promise<void>
  onCancel:   () => void
}

export function PositionEditModal({ position, mode, onSave, onCancel }: Props) {
  const [acquiredBy, setAcquiredBy] = useState(position.acquiredBy ?? '')
  const [acquiredAt, setAcquiredAt] = useState(
    position.acquiredAt ?? new Date().toISOString().slice(0, 10)
  )
  const [notes,      setNotes]      = useState(position.notes ?? '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    setAcquiredBy(position.acquiredBy ?? '')
    setAcquiredAt(position.acquiredAt ?? new Date().toISOString().slice(0, 10))
    setNotes(position.notes ?? '')
  }, [position])

  const handleSave = async () => {
    if (mode === 'acquire' && !acquiredBy.trim()) { setError('取得者を入力してください'); return }
    setSaving(true); setError(null)
    try {
      await onSave(
        acquiredBy.trim() || null,
        acquiredAt || null,
        notes.trim() || null,
      )
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="bg-gray-800 text-white px-5 py-3">
          <h2 className="text-sm font-bold">
            {mode === 'acquire' ? `取得 — ${position.code}` : `備考編集 — ${position.code}`}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

          {mode === 'acquire' && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">
                  取得者 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={acquiredBy}
                  onChange={e => setAcquiredBy(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  placeholder="例: 山田 太郎 / 部門A担当"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">取得日</label>
                <input
                  type="date"
                  value={acquiredAt}
                  onChange={e => setAcquiredAt(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">備考</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="任意のメモ"
            />
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
