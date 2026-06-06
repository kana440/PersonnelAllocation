import { useState } from 'react'

interface Props {
  onRegister: (codes: string[]) => Promise<void>
  onCancel:   () => void
}

const SF_CODE = /^P\d{8}$/

function parseCodes(raw: string): { valid: string[]; invalid: string[] } {
  const lines = raw.split(/[\n,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
  const valid:   string[] = []
  const invalid: string[] = []
  for (const line of lines) {
    if (SF_CODE.test(line)) valid.push(line)
    else invalid.push(line)
  }
  return { valid: [...new Set(valid)], invalid }
}

export function BulkRegisterModal({ onRegister, onCancel }: Props) {
  const [raw,     setRaw]     = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const { valid, invalid } = parseCodes(raw)

  const handleRegister = async () => {
    if (valid.length === 0) { setError('有効なコード（P + 8桁）が1件もありません'); return }
    setSaving(true); setError(null)
    try { await onRegister(valid) }
    catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="bg-gray-800 text-white px-5 py-3">
          <h2 className="text-sm font-bold">SFコードを一括登録</h2>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              コード一覧
              <span className="ml-1 text-gray-400 font-normal">（P + 8桁、改行・スペース・カンマ区切りで複数入力可）</span>
            </label>
            <textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              rows={8}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder={'P00001234\nP00001235\nP00001236'}
            />
          </div>

          {raw.trim() && (
            <div className="text-xs space-y-1">
              <p className="text-green-700">
                有効: <span className="font-semibold">{valid.length}件</span>
                {valid.length > 0 && <span className="ml-1 text-gray-500">{valid.slice(0, 5).join(', ')}{valid.length > 5 ? '…' : ''}</span>}
              </p>
              {invalid.length > 0 && (
                <p className="text-red-600">
                  無効（スキップ）: {invalid.slice(0, 5).join(', ')}{invalid.length > 5 ? `…他${invalid.length - 5}件` : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleRegister}
            disabled={saving || valid.length === 0}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '登録中…' : `${valid.length}件を登録`}
          </button>
        </div>
      </div>
    </div>
  )
}
