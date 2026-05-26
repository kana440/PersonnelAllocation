import { useRef, useState, useCallback } from 'react'
import { useStore } from '../../store/useStore'
import { importFromFile, importFromUrl, SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import { buildOrgMatchIndex, orgMatchIndexToMapping } from '../../domain/review/orgMatching'
import { getDescendantOrgIds } from '../../domain/orgScope'
import { SetupHelp } from './SetupHelp'
import { OrgSelectStep } from './OrgSelectStep'
import { MappingStep } from '../review/components/org-comparison/MappingStep'
import type { OrgMapping } from '../review/components/org-comparison/types'

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: string }
  | { kind: 'org-select'; result: ImportedWorkbookResult }
  | { kind: 'org-mapping'
      result:      ImportedWorkbookResult
      beforeOrgId: string | null
      beforeOrgName: string | null
      mapping:     OrgMapping }
  | { kind: 'error'; message: string }

interface Props {
  onReady: () => void
}

export function SetupView({ onReady }: Props) {
  const { loadExcelData, setScopeWithMapping } = useStore()
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const [phase, setPhase]     = useState<Phase>({ kind: 'idle' })
  const [showHelp, setShowHelp] = useState(false)

  const tick = () => new Promise<void>(r => setTimeout(r, 0))

  const runImport = async (fn: (onProgress: (msg: string) => void) => Promise<ImportedWorkbookResult | null>) => {
    const onProgress = (progress: string) => setPhase({ kind: 'loading', progress })
    setPhase({ kind: 'loading', progress: '準備中...' })
    try {
      const result = await fn(onProgress)
      if (result) setPhase({ kind: 'org-select', result })
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

  // 組織: scope の before-org 配下に絞った自動マッピングを表示
  const handleOrgSelectOrg = useCallback((id: string, name: string) => {
    if (phase.kind !== 'org-select') return
    const { result } = phase
    const scopeIds   = getDescendantOrgIds(id, result.beforeOrganizations)
    const scopeBefore = result.beforeOrganizations.filter(o => scopeIds.has(o.id))
    const index   = buildOrgMatchIndex(result.allocationList, scopeBefore, result.afterOrganizations)
    const mapping = orgMatchIndexToMapping(index)
    setPhase({ kind: 'org-mapping', result, beforeOrgId: id, beforeOrgName: name, mapping })
  }, [phase])

  // マッピング確定 → データロード → 開始
  const handleMappingConfirm = useCallback(async () => {
    if (phase.kind !== 'org-mapping') return
    const { result, beforeOrgId, mapping } = phase
    setPhase({ kind: 'loading', progress: `データ適用中... (${result.allocationRowCount.toLocaleString()} 行)` })
    await tick()
    await loadExcelData(result)
    setScopeWithMapping({ beforeOrgId, mapping })
    onReady()
  }, [phase, loadExcelData, setScopeWithMapping, onReady])

  const handleMappingSetEntry = useCallback((oldId: string, newIds: string[]) => {
    if (phase.kind !== 'org-mapping') return
    setPhase({ ...phase, mapping: new Map([...phase.mapping, [oldId, newIds]]) })
  }, [phase])

  const handleMappingRemoveEntry = useCallback((oldId: string) => {
    if (phase.kind !== 'org-mapping') return
    const next = new Map(phase.mapping)
    next.delete(oldId)
    setPhase({ ...phase, mapping: next })
  }, [phase])

  const handleMappingAutoGenerate = useCallback((orgIds: string[]) => {
    if (phase.kind !== 'org-mapping') return
    const { result, mapping } = phase
    const index = buildOrgMatchIndex(result.allocationList, result.beforeOrganizations, result.afterOrganizations)
    const next  = new Map(mapping)
    for (const orgId of orgIds) {
      const match = index.get(orgId)
      next.set(orgId, match?.afterOrg ? [match.afterOrg.id] : [])
    }
    setPhase({ ...phase, mapping: next })
  }, [phase])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      {showHelp && <SetupHelp onClose={() => setShowHelp(false)} />}
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />

      {phase.kind === 'org-mapping' ? (
        // マッピングステップは全幅で表示
        <div className="w-full max-w-4xl h-[80vh] bg-white rounded-xl shadow-lg flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-bold text-gray-800">組織マッピングの確認</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              旧組織と新組織の対応を確認・調整してください。自動提案済みです。
            </p>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            <MappingStep
              mapping={phase.mapping}
              beforeOrgs={phase.result.beforeOrganizations.filter(o =>
                getDescendantOrgIds(phase.beforeOrgId!, phase.result.beforeOrganizations).has(o.id)
              )}
              afterOrgs={phase.result.afterOrganizations}
              onSetMapping={handleMappingSetEntry}
              onRemoveMapping={handleMappingRemoveEntry}
              onAutoGenerate={handleMappingAutoGenerate}
              onNext={handleMappingConfirm}
              nextLabel="確定して開始 →"
              initialSelectedOrgId={phase.beforeOrgId ?? undefined}
              onBack={() => phase.kind === 'org-mapping' && setPhase({ kind: 'org-select', result: phase.result })}
            />
          </div>
        </div>
      ) : (
        <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8">
          {phase.kind === 'idle' && (
            <IdleView
              onFileClick={() => fileInputRef.current?.click()}
              onSample={handleSample}
              onHelp={() => setShowHelp(true)}
            />
          )}
          {phase.kind === 'loading' && <LoadingView progress={phase.progress} />}
          {phase.kind === 'org-select' && (
            <OrgSelectStep
              result={phase.result}
              onSelectOrg={handleOrgSelectOrg}
              onBack={() => setPhase({ kind: 'idle' })}
            />
          )}
          {phase.kind === 'error' && (
            <ErrorView message={phase.message} onBack={() => setPhase({ kind: 'idle' })} />
          )}
        </div>
      )}
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

// ── 画面②: 読み込み中 ────────────────────────────────────────────────

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
