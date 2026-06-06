import { useState, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import type { PositionCodeAssignment } from '../../ports'
import { buildExportText, parseImportText } from './helpers'

type Step = 'export' | 'import' | 'done'

interface Props {
  onClose: () => void
}

export function PositionCodeAssignmentDialog({ onClose }: Props) {
  const store = useStore()
  const positions = store.getUnassignedPositions()

  const [step,        setStep]        = useState<Step>('export')
  const [pasteText,   setPasteText]   = useState('')
  const [parsed,      setParsed]      = useState<PositionCodeAssignment[]>([])
  const [parseError,  setParseError]  = useState<string | null>(null)
  const [applyError,  setApplyError]  = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState(0)
  const [copied,      setCopied]      = useState(false)

  const exportText = buildExportText(positions)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(exportText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [exportText])

  const handleParse = useCallback(() => {
    setParseError(null)
    const result = parseImportText(pasteText)
    if (result.length === 0) {
      setParseError('有効なポジションコード（P + 8桁数字）が見つかりませんでした。書式を確認してください。')
      return
    }
    setParsed(result)
    setStep('import')
  }, [pasteText])

  const handleApply = useCallback(() => {
    setApplyError(null)
    const result = store.assignPositionCodes(parsed)
    if (!result.ok) {
      setApplyError(result.errors?.[0]?.message ?? '割り当てに失敗しました')
      return
    }
    setAppliedCount(parsed.length)
    setStep('done')
  }, [store, parsed])

  if (positions.length === 0 && step === 'export') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
          <h2 className="text-base font-bold text-gray-800">ポジションコード割当</h2>
          <p className="text-sm text-gray-600">内部採番コード（_pos_…）のポジションがありません。</p>
          <button onClick={onClose} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">閉じる</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h2 className="text-base font-bold text-gray-800">ポジションコード割当</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-gray-200 flex-shrink-0">
          {(['export', 'import', 'done'] as Step[]).map((s, i) => (
            <div key={s} className={`px-4 py-2 text-xs font-medium border-b-2 ${
              step === s ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-400'
            }`}>
              {i + 1}. {s === 'export' ? '一覧をコピー' : s === 'import' ? 'コードを貼り付け' : '完了'}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* Step 1: Export */}
          {step === 'export' && (
            <>
              <p className="text-sm text-gray-600">
                内部採番コード（_pos_…）のポジションが <strong>{positions.length} 件</strong> あります。
                「一覧をコピー」でスプレッドシートに貼り付け、<strong>「新ポジションコード」列</strong>（6列目）に
                P + 8桁数字（例: P12345678）を記入して、次のステップで貼り戻してください。
              </p>

              {/* Preview table */}
              <div className="border border-gray-200 rounded overflow-auto" style={{ maxHeight: 280 }}>
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left text-gray-500 font-medium">rowId</th>
                      <th className="px-2 py-1.5 text-left text-gray-500 font-medium">内部コード</th>
                      <th className="px-2 py-1.5 text-left text-gray-500 font-medium">職種</th>
                      <th className="px-2 py-1.5 text-left text-gray-500 font-medium">組織</th>
                      <th className="px-2 py-1.5 text-left text-gray-500 font-medium text-blue-600">新ポジションコード（記入欄）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map(p => (
                      <tr key={p.rowId} className="border-t border-gray-100">
                        <td className="px-2 py-1 text-gray-500">{p.rowId}</td>
                        <td className="px-2 py-1 font-mono text-gray-500">{p.positionCode}</td>
                        <td className="px-2 py-1 text-gray-800">{p.localJobTitle || '—'}</td>
                        <td className="px-2 py-1 text-gray-600">{p.orgName}</td>
                        <td className="px-2 py-1 text-gray-300 italic">（空欄）</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {copied ? '✓ コピーしました' : '📋 一覧をクリップボードにコピー'}
                </button>
                <button
                  onClick={() => setStep('import')}
                  className="flex-1 py-2.5 text-sm font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  次へ（コードを貼り付け）→
                </button>
              </div>
            </>
          )}

          {/* Step 2: Import + Preview */}
          {(step === 'import') && (
            <>
              <p className="text-sm text-gray-600">
                スプレッドシートで「新ポジションコード」列（6列目）を記入した後、全体をコピーしてここに貼り付けてください。
              </p>

              <textarea
                className="w-full font-mono text-xs border border-gray-300 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
                rows={6}
                placeholder="スプレッドシートをコピーしてここに貼り付け…"
                value={pasteText}
                onChange={e => { setPasteText(e.target.value); setParsed([]); setParseError(null) }}
              />

              {parseError && (
                <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{parseError}</div>
              )}

              {parsed.length === 0 && (
                <button
                  onClick={handleParse}
                  disabled={!pasteText.trim()}
                  className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  解析してプレビュー
                </button>
              )}

              {/* Preview after parse */}
              {parsed.length > 0 && (
                <>
                  <p className="text-sm text-emerald-700 font-medium">{parsed.length} 件のコードを確認してください：</p>
                  <div className="border border-gray-200 rounded overflow-auto" style={{ maxHeight: 240 }}>
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">rowId</th>
                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">内部コード（現在）</th>
                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">→ 新コード</th>
                          <th className="px-2 py-1.5 text-left text-gray-500 font-medium">職種</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.map(a => {
                          const pos = positions.find(p => p.rowId === a.rowId)
                          return (
                            <tr key={a.rowId} className="border-t border-gray-100">
                              <td className="px-2 py-1 text-gray-500">{a.rowId}</td>
                              <td className="px-2 py-1 font-mono text-gray-500">{pos?.positionCode ?? '—'}</td>
                              <td className="px-2 py-1 font-mono text-blue-700 font-semibold">{a.newPositionCode}</td>
                              <td className="px-2 py-1 text-gray-600">{pos?.localJobTitle || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {applyError && (
                    <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{applyError}</div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setParsed([]); setParseError(null) }}
                      className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      やり直す
                    </button>
                    <button
                      onClick={handleApply}
                      className="flex-1 py-2.5 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      確定（割り当てる）
                    </button>
                  </div>
                </>
              )}

              <button
                onClick={() => setStep('export')}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← 戻る
              </button>
            </>
          )}

          {/* Step 3: Done */}
          {step === 'done' && (
            <div className="text-center py-8 space-y-3">
              <div className="text-4xl">✅</div>
              <p className="text-sm font-semibold text-gray-800">
                {appliedCount} 件のポジションコードを割り当てました
              </p>
              <p className="text-xs text-gray-500">
                上司ポジションコード（managerPositionCode）も連動して更新されています。
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                閉じる
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
