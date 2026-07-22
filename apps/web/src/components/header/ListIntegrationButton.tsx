import { useRef, useState } from 'react'
import { useStore } from '../../store/useStore'
import { useUserSession } from '../../store/useUserSession'
import { importFromFile } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import { validateNoColumn } from '@personnel/domain/importValidation'
import { computeRebasePlan } from '@personnel/domain/rebasePlan'
import { computeRowDiffs, type RowChangeSummary } from '@personnel/domain/diffMerge'
import { appService } from '../../application/HRApplicationService'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { MERGEABLE_FIELDS } from '@personnel/domain/allocationRow'
import type { ImportMode, AssigneeImportMode } from '../../application/importMerge'
import type { MergeSession, MergeSessionRow } from '../../infrastructure/workspace'

type IntegrationMode = 'merge' | 'rebase'

type Step =
  | { kind: 'idle' }
  | { kind: 'choose-mode' }
  | { kind: 'loading'; progress: string }
  /** 既存の未承認レビューが残っている状態で新規インポートしようとしたときの確認 */
  | { kind: 'overwrite-confirm'; result: ImportedWorkbookResult; remaining: number }
  | { kind: 'error'; message: string }

// マージのインポート設定は固定値（全件置換・担当者情報は上書き）で運用する。
// 選択式にしていた頃は毎回同じ選択をするだけだったため、設定画面自体を廃止した。
const FIXED_IMPORT_MODE: ImportMode = 'replace-all'
const FIXED_ASSIGNEE_MODE: AssigneeImportMode = 'overwrite'

// No.（AllocationRow.no）で照合する。groupEmployeeId・departmentCode は正式なIDではないため使わない
const noMatchFn = (r: AllocationRow): string | null => r.no?.trim() || null

/**
 * マージ（担当者からの提出物の取り込み）とリベース（新しい要員配置リストへの差し替え）の
 * 統合エントリポイント。旧「追加読込」「リベース」の2ボタンをこれ1つに統合し、
 * いきなりファイル選択を求めるのではなく先に用途を選ばせる。
 * 差分プレビュー画面は廃止——精度の高いレビュー・Rejectはマージレビュー画面（MergeReviewView）で行う。
 */
export function ListIntegrationButton() {
  const { allocationList, masters, afterOrganizations, setPendingMerge, setMergeReviewOpen } = useStore()

  /** 提出ファイルの組織マスタ件数（新/旧）が現在のセッションと異なれば警告文を返す（一致なら undefined） */
  const buildMasterMismatchWarning = (
    orgEntries:    ImportedWorkbookResult['orgEntries'],
    oldOrgEntries: ImportedWorkbookResult['oldOrgEntries'],
  ): string | undefined => {
    const currentAfterCount  = masters.orgMasterEntries.filter(e => e.phase === 'after').length
    const currentBeforeCount = masters.orgMasterEntries.filter(e => e.phase === 'before').length
    const incomingAfterCount  = orgEntries.length
    const incomingBeforeCount = oldOrgEntries.length

    const diffs: string[] = []
    if (incomingAfterCount !== currentAfterCount)
      diffs.push(`新組織: 現在${currentAfterCount}件 / 提出ファイル${incomingAfterCount}件`)
    if (incomingBeforeCount !== currentBeforeCount)
      diffs.push(`旧組織: 現在${currentBeforeCount}件 / 提出ファイル${incomingBeforeCount}件`)
    if (diffs.length === 0) return undefined

    return `提出ファイルの組織マスタ件数が現在のセッションと一致しません（${diffs.join('、')}）。組織改編後に配布された古いファイルが混在している可能性があります。`
  }
  const { capabilities } = useUserSession()
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!capabilities.canImport) return null

  const [step, setStep] = useState<Step>({ kind: 'idle' })
  const [mode, setMode] = useState<IntegrationMode | null>(null)

  const close = () => { setStep({ kind: 'idle' }); setMode(null) }

  const openFilePicker = (chosenMode: IntegrationMode) => {
    setMode(chosenMode)
    fileInputRef.current?.click()
  }

  const buildMergeSession = (
    imported:      AllocationRow[],
    fileName:      string,
    orgEntries:    ImportedWorkbookResult['orgEntries'],
    oldOrgEntries: ImportedWorkbookResult['oldOrgEntries'],
  ): MergeSession => {
    const importedByNo = new Map<string, AllocationRow>()
    for (const r of imported) { const no = noMatchFn(r); if (no) importedByNo.set(no, r) }
    const existingByNo = new Map<string, AllocationRow>()
    for (const r of allocationList as AllocationRow[]) { const no = noMatchFn(r); if (no) existingByNo.set(no, r) }

    const keyOf = (d: RowChangeSummary): string => {
      const row = d.kind === 'removed'
        ? (allocationList as AllocationRow[]).find(r => r.rowId === d.rowId)
        : imported.find(r => r.rowId === d.rowId)
      return (row ? noMatchFn(row) : null) ?? String(d.rowId)
    }

    const allDiffs = computeRowDiffs(allocationList as AllocationRow[], imported, noMatchFn, MERGEABLE_FIELDS)
    const diffs = FIXED_IMPORT_MODE === 'append-new' ? allDiffs.filter(d => d.kind === 'added') : allDiffs

    const rows: MergeSessionRow[] = diffs.map(d => {
      if (d.kind === 'removed') return { key: keyOf(d), kind: 'removed', status: 'pending' }
      const incoming = importedByNo.get(keyOf(d))
      let incomingRow = incoming
      if (incoming && FIXED_ASSIGNEE_MODE === 'preserve') {
        const existing = existingByNo.get(keyOf(d))
        if (existing?.assignee !== undefined) incomingRow = { ...incoming, assignee: existing.assignee }
      }
      return { key: keyOf(d), kind: d.kind, incomingRow, status: 'pending' }
    })

    return {
      mode: 'merge', sourceFileName: fileName, importedAt: new Date().toISOString(),
      importMode: FIXED_IMPORT_MODE, assigneeMode: FIXED_ASSIGNEE_MODE, rows,
      masterMismatchWarning: buildMasterMismatchWarning(orgEntries, oldOrgEntries),
    }
  }

  const buildRebaseSession = (imported: AllocationRow[], fileName: string): MergeSession => {
    const plan = computeRebasePlan(allocationList, imported, masters, afterOrganizations)

    // 実編集のない行は安全に置き換え可能なため、レビューを待たず即座に適用する
    if (plan.autoReplaceRows.length > 0) {
      const currentByNo = new Map(allocationList.map(r => [r.no, r] as const))
      const replacements = plan.autoReplaceRows
        .map(newRow => ({ rowId: currentByNo.get(newRow.no)?.rowId, newRow }))
        .filter((r): r is { rowId: number; newRow: AllocationRow } => r.rowId !== undefined)
      if (replacements.length > 0) {
        appService.acceptMergeRowsReplace(replacements, `リベース（自動置換）: ${replacements.length}行`)
      }
    }

    const rows: MergeSessionRow[] = plan.reviewRows.map(r => ({
      key: r.key, kind: r.kind, incomingRow: r.candidateRow, status: 'pending',
    }))

    return {
      mode: 'rebase', sourceFileName: fileName, importedAt: new Date().toISOString(),
      rows, autoAppliedCount: plan.autoReplaceRows.length,
    }
  }

  // セッション構築＋適用（リベースなら自動反映もここで実行される）。
  // 既存の未承認レビューを上書きしてよいと確認済みの場合のみ呼ぶこと。
  const finalizeImport = (result: ImportedWorkbookResult) => {
    // buildRebaseSession は内部で自動反映を実行するため、その副作用が起きる前の
    // スナップショットを取っておく（「このレビューを破棄」で完全ロールバックするため）
    const baselineAllocationList = useStore.getState().allocationList

    const session = mode === 'merge'
      ? buildMergeSession(result.allocationList, result.fileName, result.orgEntries, result.oldOrgEntries)
      : buildRebaseSession(result.allocationList, result.fileName)

    setPendingMerge({ ...session, baselineAllocationList })
    setMergeReviewOpen(true)
    close()
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !mode) return
    e.target.value = ''
    setStep({ kind: 'loading', progress: '解析中...' })
    try {
      // マージ: 既存の元ファイルに追記するだけなので、書式テンプレートは変えない（setAsTemplate: false）。
      // リベース: 新しい基準ファイルに載せ替える操作なので、テンプレートもこのファイルに切り替える（true）。
      const result = await importFromFile(file, msg => setStep({ kind: 'loading', progress: msg }), { setAsTemplate: mode === 'rebase' })
      if (!result) { setStep({ kind: 'error', message: 'ファイルの読み込みに失敗しました' }); return }
      const noCheck = validateNoColumn(result.allocationList)
      if (!noCheck.ok) {
        setStep({ kind: 'error', message: `No.列に問題があります:\n${noCheck.errors.slice(0, 10).join('\n')}` })
        return
      }

      // 既存の未承認レビューが残っている場合、黙って上書きしない（リベースの自動反映も含め、
      // 確認前に実データへ副作用を起こさないようここでガードする）
      const existing = useStore.getState().pendingMerge
      const existingRemaining = existing?.rows.filter(r => r.status === 'pending').length ?? 0
      if (existing && existingRemaining > 0) {
        setStep({ kind: 'overwrite-confirm', result, remaining: existingRemaining })
        return
      }

      finalizeImport(result)
    } catch (err) {
      setStep({ kind: 'error', message: String(err) })
    }
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.xlsm" onChange={handleFile} className="hidden" />

      <button
        onClick={() => setStep({ kind: 'choose-mode' })}
        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
        title="複数リストを統合する（担当者からの提出物を取り込む／新しい要員配置リストに差し替える）"
      >
        🔀 リスト統合
      </button>

      {step.kind !== 'idle' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={step.kind === 'error' ? close : undefined}
        >
          <div
            className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
            style={{ width: '520px', maxHeight: '85vh' }}
            onClick={e => e.stopPropagation()}
          >
            {step.kind === 'choose-mode' && (
              <div className="p-6 flex flex-col gap-4">
                <div className="text-sm font-bold text-gray-800">リスト統合</div>
                <button
                  onClick={() => openFilePicker('merge')}
                  className="text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="text-xs font-semibold text-gray-800">📥 マージ</div>
                  <div className="text-xs text-gray-500 mt-1">担当者が分割エクスポートして提出したExcelを、今の作業に取り込みます。</div>
                </button>
                <button
                  onClick={() => openFilePicker('rebase')}
                  className="text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <div className="text-xs font-semibold text-gray-800">🔄 新バージョンのリストに載せ替え</div>
                  <div className="text-xs text-gray-500 mt-1">最新の要員配置リストに、今の作業内容を引き継ぎます。</div>
                </button>
                <div className="flex justify-end">
                  <button onClick={close} className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
                    キャンセル
                  </button>
                </div>
              </div>
            )}

            {step.kind === 'loading' && (
              <div className="p-6 flex flex-col gap-3">
                <div className="text-sm font-bold text-gray-800">ファイルを読み込み中...</div>
                <div className="text-xs text-gray-500">{step.progress}</div>
                <div className="h-1 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-blue-400 animate-pulse w-2/3" />
                </div>
              </div>
            )}

            {step.kind === 'overwrite-confirm' && (
              <div className="p-6 flex flex-col gap-4">
                <div className="text-sm font-bold text-gray-800">既存のレビューが残っています</div>
                <div className="text-xs text-gray-600 leading-relaxed">
                  現在、未承認の行が<span className="font-semibold text-gray-800">{step.remaining}件</span>残っているマージ/リベースレビューがあります。
                  新しく開始すると、その未承認分は破棄されます（すでに承認済みの変更は実データに残ります）。
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={close} className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50">
                    キャンセル
                  </button>
                  <button
                    onClick={() => finalizeImport(step.result)}
                    className="px-4 py-1.5 rounded text-xs bg-red-600 text-white hover:bg-red-700 font-medium"
                  >
                    破棄して新しく始める
                  </button>
                </div>
              </div>
            )}

            {step.kind === 'error' && (
              <div className="p-6 flex flex-col gap-3" onClick={close}>
                <div className="text-sm font-bold text-red-700">エラー</div>
                <div className="text-xs text-red-600 break-all whitespace-pre-line">{step.message}</div>
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
