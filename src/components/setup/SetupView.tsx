import { useRef, useState, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { importFromFile, importFromUrl, SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import { isUninitializedRow } from '../../application/setup/afterInit'
import { SetupHelp } from './SetupHelp'
import { AfterInitWizard } from './AfterInitWizard'
import { ModeSelectStep } from './ModeSelectStep'
import { computeAssigneePanelOrgIds, findCommonAncestorOrgId } from './panelInit'

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: string }
  | { kind: 'mode-select'; result: ImportedWorkbookResult }
  | { kind: 'after-init'; result: ImportedWorkbookResult; role: 'admin' | 'assignee'; assigneeName: string | null }
  | { kind: 'error'; message: string }

interface Props {
  onReady: () => void
}

export function SetupView({ onReady }: Props) {
  const { loadExcelData, setScopeWithMapping, setUserSession, focusOrg } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  const handleFileDrop = async (file: File) => {
    await runImport(onProgress => importFromFile(file, onProgress))
  }

  const handleSample = () => runImport(onProgress => importFromUrl('/.local/sample.xlsx', onProgress))

  // after-init チェックを挟む共通ヘルパー
  const proceedOrInitWizard = useCallback((
    result: ImportedWorkbookResult,
    role: 'admin' | 'assignee',
    assigneeName: string | null,
  ) => {
    const needsInit = result.allocationList.some(r => isUninitializedRow(r, result.codeLists))
    if (needsInit) {
      setPhase({ kind: 'after-init', result, role, assigneeName })
    } else {
      setPhase({ kind: 'loading', progress: `データ適用中... (${result.allocationRowCount.toLocaleString()} 行)` })
    }
    return needsInit
  }, [])

  // 管理者として開く
  const handleSelectAdmin = useCallback(async () => {
    if (phase.kind !== 'mode-select') return
    const { result } = phase
    setUserSession({ role: 'admin', assigneeName: null })
    const needsInit = proceedOrInitWizard(result, 'admin', null)
    if (needsInit) return
    await tick()
    await loadExcelData(result)
    // 管理者モード: 人が存在する最上位共通組織をフォーカス
    const commonOrgId = findCommonAncestorOrgId(result.allocationList, result.afterOrganizations)
    if (commonOrgId) focusOrg(commonOrgId)
    setScopeWithMapping({ beforeOrgId: null, mapping: new Map() })
    onReady()
  }, [phase, setUserSession, proceedOrInitWizard, loadExcelData, setScopeWithMapping, focusOrg, onReady])

  // 担当者として開く（AssigneeSelectStep からの選択確定）
  const handleAssigneeSelect = useCallback(async (assigneeName: string) => {
    if (phase.kind !== 'mode-select') return
    const { result } = phase
    const resolvedName = assigneeName || null
    setUserSession({ role: 'assignee', assigneeName: resolvedName })
    const needsInit = proceedOrInitWizard(result, 'assignee', resolvedName)
    if (needsInit) return
    await tick()
    await loadExcelData(result)
    // 担当者モード: 担当組織を人数降順で最大8件パネル自動追加
    const orgIds = computeAssigneePanelOrgIds(result.allocationList, result.afterOrganizations, resolvedName)
    const { addPanel } = useCanvasLayoutStore.getState()
    orgIds.forEach(orgId => addPanel(orgId))
    if (orgIds.length > 0) focusOrg(orgIds[0])
    setScopeWithMapping({ beforeOrgId: null, mapping: new Map() })
    onReady()
  }, [phase, setUserSession, proceedOrInitWizard, loadExcelData, setScopeWithMapping, focusOrg, onReady])

  // after-init ウィザード完了
  const handleAfterInitComplete = useCallback(async (modifiedResult: ImportedWorkbookResult) => {
    if (phase.kind !== 'after-init') return
    const { role, assigneeName } = phase
    setPhase({ kind: 'loading', progress: `データ適用中... (${modifiedResult.allocationRowCount.toLocaleString()} 行)` })
    await tick()
    await loadExcelData(modifiedResult)
    if (role === 'assignee') {
      const orgIds = computeAssigneePanelOrgIds(modifiedResult.allocationList, modifiedResult.afterOrganizations, assigneeName)
      const { addPanel } = useCanvasLayoutStore.getState()
      orgIds.forEach(orgId => addPanel(orgId))
      if (orgIds.length > 0) focusOrg(orgIds[0])
    } else {
      const commonOrgId = findCommonAncestorOrgId(modifiedResult.allocationList, modifiedResult.afterOrganizations)
      if (commonOrgId) focusOrg(commonOrgId)
    }
    setScopeWithMapping({ beforeOrgId: null, mapping: new Map() })
    onReady()
  }, [phase, loadExcelData, setScopeWithMapping, focusOrg, onReady])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      {showHelp && <SetupHelp onClose={() => setShowHelp(false)} />}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />

      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8">
        {phase.kind === 'idle' && (
          <IdleView
            onFileClick={() => fileInputRef.current?.click()}
            onFileDrop={handleFileDrop}
            onSample={handleSample}
            onHelp={() => setShowHelp(true)}
          />
        )}
        {phase.kind === 'loading' && <LoadingView progress={phase.progress} />}
        {phase.kind === 'mode-select' && (
          <ModeSelectStep
            result={phase.result}
            onAdmin={handleSelectAdmin}
            onAssigneeSelect={handleAssigneeSelect}
            onBack={() => setPhase({ kind: 'idle' })}
          />
        )}
        {phase.kind === 'after-init' && (
          <AfterInitWizard
            result={phase.result}
            onComplete={handleAfterInitComplete}
          />
        )}
        {phase.kind === 'error' && (
          <ErrorView message={phase.message} onBack={() => setPhase({ kind: 'idle' })} />
        )}
      </div>
    </div>
  )
}

// ── 画面①: ファイル選択 ────────────────────────────────────────────────

function IdleView({ onFileClick, onFileDrop, onSample, onHelp }: {
  onFileClick: () => void
  onFileDrop: (file: File) => void
  onSample: () => void
  onHelp: () => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setIsDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragOver(false)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFileDrop(file)
  }

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

      <div
        onClick={onFileClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`w-full py-3 text-sm font-semibold border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors select-none
          ${isDragOver
            ? 'border-blue-600 bg-blue-100 text-blue-700'
            : 'border-blue-400 text-blue-600 hover:bg-blue-50'}`}
      >
        {isDragOver ? 'ここにドロップ' : 'Excelファイルを選択して開始'}
      </div>

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

// ── 読み込み中 ───────────────────────────────────────────────────────────

function LoadingView({ progress }: { progress: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 space-y-4">
      <div className="w-9 h-9 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      <p className="text-sm text-gray-500">{progress}</p>
    </div>
  )
}

// ── エラー ───────────────────────────────────────────────────────────────

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
