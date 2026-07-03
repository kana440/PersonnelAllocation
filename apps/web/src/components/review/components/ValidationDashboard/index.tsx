import { useMemo, useState }        from 'react'
import { useAcknowledgmentStore }   from '../../../../infrastructure/acknowledgmentStore'
import { makeWarningKey }           from '@personnel/domain/acknowledgment'
import type { ReviewRow }           from '../../hooks/useReviewData'
import type { IssueGroup }          from './types'
import { ErrorGroup }               from './ErrorGroup'
import { WarningGroup }             from './WarningGroup'
import { BulkFieldEditModal }       from '../BulkFieldEditModal'
import { JOB_PAIR_FIELD }           from '../BulkFieldEditModal/helpers'

interface Props {
  rows:        ReviewRow[]
  onDrillDown: (filterIssues: boolean) => void
}

export function ValidationDashboard({ rows, onDrillDown }: Props) {
  const { _items, acknowledge, unacknowledge } = useAcknowledgmentStore()
  const acknowledged = useMemo(() => new Set(_items.keys()), [_items])

  const [bulkTarget, setBulkTarget] = useState<{ field: string; rowIds: number[] } | null>(null)

  const { errorGroups, warningGroups } = useMemo(() => {
    const errors  = new Map<string, IssueGroup>()
    const warnings = new Map<string, IssueGroup>()

    for (const { row, issues, personName } of rows) {
      for (const issue of issues) {
        const map = issue.level === 'error' ? errors : warnings
        if (!map.has(issue.message)) {
          map.set(issue.message, { message: issue.message, field: issue.field as string, instances: [] })
        }
        map.get(issue.message)!.instances.push({
          rowId:      row.rowId,
          personName,
          orgCode:    (row.departmentCode as string | undefined) ?? '',
        })
      }
    }

    // jobFamily + jobType を1つのペアエラーグループに統合
    const familyGroup = errors.get([...errors.values()].find(g => g.field === 'jobFamily')?.message ?? '')
    const typeGroup   = errors.get([...errors.values()].find(g => g.field === 'jobType')?.message ?? '')
    if (familyGroup && typeGroup) {
      const mergedById = new Map<number, IssueGroup['instances'][0]>()
      ;[...familyGroup.instances, ...typeGroup.instances].forEach(i => mergedById.set(i.rowId, i))
      errors.delete(familyGroup.message)
      errors.delete(typeGroup.message)
      errors.set(JOB_PAIR_FIELD, {
        message:   'ジョブタイプ・ジョブファミリーが無効です',
        field:     JOB_PAIR_FIELD,
        instances: [...mergedById.values()],
      })
    }

    return {
      errorGroups:   [...errors.values()].sort((a, b) => b.instances.length - a.instances.length),
      warningGroups: [...warnings.values()].sort((a, b) => b.instances.length - a.instances.length),
    }
  }, [rows])

  // 警告のうち全件確認済みのグループ
  const { pendingWarnings, doneWarnings } = useMemo(() => {
    const pending: IssueGroup[] = []
    const done:    IssueGroup[] = []
    for (const g of warningGroups) {
      const allDone = g.instances.every(i => acknowledged.has(makeWarningKey(i.rowId, g.message)))
      ;(allDone ? done : pending).push(g)
    }
    return { pendingWarnings: pending, doneWarnings: done }
  }, [warningGroups, acknowledged])

  const totalIssues     = rows.reduce((acc, r) => acc + r.issues.length, 0)
  const totalAcknowledged = acknowledged.size

  if (totalIssues === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
        <div className="text-4xl">✓</div>
        <div className="text-sm font-medium">問題なし</div>
        <div className="text-xs">全 {rows.length} レコードにエラー・警告はありません</div>
      </div>
    )
  }

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden">
      {/* サマリーバー */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-gray-50 text-[11px]">
        {errorGroups.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
            エラー {errorGroups.reduce((s, g) => s + g.instances.length, 0)}
          </span>
        )}
        {pendingWarnings.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold">
            警告 {pendingWarnings.reduce((s, g) => s + g.instances.length, 0)}
          </span>
        )}
        {totalAcknowledged > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">
            確認済 {totalAcknowledged}
          </span>
        )}
        <button
          onClick={() => onDrillDown(true)}
          className="ml-auto text-[10px] px-2 py-0.5 rounded bg-gray-700 text-white hover:bg-gray-800 transition-colors"
        >
          一覧で確認 →
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {/* エラーセクション */}
        {errorGroups.length > 0 && (
          <section>
            <div className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">
              ❌ エラー — 修正が必要
            </div>
            <div className="space-y-2">
              {errorGroups.map(g => (
                <ErrorGroup
                  key={g.message}
                  group={g}
                  onDrillDown={() => onDrillDown(true)}
                  onBulkEdit={() => setBulkTarget({ field: g.field, rowIds: g.instances.map(i => i.rowId) })}
                />
              ))}
            </div>
          </section>
        )}

        {/* 未確認警告セクション */}
        {pendingWarnings.length > 0 && (
          <section>
            <div className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide mb-1.5">
              ⚠️ 警告 — 確認・承認が必要
            </div>
            <div className="space-y-2">
              {pendingWarnings.map(g => (
                <WarningGroup
                  key={g.message}
                  group={g}
                  acknowledged={acknowledged}
                  onAcknowledge={acknowledge}
                  onUnacknowledge={unacknowledge}
                />
              ))}
            </div>
          </section>
        )}

        {/* 確認済み警告セクション */}
        {doneWarnings.length > 0 && (
          <section>
            <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1.5">
              ✅ 確認済み
            </div>
            <div className="space-y-2">
              {doneWarnings.map(g => (
                <WarningGroup
                  key={g.message}
                  group={g}
                  acknowledged={acknowledged}
                  onAcknowledge={acknowledge}
                  onUnacknowledge={unacknowledge}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>

    {bulkTarget && (
      <BulkFieldEditModal
        field={bulkTarget.field}
        rowIds={bulkTarget.rowIds}
        onClose={() => setBulkTarget(null)}
      />
    )}
    </>
  )
}
