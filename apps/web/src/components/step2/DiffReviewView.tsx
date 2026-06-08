import { useState, useEffect } from 'react'
import {
  adminApi,
  type ApiSubmission,
  type ChildDiff,
  type SubmissionStatus,
} from '../../infrastructure/api/adminApi'
import { RowDiffTable } from '../common/RowDiffTable'

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending:            '未着手',
  in_progress:        '編集中',
  submitted:          '提出済み',
  merged:             'マージ済み',
  accepted:           '承認済み',
  revision_requested: '差し戻し',
  cancelled:          '取消済み',
}
const STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending:            'bg-gray-100 text-gray-600',
  in_progress:        'bg-blue-100 text-blue-700',
  submitted:          'bg-yellow-100 text-yellow-700',
  merged:             'bg-green-100 text-green-700',
  accepted:           'bg-green-100 text-green-700',
  revision_requested: 'bg-red-100 text-red-700',
  cancelled:          'bg-gray-200 text-gray-400',
}

interface Props {
  submission: ApiSubmission
  onBack:     () => void
}

export function DiffReviewView({ submission, onBack }: Props) {
  const [children,      setChildren]      = useState<ChildDiff[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState<string | null>(null)
  const [expandedIds,   setExpandedIds]   = useState<Set<string>>(new Set())
  const [revisingId,    setRevisingId]    = useState<string | null>(null)
  const [revComment,    setRevComment]    = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError,   setActionError]   = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const result = await adminApi.submissions.getChildDiffs(submission.id)
      setChildren(result.children)
      // 提出済み・変更ありの子はデフォルトで展開
      setExpandedIds(new Set(
        result.children
          .filter(c => c.status === 'submitted' && c.diffs.length > 0)
          .map(c => c.id)
      ))
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [submission.id])

  const toggleChild = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleRequestRevision = async (childId: string) => {
    if (!revComment.trim()) return
    setActionLoading(childId); setActionError(null)
    try {
      await adminApi.submissions.requestRevision(childId, revComment)
      setRevisingId(null); setRevComment('')
      await load()
    } catch (e) { setActionError(String(e)) }
    finally { setActionLoading(null) }
  }

  const roundLabel = submission.roundLabel ?? submission.roundCompanyId.slice(0, 8)

  const totalChanges = children.reduce((n, c) => n + c.diffs.length, 0)

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <button onClick={onBack} className="text-blue-300 hover:text-white text-sm shrink-0">
          ← 依頼一覧
        </button>
        <h1 className="text-sm font-semibold truncate">{roundLabel} — 配下の変更差分</h1>
        {!loading && totalChanges > 0 && (
          <span className="text-xs text-blue-300 shrink-0">{totalChanges} 件の変更</span>
        )}
      </header>

      <div className="flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-3 max-w-4xl mx-auto bg-red-50 text-red-600 rounded px-3 py-2 text-xs">
            {error}
          </div>
        )}
        {actionError && (
          <div className="mb-3 max-w-4xl mx-auto bg-red-50 text-red-600 rounded px-3 py-2 text-xs flex items-center gap-2">
            <span className="flex-1">{actionError}</span>
            <button onClick={() => setActionError(null)} className="underline shrink-0">閉じる</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">読み込み中…</div>
        ) : children.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">配下の依頼がありません</div>
        ) : (
          <div className="space-y-3 max-w-4xl mx-auto">
            {children.map(child => {
              const statusColor = STATUS_COLORS[child.status as SubmissionStatus] ?? 'bg-gray-100 text-gray-600'
              const statusLabel = STATUS_LABELS[child.status as SubmissionStatus] ?? child.status
              const expanded    = expandedIds.has(child.id)
              const hasDiffs    = child.diffs.length > 0

              return (
                <div key={child.id} className="bg-white rounded-lg shadow overflow-hidden">
                  {/* ヘッダー行 */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => hasDiffs && toggleChild(child.id)}
                      className={`flex items-center gap-3 flex-1 min-w-0 text-left ${hasDiffs ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <span className="font-medium text-gray-800 truncate">
                        {child.assigneeName ?? child.assigneeId}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor}`}>
                        {statusLabel}
                      </span>
                      {hasDiffs ? (
                        <>
                          <span className="text-xs text-gray-500 shrink-0">{child.diffs.length} 件の変更</span>
                          <span className="text-gray-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400 shrink-0">変更なし</span>
                      )}
                    </button>

                    {child.status === 'submitted' && (
                      <button
                        onClick={() => {
                          setRevisingId(prev => prev === child.id ? null : child.id)
                          setRevComment('')
                        }}
                        className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded hover:bg-red-200 shrink-0"
                      >
                        差し戻す
                      </button>
                    )}
                  </div>

                  {/* 差し戻しコメント入力 */}
                  {revisingId === child.id && (
                    <div className="flex gap-2 items-center px-4 py-2 bg-red-50 border-t border-red-100">
                      <input
                        type="text"
                        placeholder="差し戻しコメント（必須）"
                        value={revComment}
                        onChange={e => setRevComment(e.target.value)}
                        autoFocus
                        className="flex-1 text-xs border border-red-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      <button
                        onClick={() => void handleRequestRevision(child.id)}
                        disabled={!revComment.trim() || actionLoading === child.id}
                        className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 shrink-0"
                      >
                        {actionLoading === child.id ? '送信中…' : '差し戻す'}
                      </button>
                      <button
                        onClick={() => { setRevisingId(null); setRevComment('') }}
                        className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
                      >
                        キャンセル
                      </button>
                    </div>
                  )}

                  {/* 差分テーブル */}
                  {hasDiffs && expanded && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <RowDiffTable diffs={child.diffs} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
