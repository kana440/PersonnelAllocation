import { useRef, useState, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { importFromFile, importFromUrl, SHEET_ALLOCATION, SHEET_MASTERS, SHEET_ORG_MASTER, SHEET_ORG_MASTER_OLD } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import { isUninitializedRow, applyAfterInit } from '../../application/setup/afterInit'
import { SetupHelp } from './SetupHelp'
import { AfterInitWizard } from './AfterInitWizard'
import { ModeSelectStep } from './ModeSelectStep'
import { getAssigneeOrgIds, getAllMemberOrgIds } from './panelInit'

const LOCAL_SAMPLE_FILES = ['sample.xlsm']

type Phase =
  | { kind: 'idle' }
  | { kind: 'sample-select'; files: string[] }
  | { kind: 'loading'; progress: string }
  | { kind: 'mode-select'; result: ImportedWorkbookResult }
  | { kind: 'after-init'; result: ImportedWorkbookResult; role: 'admin' | 'assignee'; assigneeName: string | null }
  | { kind: 'error'; message: string }

interface Props {
  onReady: () => void
}

export function SetupView({ onReady }: Props) {
  const { loadExcelData, setUserSession, focusOrg } = useStore()
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

  const handleSample = () => {
    if (LOCAL_SAMPLE_FILES.length === 1) {
      runImport(onProgress => importFromUrl(`/.local/${LOCAL_SAMPLE_FILES[0]}`, onProgress))
    } else {
      setPhase({ kind: 'sample-select', files: LOCAL_SAMPLE_FILES })
    }
  }

  // after-init チェックを挟む共通ヘルパー
  const proceedOrInitWizard = useCallback((
    result: ImportedWorkbookResult,
    role: 'admin' | 'assignee',
    assigneeName: string | null,
  ) => {
    const needsInit = result.allocationList.some(r => isUninitializedRow(r, result.masters))
    if (needsInit) {
      setPhase({ kind: 'after-init', result, role, assigneeName })
    } else {
      setPhase({ kind: 'loading', progress: `データ適用中... (${result.allocationRowCount.toLocaleString()} 行)` })
    }
    return needsInit
  }, [])

  // Excel ロード後の共通パネル初期化
  // 全組織を一括登録し、メンバーが存在する組織の LCA フィルタを同期的に計算・適用する。
  // useEffect での遅延計算を避け、ロード直後に確実にフィルタが表示されるようにする。
  const initCanvas = useCallback((
    result: ImportedWorkbookResult,
    role: 'admin' | 'assignee',
    assigneeName: string | null,
  ) => {
    const { initPanelsForOrgs } = useCanvasLayoutStore.getState()
    const orgIds = result.afterOrganizations.map(o => o.id)

    // メンバー組織の LCA を計算してパネルと同じ set() で確定（タイミング問題を回避）
    const memberOrgIds = role === 'assignee'
      ? getAssigneeOrgIds(result.allocationList, result.afterOrganizations, assigneeName)
      : getAllMemberOrgIds(result.allocationList, result.afterOrganizations)
    const orgById = new Map(result.afterOrganizations.map(o => [o.id, o]))

    initPanelsForOrgs(orgIds, memberOrgIds, orgById)

    // 担当者モード: サイドバーを最初の担当組織にフォーカス
    if (role === 'assignee' && memberOrgIds.length > 0) focusOrg(memberOrgIds[0])
  }, [focusOrg])

  const runLoadSequence = useCallback(async (
    result: ImportedWorkbookResult,
    role: 'admin' | 'assignee',
    assigneeName: string | null,
  ) => {
    const t0 = performance.now()
    console.log('[PERF] tick 開始')
    await tick()
    console.log(`[PERF] tick 完了 ${(performance.now() - t0).toFixed(1)}ms`)

    const t1 = performance.now()
    console.log('[PERF] loadExcelData 開始', { rows: result.allocationList.length })
    await loadExcelData(result)
    console.log(`[PERF] loadExcelData 完了 ${(performance.now() - t1).toFixed(1)}ms`)

    const t2 = performance.now()
    console.log('[PERF] initCanvas 開始', { orgs: result.afterOrganizations.length })
    initCanvas(result, role, assigneeName)
    console.log(`[PERF] initCanvas 完了 ${(performance.now() - t2).toFixed(1)}ms`)

    const t3 = performance.now()
    console.log('[PERF] onReady 開始（メインアプリマウント）')
    onReady()
    console.log(`[PERF] onReady 完了 ${(performance.now() - t3).toFixed(1)}ms`)

    console.log(`[PERF] 合計 ${(performance.now() - t0).toFixed(1)}ms`)
  }, [loadExcelData, initCanvas, onReady])

  // 管理者として開く
  const handleSelectAdmin = useCallback(async () => {
    if (phase.kind !== 'mode-select') return
    const { result } = phase
    setUserSession({ role: 'admin', assigneeName: null })
    const needsInit = proceedOrInitWizard(result, 'admin', null)
    if (needsInit) return
    await runLoadSequence(result, 'admin', null)
  }, [phase, setUserSession, proceedOrInitWizard, runLoadSequence])

  // 担当者として開く（AssigneeSelectStep からの選択確定）
  const handleAssigneeSelect = useCallback(async (assigneeName: string) => {
    if (phase.kind !== 'mode-select') return
    const { result } = phase
    const resolvedName = assigneeName || null
    setUserSession({ role: 'assignee', assigneeName: resolvedName })
    const needsInit = proceedOrInitWizard(result, 'assignee', resolvedName)
    if (needsInit) return
    await runLoadSequence(result, 'assignee', resolvedName)
  }, [phase, setUserSession, proceedOrInitWizard, runLoadSequence])

  // after-init ウィザード完了
  const handleAfterInitComplete = useCallback(async (modifiedResult: ImportedWorkbookResult) => {
    if (phase.kind !== 'after-init') return
    const { role, assigneeName } = phase
    setPhase({ kind: 'loading', progress: `データ適用中... (${modifiedResult.allocationRowCount.toLocaleString()} 行)` })
    await runLoadSequence(modifiedResult, role, assigneeName)
  }, [phase, runLoadSequence])

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
        {phase.kind === 'sample-select' && (
          <SampleSelectView
            files={phase.files}
            onSelect={file => runImport(onProgress => importFromUrl(`/.local/${file}`, onProgress))}
            onBack={() => setPhase({ kind: 'idle' })}
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
            rowsToGroup={phase.result.allocationList.filter(r => isUninitializedRow(r, phase.result.masters))}
            afterOrganizations={phase.result.afterOrganizations}
            beforeOrganizations={phase.result.beforeOrganizations}
            onConfirm={(groups) => {
              const newList = applyAfterInit(phase.result.allocationList, groups)
              handleAfterInitComplete({ ...phase.result, allocationList: newList })
            }}
            footerNote={
              <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
                コピーされる項目：ポジション / 組織 / 職位 / 等級 / 雇用形態 / 職種 / 勤務地 など全 after 項目
                <br />
                <span className="text-gray-500">異動事由は空欄のまま（変更なし = 変更種別に出ない）</span>
              </div>
            }
          />
        )}
        {phase.kind === 'error' && (
          <ErrorView message={phase.message} onBack={() => setPhase({ kind: 'idle' })} />
        )}
      </div>
    </div>
  )
}

// ── サンプルファイル選択 ─────────────────────────────────────────────────

function SampleSelectView({ files, onSelect, onBack }: {
  files: string[]
  onSelect: (file: string) => void
  onBack: () => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-800">サンプルファイルを選択</h2>
        <p className="mt-1 text-sm text-gray-500">.local フォルダ内のファイルを選択してください。</p>
      </div>
      <div className="space-y-2">
        {files.map(file => (
          <button
            key={file}
            onClick={() => onSelect(file)}
            className="w-full text-left px-4 py-3 text-sm text-gray-700 border border-gray-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-colors"
          >
            {file}
          </button>
        ))}
      </div>
      <button
        onClick={onBack}
        className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← 戻る
      </button>
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
            <span className="font-mono">{SHEET_MASTERS}</span>・
            <span className="font-mono">{SHEET_ORG_MASTER}</span>・
            <span className="font-mono">{SHEET_ORG_MASTER_OLD}</span> シートを自動で読み取ります。
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
