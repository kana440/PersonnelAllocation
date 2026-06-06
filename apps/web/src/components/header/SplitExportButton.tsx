import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { useUserSession } from '../../store/useUserSession'
import { buildExportBuffer } from '../../infrastructure/excel/engine'
import { toAllocationRows } from '../../infrastructure/allocationListMapper'

interface AssigneeSummary {
  assignee: string  // never empty — unmapped rows use '（未割当）'
  rowCount: number
}

interface ExportState {
  kind: 'idle' | 'confirm' | 'exporting' | 'done' | 'error'
  progress?: string
  error?: string
  exportedCount?: number
}

export function SplitExportButton() {
  const { allocationList, afterOrganizations, effectiveDate } = useStore()
  const { capabilities } = useUserSession()
  const [state, setState] = useState<ExportState>({ kind: 'idle' })

  // assignee → row count ('' / undefined → '（未割当）')
  const summaries = useMemo((): AssigneeSummary[] => {
    const counts = new Map<string, number>()
    for (const row of allocationList) {
      const a = (row.assignee && row.assignee.trim()) ? row.assignee.trim() : '（未割当）'
      counts.set(a, (counts.get(a) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => {
        if (a[0] === '（未割当）') return 1
        if (b[0] === '（未割当）') return -1
        return a[0].localeCompare(b[0], 'ja')
      })
      .map(([assignee, rowCount]) => ({ assignee, rowCount }))
  }, [allocationList])

  const exportableAssignees = useMemo(
    () => summaries.filter(s => s.assignee !== '（未割当）'),
    [summaries]
  )

  // チェックボックス選択（初期値：全選択）
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  // confirm を開くたびに全選択に戻す
  const openConfirm = useCallback(() => {
    setSelected(new Set(exportableAssignees.map(s => s.assignee)))
    setState({ kind: 'confirm' })
  }, [exportableAssignees])

  const toggleOne = (assignee: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(assignee) ? next.delete(assignee) : next.add(assignee)
      return next
    })

  const allChecked  = exportableAssignees.length > 0 && selected.size === exportableAssignees.length
  const someChecked = selected.size > 0 && !allChecked
  const toggleAll   = () =>
    setSelected(allChecked ? new Set() : new Set(exportableAssignees.map(s => s.assignee)))

  const handleExport = useCallback(async () => {
    const targets = exportableAssignees.filter(s => selected.has(s.assignee))
    setState({ kind: 'exporting', progress: '準備中...' })
    try {
      for (let i = 0; i < targets.length; i++) {
        const { assignee } = targets[i]
        setState({ kind: 'exporting', progress: `${i + 1} / ${targets.length}：${assignee}` })
        const domainRows = allocationList.filter(r =>
          (r.assignee && r.assignee.trim()) ? r.assignee.trim() === assignee : false
        )
        const rows = toAllocationRows(domainRows, afterOrganizations)
        const { buffer, fileName } = await buildExportBuffer(rows, effectiveDate, assignee)
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.download = fileName
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        await new Promise(r => setTimeout(r, 300))
      }
      setState({ kind: 'done', exportedCount: targets.length })
    } catch (err) {
      setState({ kind: 'error', error: String(err) })
    }
  }, [exportableAssignees, selected, allocationList, afterOrganizations, effectiveDate])

  if (!capabilities.canSplitExport) return null

  return (
    <>
      <button
        onClick={openConfirm}
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
        title="担当者ごとに分割してExcelをダウンロード"
      >
        <span>📤</span><span>分割エクスポート</span>
      </button>

      {state.kind !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden text-gray-800"
            style={{ width: '520px', maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* ── confirm ── */}
            {state.kind === 'confirm' && (
              <>
                <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
                  <div className="text-sm font-bold text-gray-800">分割エクスポート</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    出力する担当者をチェックして「ダウンロード開始」を押してください。
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = someChecked }}
                            onChange={toggleAll}
                            className="accent-blue-600"
                            title="全選択/全解除"
                          />
                        </th>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">担当者</th>
                        <th className="text-right px-4 py-2 font-medium text-gray-500 w-20">行数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaries.map((s, i) => {
                        const isUnassigned = s.assignee === '（未割当）'
                        const isChecked    = selected.has(s.assignee)
                        return (
                          <tr
                            key={s.assignee}
                            className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isUnassigned ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50'}`}
                            onClick={isUnassigned ? undefined : () => toggleOne(s.assignee)}
                          >
                            <td className="w-10 px-3 py-2.5 text-center">
                              {isUnassigned ? (
                                <span className="text-gray-300">—</span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleOne(s.assignee)}
                                  onClick={e => e.stopPropagation()}
                                  className="accent-blue-600"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-800 font-medium">
                              {isUnassigned
                                ? <span className="text-gray-400 italic text-xs">{s.assignee}（出力対象外）</span>
                                : s.assignee
                              }
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                              {s.rowCount.toLocaleString()}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td />
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {selected.size} 件選択（全 {exportableAssignees.length} 件）
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
                  <button
                    onClick={() => setState({ kind: 'idle' })}
                    className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={selected.size === 0}
                    className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 font-medium"
                  >
                    ダウンロード開始（{selected.size}件）
                  </button>
                </div>
              </>
            )}

            {/* ── exporting ── */}
            {state.kind === 'exporting' && (
              <div className="p-6 flex flex-col gap-3">
                <div className="text-sm font-bold text-gray-800">エクスポート中...</div>
                <div className="text-xs text-gray-500">{state.progress}</div>
                <div className="h-1 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-400 animate-pulse w-2/3" />
                </div>
              </div>
            )}

            {/* ── done ── */}
            {state.kind === 'done' && (
              <div className="p-6 flex flex-col gap-4">
                <div className="text-sm font-bold text-gray-800">エクスポート完了</div>
                <div className="text-xs text-gray-600">
                  {state.exportedCount} ファイルのダウンロードを開始しました。
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setState({ kind: 'idle' })}
                    className="px-4 py-1.5 rounded text-xs bg-gray-800 text-white hover:bg-gray-700"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {/* ── error ── */}
            {state.kind === 'error' && (
              <div className="p-6 flex flex-col gap-3">
                <div className="text-sm font-bold text-red-700">エラー</div>
                <div className="text-xs text-red-600 break-all">{state.error}</div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setState({ kind: 'idle' })}
                    className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
