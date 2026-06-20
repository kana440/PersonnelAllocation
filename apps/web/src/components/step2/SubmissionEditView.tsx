import { useState, useEffect, useRef } from 'react'
import { adminApi, type ApiSubmission, type SubmissionStatus } from '../../infrastructure/api/adminApi'
import { appService } from '../../application/HRApplicationService'
import { useStore } from '../../store/useStore'
import { EditViewCore, HeaderButton } from '../editor/EditViewCore'
import { RowDelegationModal } from './RowDelegationModal'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import { EMPTY_MASTERS, type AllMasters } from '@personnel/domain/masters/aggregate'
import type { AuthUser } from '../../infrastructure/api/authApi'

interface Props {
  submission:  ApiSubmission
  user:        AuthUser
  onBack:      () => void
  onLogout:    () => void
}

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending:            '未着手',
  in_progress:        '編集中',
  submitted:          '提出済み',
  merged:             'マージ済み',
  accepted:           '承認済み',
  revision_requested: '差し戻し',
  cancelled:          '取消済み',
}

export function SubmissionEditView({ submission, user, onBack, onLogout }: Props) {
  const { allocationList } = useStore()

  const [status,          setStatus]          = useState<SubmissionStatus>(submission.status)
  const [revisionComment, setRevisionComment] = useState<string | null>(submission.revisionComment)
  const [loading,         setLoading]         = useState(true)
  const [saving,          setSaving]          = useState(false)
  const [submitting,      setSubmitting]      = useState(false)
  const [submitError,     setSubmitError]     = useState<string | null>(null)
  const [delegating,      setDelegating]      = useState(false)

  // 初回: 行・マスタを読み込んで appService に投入
  useEffect(() => {
    const load = async () => {
      try {
        const [sub, rows, masters] = await Promise.all([
          adminApi.submissions.get(submission.id),
          adminApi.submissions.getRows(submission.id),
          adminApi.rounds.getMasters(submission.roundId ?? '', submission.companyId ?? ''),
        ])
        setStatus(sub.status as SubmissionStatus)
        setRevisionComment(sub.revisionComment)

        const hasMasters = (masters.beforeOrganizations.length > 0 || masters.afterOrganizations.length > 0)
        if (hasMasters) {
          // 組織マスタあり: フル状態で初期化（キャンバスが動く）
          appService.loadExcelData({
            allocationList:      rows as AllocationRow[],
            beforeOrganizations: masters.beforeOrganizations as Organization[],
            afterOrganizations:  masters.afterOrganizations  as Organization[],
            masters:           { ...EMPTY_MASTERS, ...(masters.masters as Partial<AllMasters>) },
          })
        } else {
          // マスタ未登録（Revision ベースの申請回）: 行のみ差し替え
          appService.loadRowsOnly(rows as AllocationRow[])
        }
      } finally {
        setLoading(false)
      }
    }
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id])

  // 変更があるたびにデバウンス付きで自動保存
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isReadOnly   = status === 'submitted' || status === 'merged' || status === 'accepted' || status === 'cancelled'

  useEffect(() => {
    if (loading || isReadOnly) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      try {
        await adminApi.submissions.putRows(submission.id, allocationList)
      } catch (_e) {
        // auto-save failure は silent — 次の変更で再試行される
      } finally {
        setSaving(false)
      }
    }, 2000)
    return () => clearTimeout(saveTimerRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocationList])

  const handleSubmit = async (force = false): Promise<void> => {
    setSubmitting(true); setSubmitError(null)
    try {
      await adminApi.submissions.submit(submission.id, { force })
      setStatus('submitted')
      onBack()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!force && msg.includes('未提出')) {
        const count = msg.match(/\d+/)?.[0] ?? '?'
        if (window.confirm(
          `配下の ${count} 件が未提出です。強制提出しますか？\n（未提出の依頼はキャンセルされます）`
        )) {
          await handleSubmit(true)
          return
        }
      } else {
        setSubmitError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="flex h-screen items-center justify-center text-gray-400 text-sm">読み込み中…</div>
  )

  const roundLabel = submission.roundLabel ?? submission.roundCompanyId.slice(0, 8)
  const scopeLabel = (() => {
    try {
      const s = JSON.parse(submission.scope) as { kind: string; codes?: string[]; level?: number }
      if (s.kind === 'all') return '全体'
      if (s.kind === 'org' && s.codes) return s.codes.join(', ')
      if (s.kind === 'level' && s.level != null) return `Lv${s.level}以下`
      return s.kind
    } catch {
      return '—'
    }
  })()

  return (
    <>
    <EditViewCore
      headerLeft={
        <>
          <button onClick={onBack} className="text-gray-300 hover:text-white text-sm shrink-0">
            ← 依頼一覧
          </button>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-white truncate">{roundLabel}</span>
            <span className="ml-2 text-xs text-gray-400">{scopeLabel}</span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
            isReadOnly ? 'bg-yellow-600 text-yellow-100' : 'bg-gray-700 text-gray-300'
          }`}>
            {STATUS_LABELS[status]}
          </span>
        </>
      }
      headerRight={
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-gray-400">保存中…</span>}
          <button onClick={onLogout} className="text-xs text-gray-400 hover:text-white">
            ログアウト
          </button>
          {!isReadOnly && user.role !== 'member' && (
            <HeaderButton
              onClick={() => setDelegating(true)}
              activeClass="bg-gray-600 text-white"
              active
            >
              行を選択して委任
            </HeaderButton>
          )}
          {!isReadOnly && (
            <HeaderButton
              onClick={() => void handleSubmit()}
              disabled={submitting}
              activeClass="bg-blue-600 text-white"
              active
            >
              {submitting ? '提出中…' : '提出する →'}
            </HeaderButton>
          )}
        </div>
      }
      topBanner={
        <>
          {status === 'cancelled' && (
            <div className="bg-gray-100 border-b border-gray-300 px-4 py-2 text-xs text-gray-600 flex-shrink-0">
              この依頼は取り消されました（担当者が強制提出を実行しました）
            </div>
          )}
          {revisionComment && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 flex-shrink-0">
              差し戻しコメント: {revisionComment}
            </div>
          )}
          {submitError && (
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700 flex-shrink-0 flex items-center gap-2">
              提出エラー: {submitError}
              <button onClick={() => setSubmitError(null)} className="underline ml-2">閉じる</button>
            </div>
          )}
        </>
      }
    />
    {delegating && (
      <RowDelegationModal
        submission={submission}
        onCreated={() => setDelegating(false)}
        onCancel={() => setDelegating(false)}
      />
    )}
  </>
  )
}
