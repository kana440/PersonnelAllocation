import React, { useState, useEffect, useCallback } from 'react'
import { adminApi, type ApiSubmission, type SubmissionStatus } from '../../infrastructure/api/adminApi'
import type { AuthUser } from '../../infrastructure/api/authApi'

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
  cancelled:          'bg-gray-200 text-gray-400 line-through',
}

interface ConflictInfo {
  conflicts: { rowId: number; fields: string[] }[]
  parentId:  string
}

interface Props {
  user:     AuthUser
  onAdmin:  (() => void) | undefined
  onLogout: () => void
  onEdit:   (submission: ApiSubmission) => void
  onDiff:   (submission: ApiSubmission) => void
  onStep1:  () => void
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function PortalView({ user, onAdmin, onLogout, onEdit, onDiff, onStep1 }: Props) {
  const [submissions,    setSubmissions]    = useState<ApiSubmission[]>([])
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [expandedId,     setExpandedId]     = useState<string | null>(null)
  const [childrenMap,    setChildrenMap]    = useState<Record<string, ApiSubmission[]>>({})
  const [childLoading,   setChildLoading]   = useState<string | null>(null)
  const [actionLoading,  setActionLoading]  = useState<string | null>(null)
  const [actionError,    setActionError]    = useState<string | null>(null)
  const [conflictInfo,   setConflictInfo]   = useState<ConflictInfo | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setSubmissions(await adminApi.submissions.list()) }
    catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (childrenMap[id]) return
    setChildLoading(id)
    try {
      const ch = await adminApi.submissions.getChildren(id)
      setChildrenMap(prev => ({ ...prev, [id]: ch }))
    } catch (e) { setActionError(String(e)) }
    finally { setChildLoading(null) }
  }

  const handleMerge = async (childId: string, parentId: string) => {
    setActionLoading(childId); setActionError(null)
    try {
      const result = await adminApi.submissions.merge(childId)
      const ch = await adminApi.submissions.getChildren(parentId)
      setChildrenMap(prev => ({ ...prev, [parentId]: ch }))
      void load()
      if (result.conflicts.length > 0) {
        setConflictInfo({ conflicts: result.conflicts, parentId })
      }
    } catch (e) { setActionError(String(e)) }
    finally { setActionLoading(null) }
  }

  const handleSync = async (childId: string) => {
    setActionLoading(childId); setActionError(null)
    try {
      const result = await adminApi.submissions.sync(childId)
      if (result.conflicts.length > 0) {
        setActionError(`反映完了（コンフリクト ${result.conflicts.length} 件あり）`)
      } else {
        setActionError('現状を自分のワークスペースに反映しました')
      }
    } catch (e) { setActionError(String(e)) }
    finally { setActionLoading(null) }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <header className="bg-blue-800 text-white px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <h1 className="text-base font-bold tracking-tight">要員配置 — 提出ポータル</h1>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-blue-200">{user.name}</span>
          {onAdmin && (
            <button onClick={onAdmin}
              className="text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white px-2 py-1 rounded">
              管理画面
            </button>
          )}
          <button onClick={onLogout} className="text-xs text-blue-300 hover:text-white">
            ログアウト
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4">
        {(error || actionError) && (
          <div className={`mb-3 max-w-4xl mx-auto text-xs rounded px-3 py-2 ${
            actionError?.includes('完了') || actionError?.includes('反映')
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-600'
          }`}>
            {error ?? actionError}
            <button onClick={() => { setError(null); setActionError(null) }} className="ml-2 underline">閉じる</button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow max-w-4xl mx-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <span className="text-sm font-semibold text-gray-700">
              依頼一覧{!loading && (
                <span className="text-gray-400 font-normal ml-1">（{submissions.length}件）</span>
              )}
            </span>
            <button onClick={() => void load()} className="text-xs text-gray-500 hover:text-gray-700">更新</button>
          </div>

          {loading ? (
            <div className="text-center py-16 text-gray-400 text-sm">読み込み中…</div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">依頼がありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">申請回</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-28">ステータス</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-24">配下進捗</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 w-16">行数</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 w-40">更新日時</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">コメント</th>
                    <th className="px-4 py-2.5 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(s => (
                    <React.Fragment key={s.id}>
                      <tr className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {s.roundLabel ?? s.roundCompanyId.slice(0, 8)}
                          <span className="ml-2 font-mono text-xs text-gray-400">{s.id.slice(0, 8)}…</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>
                            {STATUS_LABELS[s.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {(s.childCount ?? 0) > 0 ? (
                            <button
                              onClick={() => void toggleExpand(s.id)}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800"
                            >
                              <span>{expandedId === s.id ? '▼' : '▶'}</span>
                              <span>配下 {s.childDoneCount ?? 0}/{s.childCount}</span>
                            </button>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-right">{s.rowCount?.toLocaleString() ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(s.updatedAt)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                          {s.revisionComment ?? s.requestComment ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {(s.status === 'pending' || s.status === 'in_progress' || s.status === 'revision_requested') && (
                              <button onClick={() => onEdit(s)}
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                                編集
                              </button>
                            )}
                            {(s.childCount ?? 0) > 0 && (
                              <button onClick={() => onDiff(s)}
                                className="text-xs text-purple-600 hover:text-purple-800 hover:underline">
                                差分
                              </button>
                            )}
                            {s.roundId && s.companyId && (
                              <a
                                href={adminApi.rounds.getExcelUrl(s.roundId, s.companyId)}
                                download
                                className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
                                title="Excel をダウンロード"
                              >
                                Excel
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedId === s.id && (
                        <tr key={`${s.id}-children`} className="bg-blue-50 border-b border-blue-100">
                          <td colSpan={7} className="px-6 py-3">
                            {childLoading === s.id ? (
                              <span className="text-xs text-gray-400">読み込み中…</span>
                            ) : (childrenMap[s.id] ?? []).length === 0 ? (
                              <span className="text-xs text-gray-400">配下の依頼はありません</span>
                            ) : (
                              <div className="space-y-2">
                                {(childrenMap[s.id] ?? []).map(ch => (
                                  <div key={ch.id} className="flex items-center gap-3 text-xs">
                                    <span className="text-gray-700 font-medium w-28 truncate">
                                      {ch.assigneeName ?? ch.assigneeId}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ch.status]}`}>
                                      {STATUS_LABELS[ch.status]}
                                    </span>
                                    {ch.status === 'submitted' && (
                                      <button
                                        onClick={() => void handleMerge(ch.id, s.id)}
                                        disabled={actionLoading === ch.id}
                                        className="px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                      >
                                        {actionLoading === ch.id ? '処理中…' : 'マージする'}
                                      </button>
                                    )}
                                    {(ch.status === 'in_progress' || ch.status === 'pending') && (
                                      <button
                                        onClick={() => void handleSync(ch.id)}
                                        disabled={actionLoading === ch.id}
                                        className="px-2 py-0.5 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                                      >
                                        {actionLoading === ch.id ? '処理中…' : '現状を確認・反映'}
                                      </button>
                                    )}
                                    {ch.revisionComment && (
                                      <span className="text-red-600 truncate max-w-xs" title={ch.revisionComment}>
                                        差し戻し: {ch.revisionComment}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* S-05 ConflictPanel */}
      {conflictInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h2 className="text-sm font-bold text-amber-700 mb-1">
              コンフリクト {conflictInfo.conflicts.length} 件
            </h2>
            <p className="text-xs text-gray-600 mb-3">
              マージは完了しましたが、以下の行で両者が異なる値を変更していました。
              現在はあなたの値が保持されています。差分ビューで内容を確認・修正してください。
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto mb-4 border border-amber-100 rounded p-2 bg-amber-50">
              {conflictInfo.conflicts.map(c => (
                <div key={c.rowId} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-gray-400 shrink-0">Row {c.rowId}:</span>
                  <span className="text-amber-700">{c.fields.join(', ')}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConflictInfo(null)}
                className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
              >
                閉じる
              </button>
              <button
                onClick={() => {
                  const parent = submissions.find(s => s.id === conflictInfo.parentId)
                  setConflictInfo(null)
                  if (parent) onDiff(parent)
                }}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                差分を確認する
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 text-center py-2">
        <button onClick={onStep1}
          className="text-xs text-gray-400 hover:text-gray-600"
          title="STEP1 Excel ローカルモードに切り替え（開発・移行期用）">
          Excel ローカルモードで作業する
        </button>
      </div>
    </div>
  )
}
