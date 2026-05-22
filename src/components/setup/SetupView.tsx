import { useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { importFromFile, importFromUrl, SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import { CODE_LIST_LABELS } from '../../infrastructure/codeLists/parser'
import { SetupHelp } from './SetupHelp'


type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: string }
  | { kind: 'done'; result: ImportedWorkbookResult }
  | { kind: 'error'; message: string }

interface Props {
  onReady: () => void
}

export function SetupView({ onReady }: Props) {
  const { loadExcelData } = useStore()
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const [phase, setPhase]     = useState<Phase>({ kind: 'idle' })
  const [showHelp, setShowHelp] = useState(false)

  const tick = () => new Promise<void>(r => setTimeout(r, 0))

  const runImport = async (fn: (onProgress: (msg: string) => void) => Promise<ImportedWorkbookResult | null>) => {
    const onProgress = (progress: string) => setPhase({ kind: 'loading', progress })
    setPhase({ kind: 'loading', progress: '準備中...' })
    try {
      const result = await fn(onProgress)
      if (result) setPhase({ kind: 'done', result })
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

  const handleApply = async () => {
    if (phase.kind !== 'done') return
    setPhase({ kind: 'loading', progress: `データ適用中... (${phase.result.allocationRowCount.toLocaleString()} 行)` })
    await tick()
    await loadExcelData(phase.result)
    onReady()
  }

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
        {phase.kind === 'done' && (
          <ResultView
            result={phase.result}
            onApply={handleApply}
            onBack={() => setPhase({ kind: 'idle' })}
          />
        )}
        {phase.kind === 'error' && (
          <ErrorView message={phase.message} onBack={() => setPhase({ kind: 'idle' })} />
        )}
      </div>
    </div>
  )
}

// ── 画面①: ファイル選択 ────────────────────────────────────────────

function IdleView({ onFileClick, onSample, onHelp }: {
  onFileClick: () => void
  onSample: () => void
  onHelp: () => void
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">人事異動管理</h1>
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

// ── 画面②: 読み込み中 ─────────────────────────────────────────────

function LoadingView({ progress }: { progress: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 space-y-4">
      <div className="w-9 h-9 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-sm text-gray-500">{progress}</p>
    </div>
  )
}

// ── 画面③: 読み込み結果 ───────────────────────────────────────────

function ResultView({ result, onApply, onBack }: {
  result: ImportedWorkbookResult
  onApply: () => void
  onBack: () => void
}) {
  const codeListKeys = (Object.keys(CODE_LIST_LABELS) as (keyof typeof CODE_LIST_LABELS)[])
    .filter(k => k !== 'orgMasterEntries')
  const foundCodeListKeys = codeListKeys.filter(k => {
    const val = result.codeLists[k]
    return Array.isArray(val) && val.length > 0
  })
  const foundLabels = foundCodeListKeys.map(k => CODE_LIST_LABELS[k])
  const codeListFound = result.sheetsFound.includes(SHEET_CODE_LISTS)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-800">読み込み完了</h2>
        <p className="mt-0.5 text-xs text-gray-400">内容を確認して適用してください。</p>
      </div>

      <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-3 text-xs">
        {/* 要員配置リスト */}
        <ResultRow
          label={SHEET_ALLOCATION}
          found={result.sheetsFound.includes(SHEET_ALLOCATION)}
          detail={`${result.allocationRowCount} 行`}
        />

        {/* 組織CD一覧 */}
        <ResultRow
          label={SHEET_ORG_MASTER}
          found={result.sheetsFound.includes(SHEET_ORG_MASTER)}
          detail={`${result.orgEntries.length} 組織`}
        />

        {/* 各種TBL（コードリスト） */}
        <div className="flex items-start gap-2">
          <span className={`text-base leading-none mt-0.5 ${codeListFound ? 'text-green-500' : 'text-gray-300'}`}>
            {codeListFound ? '✓' : '—'}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-mono ${codeListFound ? 'text-gray-700' : 'text-gray-400'}`}>
                {SHEET_CODE_LISTS}
              </span>
              {codeListFound && (
                <span className="text-gray-400">
                  {foundCodeListKeys.length} / {codeListKeys.length} 種類
                </span>
              )}
              {!codeListFound && (
                <span className="text-gray-400 italic">シートが見つかりません</span>
              )}
            </div>
            {foundLabels.length > 0 && (
              <p className="text-gray-400 mt-1 leading-relaxed">
                {foundLabels.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={onApply}
          className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
        >
          適用してアプリを開始
        </button>
        <button
          onClick={onBack}
          className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          ← 戻る
        </button>
      </div>
    </div>
  )
}

function ResultRow({ label, found, detail }: { label: string; found: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-base leading-none ${found ? 'text-green-500' : 'text-gray-300'}`}>
        {found ? '✓' : '—'}
      </span>
      <span className={`font-mono ${found ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
      {found && detail && <span className="text-gray-400">{detail}</span>}
      {!found && <span className="text-gray-400 italic">シートが見つかりません</span>}
    </div>
  )
}

// ── 画面④: エラー ─────────────────────────────────────────────────

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
