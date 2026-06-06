import { useRef, useState, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { useUserSession } from '../../store/useUserSession'
import { importFromFile } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import type { ImportMode, AssigneeImportMode } from '../../application/importMerge'

type Step =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: string }
  | { kind: 'preview'; result: ImportedWorkbookResult }
  | { kind: 'done'; added: number; kept: number; removed: number }
  | { kind: 'error'; message: string }

const MODE_OPTIONS: { mode: ImportMode; label: string; desc: string }[] = [
  {
    mode:  'replace-all',
    label: '全件置換',
    desc:  '現在のデータをすべて削除し、インポートデータに置き換えます',
  },
  {
    mode:  'append-new',
    label: '新規追記',
    desc:  '既存データに存在しない行だけを追加します（グループ社員ID＋所属コードで重複判定）',
  },
]

const ASSIGNEE_MODE_OPTIONS: { mode: AssigneeImportMode; label: string; desc: string }[] = [
  {
    mode:  'overwrite',
    label: '担当者情報を上書き',
    desc:  'インポートファイルのA列（担当者名）でセッションの担当者情報を置き換えます',
  },
  {
    mode:  'preserve',
    label: '担当者情報を保持',
    desc:  '既存の担当者設定を維持します。担当者が未設定の行のみ、インポートファイルの値を使用します',
  },
]

interface AssigneeSummary {
  assignee: string
  rowCount: number
}

function computeAssigneeSummaries(result: ImportedWorkbookResult): AssigneeSummary[] {
  const counts = new Map<string, number>()
  for (const row of result.allocationList) {
    const a = row.assignee || '（未割当）'
    counts.set(a, (counts.get(a) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
    .map(([assignee, rowCount]) => ({ assignee, rowCount }))
}

export function MergeImportButton() {
  const { mergeExcelData } = useStore()
  const { capabilities }   = useUserSession()
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!capabilities.canImport) return null
  const [step,          setStep]          = useState<Step>({ kind: 'idle' })
  const [selectedMode,  setSelectedMode]  = useState<ImportMode>('replace-all')
  const [assigneeMode,  setAssigneeMode]  = useState<AssigneeImportMode>('overwrite')

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setStep({ kind: 'loading', progress: '解析中...' })
    try {
      const result = await importFromFile(file, msg => setStep({ kind: 'loading', progress: msg }))
      if (result) {
        setStep({ kind: 'preview', result })
      } else {
        setStep({ kind: 'error', message: 'ファイルの読み込みに失敗しました' })
      }
    } catch (err) {
      setStep({ kind: 'error', message: String(err) })
    }
  }

  const handleApply = () => {
    if (step.kind !== 'preview') return
    const result = mergeExcelData({
      allocationList: step.result.allocationList,
      mode:           selectedMode,
      assigneeMode,
    })
    setStep({ kind: 'done', added: result.added, kept: result.kept, removed: result.removed })
  }

  const close = () => setStep({ kind: 'idle' })

  const assigneeSummaries = useMemo(
    () => step.kind === 'preview' ? computeAssigneeSummaries(step.result) : [],
    [step]
  )

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />

      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
        title="追加インポート（マージモードを選択）"
      >
        📥 追加読込
      </button>

      {step.kind !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={step.kind === 'done' || step.kind === 'error' ? close : undefined}
        >
          <div
            className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '560px', maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* ── Loading ── */}
            {step.kind === 'loading' && (
              <div className="p-6 flex flex-col gap-3">
                <div className="text-sm font-bold text-gray-800">ファイルを読み込み中...</div>
                <div className="text-xs text-gray-500">{step.progress}</div>
                <div className="h-1 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-400 animate-pulse w-2/3" />
                </div>
              </div>
            )}

            {/* ── Preview ── */}
            {step.kind === 'preview' && (
              <>
                <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
                  <div className="text-sm font-bold text-gray-800">インポートプレビュー</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    計 <span className="font-semibold text-gray-700">{step.result.allocationRowCount.toLocaleString()}</span> 行
                  </div>
                </div>

                {/* Assignee summary */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    担当者サマリー（インポートファイル）
                  </div>
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-2 text-gray-500 font-medium">担当者</th>
                        <th className="text-right px-4 py-2 text-gray-500 font-medium w-20">行数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assigneeSummaries.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-gray-400">
                            担当者情報が見つかりませんでした
                          </td>
                        </tr>
                      ) : (
                        assigneeSummaries.map((s, i) => (
                          <tr key={s.assignee} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                            <td className={`px-4 py-2 truncate max-w-[320px] ${s.assignee === '（未割当）' ? 'text-gray-400 italic' : 'font-medium text-gray-800'}`}>
                              {s.assignee}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-gray-600">
                              {s.rowCount.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Options */}
                <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-4">
                  {/* Import mode */}
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">インポートモード</div>
                    <div className="flex flex-col gap-2">
                      {MODE_OPTIONS.map(opt => (
                        <label
                          key={opt.mode}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            selectedMode === opt.mode
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="import-mode"
                            value={opt.mode}
                            checked={selectedMode === opt.mode}
                            onChange={() => setSelectedMode(opt.mode)}
                            className="mt-0.5 flex-shrink-0 accent-blue-600"
                          />
                          <div>
                            <div className={`text-xs font-semibold ${selectedMode === opt.mode ? 'text-blue-700' : 'text-gray-700'}`}>
                              {opt.label}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Assignee mode */}
                  <div>
                    <div className="text-xs font-semibold text-gray-600 mb-2">担当者情報の取り扱い</div>
                    <div className="flex flex-col gap-2">
                      {ASSIGNEE_MODE_OPTIONS.map(opt => (
                        <label
                          key={opt.mode}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            assigneeMode === opt.mode
                              ? 'border-emerald-500 bg-emerald-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="assignee-mode"
                            value={opt.mode}
                            checked={assigneeMode === opt.mode}
                            onChange={() => setAssigneeMode(opt.mode)}
                            className="mt-0.5 flex-shrink-0 accent-emerald-600"
                          />
                          <div>
                            <div className={`text-xs font-semibold ${assigneeMode === opt.mode ? 'text-emerald-700' : 'text-gray-700'}`}>
                              {opt.label}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={close} className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
                      キャンセル
                    </button>
                    <button
                      onClick={handleApply}
                      className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium"
                    >
                      適用する
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Done ── */}
            {step.kind === 'done' && (
              <div className="p-6 flex flex-col gap-4" onClick={close}>
                <div className="text-sm font-bold text-gray-800">インポート完了</div>
                <div className="flex flex-col gap-1.5 text-xs">
                  {step.added > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                      <span className="text-gray-600">追加: <span className="font-semibold text-green-700">{step.added.toLocaleString()}行</span></span>
                    </div>
                  )}
                  {step.kept > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                      <span className="text-gray-600">維持: <span className="font-semibold">{step.kept.toLocaleString()}行</span></span>
                    </div>
                  )}
                  {step.removed > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      <span className="text-gray-600">削除: <span className="font-semibold text-red-600">{step.removed.toLocaleString()}行</span></span>
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-400">Undo で元に戻せます</div>
                <div className="flex justify-end">
                  <button onClick={close} className="px-4 py-1.5 rounded text-xs bg-gray-800 text-white hover:bg-gray-700">
                    閉じる
                  </button>
                </div>
              </div>
            )}

            {/* ── Error ── */}
            {step.kind === 'error' && (
              <div className="p-6 flex flex-col gap-3" onClick={close}>
                <div className="text-sm font-bold text-red-700">エラー</div>
                <div className="text-xs text-red-600 break-all">{step.message}</div>
                <div className="flex justify-end">
                  <button onClick={close} className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
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
