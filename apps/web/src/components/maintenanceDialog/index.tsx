import { useState, useMemo, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { appService } from '../../application/HRApplicationService'
import {
  computeManagerNameChanges,
  computeOrgSubFieldChanges,
  mergePersonChanges,
  groupByOrg,
} from './previewComputer'
import { OrgPreviewTree } from './OrgPreviewTree'
import { PositionCodeAssignmentDialog } from '../positionCodeAssignment'
import type { OperationDef, OrgPreview } from './types'

interface Props {
  onClose: () => void
}

export function MaintenanceDialog({ onClose }: Props) {
  const store = useStore()
  const [selected,      setSelected]      = useState<Set<string>>(new Set())
  const [codeAssignOpen, setCodeAssignOpen] = useState(false)
  const [executing,     setExecuting]     = useState(false)
  const [doneResults,   setDoneResults]   = useState<Array<{ label: string; count: number }> | null>(null)

  const unassignedCount = useMemo(
    () => store.getUnassignedPositions().length,
    [store]
  )

  // ── Operation definitions ─────────────────────────────────────────────────

  const autoOps: OperationDef[] = useMemo(() => {
    const { allocationList, afterOrganizations, masters } = appService.getSnapshot()
    return [
      {
        id:          'managerNames',
        icon:        '↻',
        label:       '上司姓名 再導出',
        description: '上司ポジションコードに在籍している人の現在の姓名を、上司姓名フィールドに書き戻します。上司の担当者が変わった後などに使います。',
        kind:        'auto',
        computeChanges: () => computeManagerNameChanges(allocationList, afterOrganizations),
        execute:     () => store.reDeriveManagerNames(),
      },
      {
        id:          'orgSubFields',
        icon:        '↻',
        label:       '組織サブフィールド 再導出',
        description: '組織コードをもとに、ビジネスユニット / 事業部 / 部 / グループ / チームを組織マスタから再導出します。組織移動後などにサブフィールドがずれているときに使います。',
        kind:        'auto',
        computeChanges: () => computeOrgSubFieldChanges(allocationList, afterOrganizations, masters),
        execute:     () => store.reDeriveOrgSubFields(),
      },
    ]
  }, [store])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preview computation ────────────────────────────────────────────────────

  const preview = useMemo<OrgPreview[]>(() => {
    const { allocationList, afterOrganizations } = appService.getSnapshot()
    const sel = autoOps.filter(op => selected.has(op.id))
    if (sel.length === 0) return []
    const batches = sel.map(op => op.computeChanges())
    const merged  = mergePersonChanges(batches)
    return groupByOrg(merged, allocationList, afterOrganizations)
  }, [selected, autoOps])

  const totalAffected = preview.reduce((s, g) => s + g.affected.length, 0)

  // ── Per-operation change counts ───────────────────────────────────────────

  const changeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const op of autoOps) counts[op.id] = op.computeChanges().length
    return counts
  }, [autoOps])

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleExecute = useCallback(() => {
    setExecuting(true)
    const results: Array<{ label: string; count: number }> = []
    for (const op of autoOps) {
      if (!selected.has(op.id) || !op.execute) continue
      results.push({ label: op.label, count: op.execute() })
    }
    setDoneResults(results)
    setExecuting(false)
  }, [autoOps, selected])

  const autoSelected = autoOps.filter(op => selected.has(op.id))

  // ── Done screen ───────────────────────────────────────────────────────────

  if (doneResults) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
          <h2 className="text-base font-bold text-gray-800">実行完了</h2>
          <div className="space-y-2">
            {doneResults.map(r => (
              <div key={r.label} className="flex items-center gap-2 text-sm">
                <span className="text-emerald-500">✓</span>
                <span className="text-gray-700 flex-1">{r.label}</span>
                <span className="text-gray-500 text-xs">{r.count}行更新</span>
              </div>
            ))}
            {doneResults.length === 0 && (
              <p className="text-sm text-gray-500">変更対象の行はありませんでした。</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div
          className="bg-white rounded-xl shadow-xl w-full mx-4 flex flex-col"
          style={{ maxWidth: 900, maxHeight: '90vh' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-base font-bold text-gray-800">メンテナンス</h2>
              <p className="text-xs text-gray-500 mt-0.5">処理を選んでプレビューを確認してから実行してください</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
          </div>

          {/* Body: two-column */}
          <div className="flex flex-1 overflow-hidden min-h-0">

            {/* Left: operation panels */}
            <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col overflow-y-auto">

              {/* ── Section 1: 自動導出 ─────────────────────────────── */}
              <div className="px-4 pt-4 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-gray-700">自動導出</span>
                  <span className="text-xs text-gray-400">選択してプレビューを確認</span>
                </div>
                <div className="space-y-2">
                  {autoOps.map(op => {
                    const count      = changeCounts[op.id] ?? 0
                    const isChecked  = selected.has(op.id)
                    const hasChanges = count > 0
                    return (
                      <div
                        key={op.id}
                        onClick={() => toggle(op.id)}
                        className={`rounded-lg border p-3 cursor-pointer transition-colors select-none ${
                          isChecked
                            ? 'border-blue-400 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                            isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                          }`}>
                            {isChecked && <span className="text-white text-xs leading-none">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-gray-400 text-xs">{op.icon}</span>
                              <span className={`text-xs font-semibold ${isChecked ? 'text-blue-700' : 'text-gray-800'}`}>
                                {op.label}
                              </span>
                              {hasChanges ? (
                                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                                  {count}件変更
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">変更なし</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{op.description}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="mx-4 border-t border-gray-100 my-2" />

              {/* ── Section 2: ポジションコード割当 ─────────────────── */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-gray-700">ポジションコード割当</span>
                </div>
                <div
                  onClick={() => setCodeAssignOpen(true)}
                  className="rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 p-3 cursor-pointer transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base leading-none flex-shrink-0">🔢</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">ポジションコード割当</span>
                        {unassignedCount > 0 ? (
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                            {unassignedCount}件（要入力）
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">対象なし</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                        内部採番コード（_pos_…）のポジションに正式な外部コード（P + 8桁数字）を割り当てます。
                        スプレッドシートの番号表からコードを取得してここで登録します。
                        上司ポジションコードの参照も連動して更新されます。
                      </p>
                      <div className="mt-2">
                        <span className="text-xs text-blue-600 font-medium underline">
                          クリックして割当ダイアログを開く →
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Right: preview */}
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">変更プレビュー（自動導出）</span>
                {autoSelected.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {autoSelected.map(op => op.label).join(' + ')} —
                    <span className="text-blue-600 font-semibold ml-1">{totalAffected}行が対象</span>
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {autoSelected.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                    <span className="text-3xl text-gray-200">☑</span>
                    <p className="text-sm text-gray-400">左で自動導出の処理を選択するとここに変更内容が表示されます</p>
                  </div>
                ) : (
                  <OrgPreviewTree groups={preview} />
                )}
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              キャンセル
            </button>
            <button
              onClick={handleExecute}
              disabled={autoSelected.length === 0 || executing}
              className="px-6 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {executing
                ? '処理中…'
                : autoSelected.length === 0
                  ? '自動導出の処理を選択してください'
                  : `選択した処理を実行（${autoSelected.length}件）`}
            </button>
          </div>

        </div>
      </div>

      {codeAssignOpen && (
        <PositionCodeAssignmentDialog onClose={() => setCodeAssignOpen(false)} />
      )}
    </>
  )
}
