import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import { BulkSetAssigneeOperation } from '@personnel/domain/commands/handlers/bulkSetAssignee'
import {
  getRootOrgs, getAvailableLevels, buildUseThisForDepth,
  computeGroupNodeIds, computeRowCountByGroupId, buildRowAssignments,
} from './helpers'
import { OrgTreeItem } from './OrgTree'

type Step = 1 | 2

interface Props {
  onClose: () => void
}

export function AssigneeWizard({ onClose }: Props) {
  const { beforeOrganizations, allocationList } = useStore()

  const rootOrgs       = useMemo(() => getRootOrgs(beforeOrganizations),       [beforeOrganizations])
  const availableLevels = useMemo(() => getAvailableLevels(beforeOrganizations), [beforeOrganizations])

  const [step, setStep] = useState<Step>(1)

  // true = stop here (group node), false = go to children. Missing = default true.
  // Empty map → level-2 orgs are group nodes by default (they're the first frontier).
  const [useThis, setUseThis] = useState<Map<string, boolean>>(() => new Map())

  // orgId → user-typed assignee. Missing = org name is used as default.
  const [orgAssignees, setOrgAssignees] = useState<Map<string, string>>(() => new Map())

  const groupNodeIds = useMemo(
    () => computeGroupNodeIds(useThis, beforeOrganizations),
    [useThis, beforeOrganizations]
  )

  const rowCounts = useMemo(
    () => computeRowCountByGroupId(groupNodeIds, beforeOrganizations, allocationList),
    [groupNodeIds, beforeOrganizations, allocationList]
  )

  const existingAssignees = useMemo(() => {
    const names = new Set(allocationList.map(r => r.assignee).filter(Boolean) as string[])
    return [...names].sort((a, b) => a.localeCompare(b, 'ja'))
  }, [allocationList])

  // Effective assignee per group node (user input or org name fallback)
  const effectiveAssignees = useMemo(() => {
    const idToOrg = new Map(beforeOrganizations.map(o => [o.id, o]))
    return new Map(
      [...groupNodeIds].map(id => [id, orgAssignees.get(id) ?? idToOrg.get(id)?.name ?? ''])
    )
  }, [groupNodeIds, orgAssignees, beforeOrganizations])

  const handleUseThisChange = useCallback((orgId: string, value: boolean) => {
    setUseThis(prev => new Map([...prev, [orgId, value]]))
  }, [])

  const handleAssigneeChange = useCallback((orgId: string, value: string) => {
    setOrgAssignees(prev => new Map([...prev, [orgId, value]]))
  }, [])

  // Global bulk-set: apply target level to all orgs at once
  const handleBulkDepth = useCallback((targetLevel: number) => {
    setUseThis(buildUseThisForDepth(targetLevel, beforeOrganizations))
  }, [beforeOrganizations])

  const handleConfirm = useCallback(() => {
    const assignments = buildRowAssignments(groupNodeIds, effectiveAssignees, beforeOrganizations, allocationList)
    appService.executeOperation(new BulkSetAssigneeOperation(assignments))
    onClose()
  }, [groupNodeIds, effectiveAssignees, beforeOrganizations, allocationList, onClose])

  // Confirm step summary
  const { summary, totalAssigned, totalSkipped } = useMemo(() => {
    const assignments = buildRowAssignments(groupNodeIds, effectiveAssignees, beforeOrganizations, allocationList)
    const counts = new Map<string, number>()
    for (const a of assignments.values()) counts.set(a, (counts.get(a) ?? 0) + 1)
    return {
      summary:       [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja')),
      totalAssigned: assignments.size,
      totalSkipped:  allocationList.length - assignments.size,
    }
  }, [groupNodeIds, effectiveAssignees, beforeOrganizations, allocationList])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden w-full max-w-3xl h-[85vh]">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-800">担当者割り当てウィザード</h2>
            <div className="flex gap-2 mt-0.5">
              {([1, 2] as Step[]).map(s => (
                <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded
                  ${step === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                >
                  {s === 1 ? '①組織ツリーで設定' : '②確認・適用'}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="p-4 space-y-3">

              {/* Global depth control */}
              {availableLevels.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500 whitespace-nowrap">一括設定:</span>
                  {availableLevels.map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => handleBulkDepth(lvl)}
                      className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      第{lvl}階層
                    </button>
                  ))}
                  <span className="text-[10px] text-gray-400">（一括変更後、個別に調整可能）</span>
                </div>
              )}

              <p className="text-xs text-gray-500">
                各組織で「この階層」を選ぶとその組織が担当者の単位になります。「配下の階層」を選ぶと一段下で設定できます。担当者名のデフォルトは組織名です。
              </p>

              <datalist id="assignee-datalist">
                {existingAssignees.map(a => <option key={a} value={a} />)}
              </datalist>

              {rootOrgs.map(root => (
                <OrgTreeItem
                  key={root.id}
                  org={root}
                  allOrgs={beforeOrganizations}
                  depth={0}
                  isFrontier={true}
                  useThis={useThis}
                  orgAssignees={orgAssignees}
                  rowCounts={rowCounts}
                  onUseThisChange={handleUseThisChange}
                  onAssigneeChange={handleAssigneeChange}
                />
              ))}
            </div>
          )}

          {step === 2 && (
            <ConfirmStep
              summary={summary}
              totalAssigned={totalAssigned}
              totalSkipped={totalSkipped}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={() => step === 1 ? onClose() : setStep(1)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {step === 1 ? 'キャンセル' : '← 戻る'}
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              確認へ →
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              適用する
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ConfirmStep({ summary, totalAssigned, totalSkipped }: {
  summary:       [string, number][]
  totalAssigned: number
  totalSkipped:  number
}) {
  return (
    <div className="p-6 space-y-4">
      <p className="text-sm text-gray-600">以下の内容で担当者を設定します。</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200 text-xs">
            <th className="text-left py-1.5 font-medium">担当者名</th>
            <th className="text-right py-1.5 font-medium">行数</th>
          </tr>
        </thead>
        <tbody>
          {summary.map(([name, count]) => (
            <tr key={name} className="border-b border-gray-100">
              <td className="py-1.5 text-gray-800">{name || '（担当者名未入力）'}</td>
              <td className="py-1.5 text-right tabular-nums text-gray-600">{count}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="text-gray-700 font-semibold text-xs border-t border-gray-300">
            <td className="pt-2">設定対象合計</td>
            <td className="pt-2 text-right tabular-nums">{totalAssigned}行</td>
          </tr>
        </tfoot>
      </table>
      {totalSkipped > 0 && (
        <p className="text-xs text-gray-400">
          ※ 旧組織コードが不明な {totalSkipped}行（新任者・旧コードなし）は変更されません。
        </p>
      )}
    </div>
  )
}
