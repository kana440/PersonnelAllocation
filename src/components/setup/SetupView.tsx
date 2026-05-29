import { useRef, useState, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { importFromFile, importFromUrl, SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import { SetupHelp } from './SetupHelp'
import { AssigneeSelectStep } from './AssigneeSelectStep'

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: string }
  | { kind: 'mode-select'; result: ImportedWorkbookResult }
  | { kind: 'assignee-select'; result: ImportedWorkbookResult }
  | { kind: 'error'; message: string }

interface Props {
  onReady: () => void
}

export function SetupView({ onReady }: Props) {
  const { loadExcelData, setScopeWithMapping, setUserSession } = useStore()
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const [phase, setPhase]     = useState<Phase>({ kind: 'idle' })
  const [showHelp, setShowHelp] = useState(false)

  const tick = () => new Promise<void>(r => setTimeout(r, 0))

  const runImport = async (fn: (onProgress: (msg: string) => void) => Promise<ImportedWorkbookResult | null>) => {
    const onProgress = (progress: string) => setPhase({ kind: 'loading', progress })
    setPhase({ kind: 'loading', progress: '準備中...' })
    try {
      const result = await fn(onProgress)
      if (result) setPhase({ kind: 'mode-select', result })
    } catch (err) {
      setPhase({ kind: 'error', message: String(err) })
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    await runImport(onProgress => importFromFile(file, onProgress))
  }

  const handleSample = () => runImport(onProgress => importFromUrl('/.local/sample.xlsx', onProgress))

  // 管理者として開く → 全行をそのままロードして開始
  const handleSelectAdmin = useCallback(async () => {
    if (phase.kind !== 'mode-select') return
    const { result } = phase
    setUserSession({ role: 'admin', assigneeName: null })
    setPhase({ kind: 'loading', progress: `データ適用中... (${result.allocationRowCount.toLocaleString()} 行)` })
    await tick()
    await loadExcelData(result)
    setScopeWithMapping({ beforeOrgId: null, mapping: new Map() })
    onReady()
  }, [phase, setUserSession, loadExcelData, setScopeWithMapping, onReady])

  // 担当者として開く → AssigneeSelectStep へ
  const handleSelectAssigneeMode = useCallback(() => {
    if (phase.kind !== 'mode-select') return
    setUserSession({ role: 'assignee', assigneeName: null })
    setPhase({ kind: 'assignee-select', result: phase.result })
  }, [phase, setUserSession])

  // 担当者選択確定 → データロード → 開始
  const handleAssigneeSelect = useCallback(async (assigneeName: string) => {
    if (phase.kind !== 'assignee-select') return
    const { result } = phase
    setPhase({ kind: 'loading', progress: `データ適用中... (${result.allocationRowCount.toLocaleString()} 行)` })
    await tick()
    await loadExcelData(result)
    setUserSession({ role: 'assignee', assigneeName: assigneeName || null })
    setScopeWithMapping({ beforeOrgId: null, mapping: new Map() })
    onReady()
  }, [phase, loadExcelData, setUserSession, setScopeWithMapping, onReady])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      {showHelp && <SetupHelp onClose={() => setShowHelp(false)} />}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />

      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8">
        {phase.kind === 'idle' && (
          <IdleView
            onFileClick={() => fileInputRef.current?.click()}
            onSample={handleSample}
            onHelp={() => setShowHelp(true)}
          />
        )}
        {phase.kind === 'loading' && <LoadingView progress={phase.progress} />}
        {phase.kind === 'mode-select' && (
          <ModeSelectView
            onAdmin={handleSelectAdmin}
            onAssignee={handleSelectAssigneeMode}
            onBack={() => setPhase({ kind: 'idle' })}
          />
        )}
        {phase.kind === 'assignee-select' && (
          <AssigneeSelectStep
            result={phase.result}
            onSelect={handleAssigneeSelect}
            onBack={() => setPhase({ kind: 'mode-select', result: phase.result })}
          />
        )}
        {phase.kind === 'error' && (
          <ErrorView message={phase.message} onBack={() => setPhase({ kind: 'idle' })} />
        )}
      </div>
    </div>
  )
}

// ── 画面①: ファイル選択 ───────────────────────────────────────────────

function IdleView({ onFileClick, onSample, onHelp }: {
  onFileClick: () => void
  onSample: () => void
  onHelp: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">要員配置リスト編集</h1>
          <p className="mt-1 text-sm text-gray-600">要員配置リストのExcelファイルを選択してください。</p>
          <p className="mt-0.5 text-xs text-gray-400">
            <span className="font-mono">{SHEET_ALLOCATION}</span>・
            <span className="font-mono">{SHEET_CODE_LISTS}</span>・
            <span className="font-mono">{SHEET_ORG_MASTER}</span> シートを自動で読み取ります。
          </p>
        </div>
        <button
          onClick={onHelp}
          title="Excelファイルの要件を確認"
          className="flex-shrink-0 w-7 h-7 rounded-full border border-gray-300 text-gray-400 text-xs hover:bg-gray-50 hover:text-gray-600 flex items-center justify-center"
        >?</button>
      </div>

      <button
        onClick={onFileClick}
        className="w-full py-3 text-sm font-semibold border-2 border-dashed border-blue-400 rounded-xl text-blue-600 hover:bg-blue-50 transition-colors"
      >
        Excelファイルを選択して開始
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">または</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <button
        onClick={onSample}
        className="w-full py-2 text-sm text-gray-500 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
      >
        サンプルデータで実行
      </button>
    </div>
  )
}

// ── 画面②: モード選択 ────────────────────────────────────────────────

function ModeSelectView({ onAdmin, onAssignee, onBack }: {
  onAdmin: () => void
  onAssignee: () => void
  onBack: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-800">どのモードで開きますか？</h2>
          <p className="mt-0.5 text-xs text-gray-500">役割に応じてモードを選択してください。</p>
        </div>
        <button
          onClick={onBack}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← 戻る
        </button>
      </div>

      <div className="space-y-3">
        <button
          onClick={onAssignee}
          className="w-full text-left px-4 py-4 border-2 border-blue-400 rounded-xl hover:bg-blue-50 transition-colors group"
        >
          <div className="text-sm font-semibold text-blue-700 group-hover:text-blue-800">
            担当者として開く
          </div>
          <div className="mt-1 text-xs text-gray-500">
            自分の担当行のみ表示・編集します。担当者名を選択して開始します。
          </div>
        </button>

        <button
          onClick={onAdmin}
          className="w-full text-left px-4 py-4 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors group"
        >
          <div className="text-sm font-semibold text-gray-700 group-hover:text-gray-800">
            管理者として開く
          </div>
          <div className="mt-1 text-xs text-gray-500">
            全行を表示・管理します。担当者の割り当て・分割エクスポートが可能です。
          </div>
        </button>
      </div>
    </div>
  )
}

// ── 画面③: 読み込み中 ────────────────────────────────────────────────

function LoadingView({ progress }: { progress: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 space-y-4">
      <div className="w-9 h-9 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-sm text-gray-500">{progress}</p>
    </div>
  )
}

// ── エラー ───────────────────────────────────────────────────────────

function ErrorView({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-gray-800">読み込みエラー</h2>
      <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{message}</div>
      <button
        onClick={onBack}
        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← 戻る
      </button>
    </div>
  )
}
