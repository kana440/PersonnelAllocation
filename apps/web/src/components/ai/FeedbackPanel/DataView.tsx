import { useRef, useState } from 'react'
import { feedbackStore } from '../../../infrastructure/ai/feedback/feedbackStore'
import type { CorrectionCapture, ClassifiedCorrection, AiAppliedRule, AiCodeFixRequest } from '../../../infrastructure/ai/feedback/types'
import { toolRegistry } from '../../../infrastructure/ai/toolRegistry'

interface ExportBundle {
  version:      1
  exportedAt:   string
  corrections:  CorrectionCapture[]
  classified:   ClassifiedCorrection[]
  appliedRules: AiAppliedRule[]
  codeFixes:    AiCodeFixRequest[]
}

interface Props {
  onRefresh: () => void
}

export function DataView({ onRefresh }: Props) {
  const importRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  const flash = (msg: string) => {
    setStatus(msg)
    setTimeout(() => setStatus(null), 3000)
  }

  const handleExport = () => {
    const bundle: ExportBundle = {
      version:      1,
      exportedAt:   new Date().toISOString(),
      corrections:  feedbackStore.getCaptures(),
      classified:   feedbackStore.getClassified(),
      appliedRules: feedbackStore.getAppliedRules(),
      codeFixes:    feedbackStore.getCodeFixes(),
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `ai-feedback-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    flash('✅ エクスポートしました')
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const raw  = await file.text()
      const data = JSON.parse(raw) as ExportBundle
      if (data.version !== 1) throw new Error('バージョンが不明')

      for (const c of data.corrections  ?? []) feedbackStore.saveCapture(c)
      for (const c of data.classified   ?? []) feedbackStore.saveClassified(c)
      for (const r of data.appliedRules ?? []) {
        feedbackStore.saveAppliedRule(r)
        if (r.kind === 'tool_description' && r.isActive) {
          toolRegistry.applyDescriptionOverrides({ [r.targetKey]: r.newContent })
        }
      }
      for (const f of data.codeFixes ?? []) feedbackStore.saveCodeFix(f)

      onRefresh()
      flash(`✅ インポートしました（キャプチャ ${data.corrections?.length ?? 0} 件）`)
    } catch (err) {
      flash(`❌ インポート失敗: ${String(err)}`)
    }
  }

  const handleClearHistory = () => {
    if (!confirm('訂正履歴（キャプチャ・分類結果）をクリアします。適用済みのルール・スキルは残ります。よろしいですか？')) return
    feedbackStore.clearHistory()
    onRefresh()
    flash('✅ 履歴をクリアしました')
  }

  const handleResetAll = () => {
    if (!confirm('⚠ 全データをリセットします。学習済みのルール・スキル・Code Fix依頼がすべて失われます。よろしいですか？')) return
    feedbackStore.resetAll()
    onRefresh()
    flash('✅ リセットしました')
  }

  const stats = feedbackStore.getStats()

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
      {status && (
        <div className="text-xs text-center py-1.5 px-3 bg-gray-700 text-white rounded-lg">
          {status}
        </div>
      )}

      {/* 現在の保存データ量 */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-1 text-sm">
        <p className="text-xs font-semibold text-gray-600 mb-2">保存データ</p>
        <div className="flex justify-between text-xs"><span className="text-gray-500">訂正キャプチャ</span><span>{stats.captureCount} 件</span></div>
        <div className="flex justify-between text-xs"><span className="text-gray-500">ツール説明の改善</span><span>{stats.toolDescriptionCount} 件</span></div>
        <div className="flex justify-between text-xs"><span className="text-gray-500">業務ルール</span><span>{stats.learnedRuleCount} 件</span></div>
        <div className="flex justify-between text-xs"><span className="text-gray-500">Code Fix依頼</span><span>{stats.codeFixCount} 件</span></div>
      </div>

      {/* エクスポート */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-600">バックアップ / 移行</p>
        <button
          onClick={handleExport}
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors text-left flex items-center gap-2"
        >
          <span>📦</span>
          <span>全データをエクスポート（JSON）</span>
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors text-left flex items-center gap-2"
        >
          <span>📂</span>
          <span>データをインポート</span>
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => void handleImport(e)}
        />
        <p className="text-xs text-gray-400 leading-relaxed">
          エクスポートしたJSONを別のブラウザやデバイスでインポートすると、学習済みルール・スキルが復元されます。
        </p>
      </div>

      {/* クリア / リセット */}
      <div className="space-y-2 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-600">データ削除</p>
        <button
          onClick={handleClearHistory}
          className="w-full text-sm px-3 py-2 border border-amber-200 rounded-xl text-amber-700 hover:bg-amber-50 transition-colors text-left flex items-center gap-2"
        >
          <span>🗑</span>
          <span>訂正履歴をクリア（適用済みルールは残す）</span>
        </button>
        <button
          onClick={handleResetAll}
          className="w-full text-sm px-3 py-2 border border-red-200 rounded-xl text-red-700 hover:bg-red-50 transition-colors text-left flex items-center gap-2"
        >
          <span>⚠</span>
          <span>すべてリセット（学習内容が完全に消えます）</span>
        </button>
      </div>
    </div>
  )
}
