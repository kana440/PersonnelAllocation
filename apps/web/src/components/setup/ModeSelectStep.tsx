import { useState } from 'react'
import { SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../infrastructure/excel/engine'
import type { ImportedWorkbookResult } from '../../infrastructure/excel/engine'
import type { AllCodeLists } from '@personnel/domain/masters/aggregate'
import { CODE_LIST_LABELS } from '../../infrastructure/codeLists/parser'
import { AssigneeSelectStep } from './AssigneeSelectStep'

interface Props {
  result: ImportedWorkbookResult
  onAdmin: () => void
  onAssigneeSelect: (assigneeName: string) => void
  onBack: () => void
}

export function ModeSelectStep({ result, onAdmin, onAssigneeSelect, onBack }: Props) {
  const criticalOk = result.sheetsFound.includes(SHEET_ALLOCATION) && result.sheetsFound.includes(SHEET_ORG_MASTER)
  const [summaryOpen, setSummaryOpen] = useState(!criticalOk)
  const [assigneeMode, setAssigneeMode] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-800">
            {assigneeMode ? '担当者を選択' : 'どのモードで開きますか？'}
          </h2>
          {!assigneeMode && (
            <p className="mt-0.5 text-xs text-gray-500">役割に応じてモードを選択してください。</p>
          )}
        </div>
        <button
          onClick={assigneeMode ? () => setAssigneeMode(false) : onBack}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← 戻る
        </button>
      </div>

      {/* 読み込み結果インラインサマリー */}
      {!assigneeMode && (
        <div className={`rounded-lg text-xs overflow-hidden border ${
          criticalOk ? 'border-gray-100 bg-gray-50' : 'border-amber-200 bg-amber-50'
        }`}>
          <button
            onClick={() => setSummaryOpen(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-left"
          >
            <span className={`font-medium ${criticalOk ? 'text-green-600' : 'text-amber-600'}`}>
              {criticalOk
                ? `✓ ${result.allocationRowCount}行 · ${result.orgEntries.length}組織 読み込み完了`
                : '⚠ 一部シートが見つかりません'}
            </span>
            <span className="text-gray-400 ml-2 flex-shrink-0">{summaryOpen ? '▾' : '▸'}</span>
          </button>
          {summaryOpen && (
            <div className="border-t border-gray-100 px-3 py-2 space-y-1.5">
              <SummaryRow
                label={SHEET_ALLOCATION}
                found={result.sheetsFound.includes(SHEET_ALLOCATION)}
                detail={`${result.allocationRowCount} 行`}
              />
              <SummaryRow
                label={SHEET_ORG_MASTER}
                found={result.sheetsFound.includes(SHEET_ORG_MASTER)}
                detail={`${result.orgEntries.length} 組織`}
              />
              <CodeListSummaryRow result={result} />
            </div>
          )}
        </div>
      )}

      {/* モード選択ボタン */}
      {!assigneeMode && (
        <div className="space-y-2">
          <button
            onClick={() => setAssigneeMode(true)}
            className="w-full text-left px-4 py-3.5 border-2 border-blue-400 rounded-xl hover:bg-blue-50 transition-colors"
          >
            <div className="text-sm font-semibold text-blue-700">担当者として開く</div>
            <div className="mt-0.5 text-xs text-gray-500">
              自分の担当行のみ表示・編集します。担当者名を選択して開始します。
            </div>
          </button>
          <button
            onClick={onAdmin}
            className="w-full text-left px-4 py-3.5 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <div className="text-sm font-semibold text-gray-700">管理者として開く</div>
            <div className="mt-0.5 text-xs text-gray-500">
              全行を表示・管理します。担当者の割り当て・分割エクスポートが可能です。
            </div>
          </button>
        </div>
      )}

      {/* 担当者選択リスト（インライン展開） */}
      {assigneeMode && (
        <AssigneeSelectStep
          result={result}
          onSelect={onAssigneeSelect}
          noHeader
        />
      )}
    </div>
  )
}

function SummaryRow({ label, found, detail }: { label: string; found: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-sm leading-none ${found ? 'text-green-500' : 'text-red-400'}`}>
        {found ? '✓' : '✗'}
      </span>
      <span className={`font-mono ${found ? 'text-gray-700' : 'text-red-500'}`}>{label}</span>
      {found && detail && <span className="text-gray-400">{detail}</span>}
      {!found && <span className="text-red-400 italic">シートが見つかりません</span>}
    </div>
  )
}

function CodeListSummaryRow({ result }: { result: ImportedWorkbookResult }) {
  const codeListKeys = (Object.keys(CODE_LIST_LABELS) as (keyof AllCodeLists)[]).filter(k => k !== 'orgMasterEntries')
  const foundKeys = codeListKeys.filter(k => {
    const val = result.codeLists[k]
    return Array.isArray(val) && val.length > 0
  })
  const found = result.sheetsFound.includes(SHEET_CODE_LISTS)
  return (
    <div className="flex items-start gap-2">
      <span className={`text-sm leading-none mt-0.5 ${found ? 'text-green-500' : 'text-gray-300'}`}>
        {found ? '✓' : '—'}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-mono ${found ? 'text-gray-700' : 'text-gray-400'}`}>{SHEET_CODE_LISTS}</span>
          {found && <span className="text-gray-400">{foundKeys.length} / {codeListKeys.length} 種類</span>}
          {!found && <span className="text-gray-400 italic">シートが見つかりません</span>}
        </div>
        {found && foundKeys.length > 0 && (
          <p className="text-gray-400 mt-0.5 leading-relaxed">
            {foundKeys.map(k => CODE_LIST_LABELS[k]).join(' · ')}
          </p>
        )}
        {result.codeListCompatibilityWarnings.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {result.codeListCompatibilityWarnings.map(w => (
              <p key={w.field} className="text-amber-600 text-xs">
                ⚠ {w.field}: Excel の値 [{w.actual.join(', ')}] がハードコード定数 [{w.expected.join(', ')}] と一致しません
              </p>
            ))}
          </div>
        )}
        {result.columnWarnings.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {result.columnWarnings.map((w, i) => (
              <p key={i} className="text-amber-600 text-xs">
                ⚠ [{w.sheet}] {w.message}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
