import { useState, useEffect, useCallback } from 'react'
import {
  adminApi,
  type ApiRound,
  type ApiRoundCompany,
  type ApiSubmission,
  type SubmissionStatus,
} from '../../../infrastructure/api/adminApi'
import { DelegationModal } from './DelegationModal'

type TreeNode = ApiSubmission & { children: TreeNode[] }

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

function buildTree(subs: ApiSubmission[]): TreeNode[] {
  const map = new Map(subs.map(s => [s.id, { ...s, children: [] as TreeNode[] }]))
  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function SubmissionNode({ node, depth, onRefresh }: {
  node: TreeNode; depth: number; onRefresh: () => void
}) {
  const [delegating,         setDelegating]         = useState(false)
  const [actionLoading,      setActionLoading]      = useState<string | null>(null)
  const [actionError,        setActionError]        = useState<string | null>(null)
  const [requestingRevision, setRequestingRevision] = useState(false)
  const [revComment,         setRevComment]         = useState('')

  const handleMerge = async () => {
    setActionLoading('merge'); setActionError(null)
    try {
      const res = await adminApi.submissions.merge(node.id)
      if (res.conflicts.length > 0)
        setActionError(`マージ完了。コンフリクト ${res.conflicts.length} 行あり（field: ${res.conflicts.map(c => c.fields.join('/')).join(', ')}）`)
      onRefresh()
    } catch (e) { setActionError(String(e)) }
    finally { setActionLoading(null) }
  }

  const handleSync = async () => {
    setActionLoading('sync'); setActionError(null)
    try { await adminApi.submissions.sync(node.id); onRefresh() }
    catch (e) { setActionError(String(e)) }
    finally { setActionLoading(null) }
  }

  const handleRequestRevision = async () => {
    if (!revComment.trim()) return
    setActionLoading('revision'); setActionError(null)
    try {
      await adminApi.submissions.requestRevision(node.id, revComment)
      setRequestingRevision(false); setRevComment('')
      onRefresh()
    } catch (e) { setActionError(String(e)) }
    finally { setActionLoading(null) }
  }

  const indent = `${12 + depth * 20}px`

  return (
    <div>
      {/* メイン行 */}
      <div className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 rounded"
        style={{ paddingLeft: indent }}>
        {depth > 0 && <span className="text-gray-300 text-xs select-none">└─</span>}
        <span className="font-medium text-sm text-gray-800">{node.assigneeName ?? node.assigneeId}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[node.status]}`}>
          {STATUS_LABELS[node.status]}
        </span>
        {node.rowCount != null && (
          <span className="text-xs text-gray-400">{node.rowCount.toLocaleString()}行</span>
        )}
        {node.revisionComment && (
          <span className="text-xs text-red-600 truncate max-w-48" title={node.revisionComment}>
            差し戻し: {node.revisionComment}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {node.status === 'submitted' && (<>
            <button
              onClick={() => void handleMerge()}
              disabled={!!actionLoading}
              className="text-xs bg-green-600 text-white px-2 py-0.5 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {actionLoading === 'merge' ? '処理中…' : 'マージ'}
            </button>
            <button
              onClick={() => setRequestingRevision(r => !r)}
              disabled={!!actionLoading}
              className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded hover:bg-red-200 disabled:opacity-50"
            >
              差し戻し
            </button>
          </>)}
          {(node.status === 'in_progress' || node.status === 'pending') && (
            <button
              onClick={() => void handleSync()}
              disabled={!!actionLoading}
              className="text-xs text-gray-600 border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-50"
            >
              {actionLoading === 'sync' ? '処理中…' : '途中取り込み'}
            </button>
          )}
          <button
            onClick={() => setDelegating(true)}
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            + 委任
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {actionError && (
        <div className="text-xs text-red-700 bg-red-50 rounded px-3 py-1 mx-3 mb-1 flex items-center gap-2"
          style={{ marginLeft: indent }}>
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)} className="underline shrink-0">閉じる</button>
        </div>
      )}

      {/* 差し戻しコメント入力 */}
      {requestingRevision && (
        <div className="flex gap-2 items-center px-3 py-2 bg-red-50 border-b border-red-100"
          style={{ paddingLeft: indent }}>
          <input
            type="text"
            placeholder="差し戻しコメント（必須）"
            value={revComment}
            onChange={e => setRevComment(e.target.value)}
            autoFocus
            className="flex-1 text-xs border border-red-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-red-400"
          />
          <button
            onClick={() => void handleRequestRevision()}
            disabled={!revComment.trim() || actionLoading === 'revision'}
            className="text-xs bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 disabled:opacity-50 shrink-0"
          >
            {actionLoading === 'revision' ? '送信中…' : '差し戻す'}
          </button>
          <button
            onClick={() => { setRequestingRevision(false); setRevComment('') }}
            className="text-xs text-gray-500 hover:text-gray-700 shrink-0"
          >
            キャンセル
          </button>
        </div>
      )}

      {/* 配下ノード */}
      {node.children.map(c => (
        <SubmissionNode key={c.id} node={c} depth={depth + 1} onRefresh={onRefresh} />
      ))}

      {delegating && (
        <DelegationModal
          roundCompanyId={node.roundCompanyId}
          parentId={node.id}
          onCreated={() => { setDelegating(false); onRefresh() }}
          onCancel={() => setDelegating(false)}
        />
      )}
    </div>
  )
}

interface Props {
  round:       ApiRound
  onBack:      () => void
  onFinalized: () => void
}

export function RoundDetailView({ round: initialRound, onBack, onFinalized }: Props) {
  const [round,      setRound]      = useState(initialRound)
  const [companies,  setCompanies]  = useState<ApiRoundCompany[]>([])
  const [tree,       setTree]       = useState<TreeNode[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [delegating, setDelegating] = useState(false)
  const [finalizing, setFinalizing] = useState(false)

  // トップレベル委任で使う roundCompanyId — 会社が1つなら自動選択、複数なら選択させる
  const [selectedRcId, setSelectedRcId] = useState('')

  const loadTree = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [fresh, rawTree, cos] = await Promise.all([
        adminApi.rounds.get(round.id),
        adminApi.rounds.getTree(round.id),
        adminApi.rounds.getCompanies(round.id),
      ])
      setRound(fresh)
      setTree(buildTree(rawTree))
      setCompanies(cos)
      if (cos.length === 1 && !selectedRcId) setSelectedRcId(cos[0].id)
    } catch (e) {
      const msg = String(e)
      setError(msg.includes('Not found') || msg.includes('404')
        ? 'この申請回は既に削除されています。一覧に戻ってください。'
        : msg)
    } finally { setLoading(false) }
  }, [round.id, selectedRcId])

  useEffect(() => { void loadTree() }, [loadTree])

  const handleFinalize = async () => {
    if (!window.confirm(`申請回「${round.label}」を確定しますか？`)) return
    setFinalizing(true); setError(null)
    try { await adminApi.rounds.finalize(round.id); onFinalized() }
    catch (e) { setError(String(e)); setFinalizing(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-xs text-gray-500 hover:text-gray-700">← 一覧</button>
          <span className="text-sm font-semibold text-gray-700">{round.label}</span>
          <span className="text-xs text-gray-400">{round.kind === 'annual' ? '通常' : '補正'}</span>
        </div>
        <div className="flex items-center gap-2">
          {companies.length > 1 && (
            <select
              value={selectedRcId}
              onChange={e => setSelectedRcId(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none"
            >
              <option value="">会社を選択</option>
              {companies.map(co => (
                <option key={co.id} value={co.id}>{co.companyName ?? co.companyId}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setDelegating(true)}
            disabled={!selectedRcId}
            className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            + 委任を追加
          </button>
          {round.status !== 'merged' && (
            <button onClick={handleFinalize} disabled={finalizing}
              className="text-xs font-medium bg-emerald-600 text-white px-3 py-1.5 rounded hover:bg-emerald-700 disabled:opacity-50">
              {finalizing ? '確定中…' : '申請回を確定'}
            </button>
          )}
          {round.status === 'merged' && (
            <span className="text-xs text-gray-400">確定済み</span>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 text-xs text-red-600 bg-red-50 rounded px-3 py-2">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">閉じる</button>
        </div>
      )}

      <div className="p-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">読み込み中…</div>
        ) : tree.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            委任がありません。「委任を追加」ボタンから担当者を設定してください。
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            {tree.map(n => (
              <SubmissionNode key={n.id} node={n} depth={0} onRefresh={loadTree} />
            ))}
          </div>
        )}
      </div>

      {delegating && selectedRcId && (
        <DelegationModal
          roundCompanyId={selectedRcId}
          onCreated={() => { setDelegating(false); void loadTree() }}
          onCancel={() => setDelegating(false)}
        />
      )}
    </div>
  )
}
