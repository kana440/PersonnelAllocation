import { useRef, useState, useCallback, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { useCanvasLayoutStore } from '../../store/canvasLayoutStore'
import { importFromFile, importFromUrl, SHEET_ALLOCATION, SHEET_MASTERS, SHEET_ORG_MASTER, SHEET_ORG_MASTER_OLD } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import { isUninitializedRow, applyAfterInit } from '../../application/setup/afterInit'
import { SetupHelp } from './SetupHelp'
import { AfterInitWizard } from './AfterInitWizard'
import { ModeSelectStep } from './ModeSelectStep'
import { getAssigneeOrgIds, getAllMemberOrgIds, collectExpandAncestorClosure } from './panelInit'
import { workspaceStore } from '../../infrastructure/workspace'
import type { WorkspaceMeta } from '../../infrastructure/workspace'

const LOCAL_SAMPLE_FILES = ['sample.xlsm']

// メンバー組織の祖先を自動展開すると、開くことになる組織数が多い大規模データでは
// 描画がフリーズするため、実際に open:true になる組織数（祖先含む）がこの件数以下の
// ときだけ自動展開する。超える場合はルート組織のみ開き、手動展開・検索・フォーカスで辿る。
const AUTO_EXPAND_MAX_ORGS = 100

type Phase =
  | { kind: 'checking' }
  | { kind: 'resume'; entries: WorkspaceMeta[] }
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
  const { loadExcelData, loadWorkspace, setUserSession, focusOrg } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase]     = useState<Phase>({ kind: 'checking' })
  const [showHelp, setShowHelp] = useState(false)

  // 起動時に保存済みワークスペースを確認
  useEffect(() => {
    let cancelled = false
    workspaceStore.list().then(entries => {
      if (cancelled) return
      setPhase(entries.length > 0 ? { kind: 'resume', entries } : { kind: 'idle' })
    })
    return () => { cancelled = true }
  }, [])

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
    const { initPanelsForOrgs, setDidAutoExpandMemberOrgs } = useCanvasLayoutStore.getState()
    const orgIds = result.afterOrganizations.map(o => o.id)
    const orgById = new Map(result.afterOrganizations.map(o => [o.id, o]))

    // メンバーが属する組織（管理者は全員、担当者は自分の担当分のみ）を候補にし、
    // 実際に開くことになる組織数（祖先含む）が閾値以下のときだけ自動展開する。
    // 子孫はチップから手動展開するか、下の focusOrg によるサイドバーフォーカス・検索から辿る。
    const candidateMemberOrgIds = role === 'assignee'
      ? getAssigneeOrgIds(result.allocationList, result.afterOrganizations, assigneeName)
      : getAllMemberOrgIds(result.allocationList, result.afterOrganizations)
    const expandClosure = collectExpandAncestorClosure(candidateMemberOrgIds, orgById)
    const shouldAutoExpand = expandClosure.size <= AUTO_EXPAND_MAX_ORGS
    const memberOrgIds = shouldAutoExpand ? candidateMemberOrgIds : []
    initPanelsForOrgs(orgIds, memberOrgIds, orgById)
    // 比較モード開始時、旧組織キャンバスもこの判定結果に揃える（新側だけ全展開になるのを防ぐ）
    setDidAutoExpandMemberOrgs(shouldAutoExpand)

    // 担当者モード: サイドバーを最初の担当組織にフォーカス（キャンバスパネルの自動展開はしない）
    if (role === 'assignee') {
      const assigneeOrgIds = getAssigneeOrgIds(result.allocationList, result.afterOrganizations, assigneeName)
      if (assigneeOrgIds.length > 0) focusOrg(assigneeOrgIds[0])
    }
  }, [focusOrg])

  // 管理者として開く
  const handleSelectAdmin = useCallback(async () => {
    if (phase.kind !== 'mode-select') return
    const { result } = phase
    setUserSession({ role: 'admin', assigneeName: null })
    const needsInit = proceedOrInitWizard(result, 'admin', null)
    if (needsInit) return
    await tick()
    await loadExcelData(result)
    initCanvas(result, 'admin', null)
    onReady()
  }, [phase, setUserSession, proceedOrInitWizard, loadExcelData, initCanvas, onReady])

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
    initCanvas(result, 'assignee', resolvedName)
    onReady()
  }, [phase, setUserSession, proceedOrInitWizard, loadExcelData, initCanvas, onReady])

  // 前回セッションを再開
  const handleResume = useCallback(async (id: string) => {
    setPhase({ kind: 'loading', progress: '前回のセッションを読み込み中...' })
    const payload = await workspaceStore.load(id)
    if (!payload) { setPhase({ kind: 'error', message: 'セッションデータの読み込みに失敗しました。新しいファイルを開いてください。' }); return }
    await loadWorkspace(payload)
    const { role, assigneeName } = payload.userSession
    const orgIds      = payload.afterOrganizations.map(o => o.id)
    const orgById = new Map(payload.afterOrganizations.map(o => [o.id, o]))
    // 閾値以下のときだけ自動展開する（initCanvas と同じ理由）
    const candidateMemberOrgIds = role === 'assignee'
      ? getAssigneeOrgIds(payload.allocationList, payload.afterOrganizations, assigneeName)
      : getAllMemberOrgIds(payload.allocationList, payload.afterOrganizations)
    const expandClosure = collectExpandAncestorClosure(candidateMemberOrgIds, orgById)
    const shouldAutoExpand = expandClosure.size <= AUTO_EXPAND_MAX_ORGS
    const memberOrgIds = shouldAutoExpand ? candidateMemberOrgIds : []
    useCanvasLayoutStore.getState().initPanelsForOrgs(orgIds, memberOrgIds, orgById)
    useCanvasLayoutStore.getState().setDidAutoExpandMemberOrgs(shouldAutoExpand)
    if (role === 'assignee') {
      const assigneeOrgIds = getAssigneeOrgIds(payload.allocationList, payload.afterOrganizations, assigneeName)
      if (assigneeOrgIds.length > 0) focusOrg(assigneeOrgIds[0])
    }
    onReady()
  }, [loadWorkspace, focusOrg, onReady])

  // after-init ウィザード完了
  const handleAfterInitComplete = useCallback(async (modifiedResult: ImportedWorkbookResult) => {
    if (phase.kind !== 'after-init') return
    const { role, assigneeName } = phase
    setPhase({ kind: 'loading', progress: `データ適用中... (${modifiedResult.allocationRowCount.toLocaleString()} 行)` })
    await tick()
    await loadExcelData(modifiedResult)
    initCanvas(modifiedResult, role, assigneeName)
    onReady()
  }, [phase, loadExcelData, initCanvas, onReady])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      {showHelp && <SetupHelp onClose={() => setShowHelp(false)} />}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />

      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8">
        {phase.kind === 'checking' && <LoadingView progress="確認中..." />}
        {phase.kind === 'resume' && (
          <ResumeView
            entries={phase.entries}
            onResume={handleResume}
            onNewFile={() => setPhase({ kind: 'idle' })}
          />
        )}
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

// ── 前回セッション再開 ──────────────────────────────────────────────────

function ResumeView({ entries, onResume, onNewFile }: {
  entries:    WorkspaceMeta[]
  onResume:   (id: string) => void
  onNewFile:  () => void
}) {
  const entry = entries[0]!
  const savedAt = new Date(entry.savedAt)
  const dateStr = savedAt.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
  const timeStr = savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  const roleLabel = entry.role === 'admin' ? '管理者' : `担当者（${entry.assigneeName ?? ''}）`

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-800">前回の続きから再開</h2>
        <p className="mt-1 text-sm text-gray-500">前回の編集セッションが保存されています。</p>
      </div>

      <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-1.5">
        <div className="text-sm font-medium text-blue-800">{entry.effectiveDate} 基準</div>
        {entry.fileName && <div className="text-xs text-blue-700 truncate">{entry.fileName}</div>}
        <div className="text-xs text-blue-600">{roleLabel} ・ {entry.rowCount.toLocaleString()} 行</div>
        <div className="text-xs text-gray-400">{dateStr} {timeStr} 保存</div>
      </div>

      <button
        onClick={() => onResume(entry.id)}
        className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
      >
        再開する
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-gray-400">または</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <button
        onClick={onNewFile}
        className="w-full py-2 text-sm text-gray-500 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
      >
        新しいファイルを開く
      </button>
    </div>
  )
}
