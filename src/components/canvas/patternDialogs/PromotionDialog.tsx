import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { appService } from '../../../application/HRApplicationService'
import { ComboInput } from '../../common/ComboInput'
import { TitleSuggestionModal } from '../../common/TitleSuggestionModal'
import { NewPositionConfirmModal } from '../../common/NewPositionConfirmModal'
import { getGroupedFieldOptions } from '../../../domain/choices'
import { validateRow } from '../../../domain/validation/validateRow'
import { resolveFieldStrictness } from '../../../domain/optionStrictness'
import { useFieldStrictnessOverrides } from '../../../hooks/useFieldStrictness'
import { deriveFieldUpdates } from '../../../domain/derivation'
import { nextRowId } from '../../../domain/allocationRow'
import type { AllocationRow } from '../../../domain/allocationRow'
import type { AllCodeLists } from '../../../domain/masters/aggregate'

type StepMode = '1' | '2' | 'all'

interface Props {
  rowId:   number
  onClose: () => void
}

const FIELDS: Array<{ key: keyof AllocationRow; prevKey: keyof AllocationRow; label: string }> = [
  { key: 'officialPositionCode', prevKey: 'prevOfficialPositionCode', label: '役職' },
  { key: 'localJobTitle',        prevKey: 'prevLocalJobTitle',        label: 'フリータイトル' },
  { key: 'positionBand',         prevKey: 'prevPositionBand',         label: 'ポジションバンド' },
  { key: 'band',                 prevKey: 'prevBand',                 label: 'バンド' },
  { key: 'payGrade',             prevKey: 'prevPayGrade',             label: '給与等級' },
]

const FIELD_KEYS = new Set(FIELDS.map(f => f.key as string))

function filterBandsByStep(
  options: string[],
  baseBand: string | undefined,
  codeLists: AllCodeLists,
  stepMode: StepMode,
): string[] {
  if (stepMode === 'all' || !baseBand) return options
  const baseLevel = codeLists.jobLevels.find(e => e.label === baseBand)?.promotionDemotionWarningLevel ?? 0
  if (baseLevel === 0) return options
  const steps = parseInt(stepMode, 10)
  return options.filter(opt => {
    const optLevel = codeLists.jobLevels.find(e => e.label === opt)?.promotionDemotionWarningLevel ?? 0
    if (optLevel === 0) return false
    return Math.abs(optLevel - baseLevel) >= 1 && Math.abs(optLevel - baseLevel) <= steps
  })
}

export function PromotionDialog({ rowId, onClose }: Props) {
  const { allocationList, codeLists, afterOrganizations } = useStore()
  const overrides = useFieldStrictnessOverrides()
  const row = allocationList.find(r => r.rowId === rowId)

  const [buffer,           setBuffer]           = useState<Partial<Record<string, string>>>({})
  const [stepMode,         setStepMode]         = useState<StepMode>('1')
  const [titleSuggest,     setTitleSuggest]     = useState<string | null>(null)
  const [showPosModal,     setShowPosModal]     = useState(false)
  const [pendingPosCode,   setPendingPosCode]   = useState<string | null>(null)

  const effectiveRow = useMemo(
    () => (row ? { ...row, ...buffer } as AllocationRow : null),
    [row, buffer]
  )

  const issues = useMemo(() => {
    if (!effectiveRow) return []
    return validateRow({ row: effectiveRow, afterOrganizations, codeLists, allocationList }, overrides)
      .filter(i => FIELD_KEYS.has(i.field as string))
  }, [effectiveRow, afterOrganizations, codeLists, allocationList])

  if (!row || !effectiveRow) return null

  const get = (key: string) =>
    (buffer[key] ?? (row[key as keyof AllocationRow] as string | undefined) ?? '')

  const handleChange = (key: string, v: string) => {
    const changes = { [key]: v } as Partial<AllocationRow>
    const derived = deriveFieldUpdates(changes, effectiveRow, codeLists, allocationList)
    if (key === 'officialPositionCode' && v) {
      setTitleSuggest(v)
    }
    setBuffer(prev => ({
      ...prev,
      [key]: v,
      ...Object.fromEntries(
        Object.entries(derived).map(([k, val]) => [k, val as string | undefined])
      ),
    }))
  }

  const needsNewPosition = (): boolean => {
    const newBand  = buffer.band ?? (row.band as string | undefined)
    const prevBand = row.prevBand as string | undefined
    const posCurrent = buffer.positionCode ?? (row.positionCode as string | undefined)
    const posPrev    = row.prevPositionCode as string | undefined
    return !!newBand && newBand !== prevBand && posCurrent === posPrev
  }

  const doSave = (extraBuffer?: Partial<Record<string, string>>) => {
    const finalBuffer = { ...buffer, ...extraBuffer }
    if (Object.keys(finalBuffer).length === 0) { onClose(); return }
    appService.executePromotion(rowId, finalBuffer as Parameters<typeof appService.executePromotion>[1])
    onClose()
  }

  const handleSaveClick = () => {
    if (Object.keys(buffer).length === 0) { onClose(); return }
    if (needsNewPosition()) {
      const newId = nextRowId(allocationList)
      const code  = `_pos_${newId}`
      setPendingPosCode(code)
      setShowPosModal(true)
      return
    }
    doSave()
  }

  const baseBand            = row.band as string | undefined
  const derivedPromSign     = get('promotionSign')
  const derivedPayGradeSign = get('payGradeChangeSign')

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999]">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">

          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-700">昇降格</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {[row.lastName, row.firstName].filter(Boolean).join(' ')}
            </p>
          </div>

          {/* バンドステップセレクター */}
          <div className="px-4 pt-2.5 pb-1 flex items-center gap-2">
            <span className="text-[10px] text-gray-500">バンド変更幅:</span>
            {(['1', '2', 'all'] as StepMode[]).map(m => (
              <button key={m} onClick={() => setStepMode(m)}
                className={`text-[10px] px-2.5 py-0.5 rounded border transition-colors ${
                  stepMode === m
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >{m === 'all' ? '全て' : `${m}段階`}</button>
            ))}
          </div>

          <div className="grid grid-cols-[6rem_1fr_1fr] gap-x-2 px-4 py-1 bg-gray-50 border-b border-gray-100 mt-1">
            <div className="text-[10px] text-gray-400">フィールド</div>
            <div className="text-[10px] text-blue-500">発令後</div>
            <div className="text-[10px] text-gray-400">発令前</div>
          </div>

          <div className="px-4 py-2 space-y-0.5 max-h-64 overflow-y-auto">
            {FIELDS.map(({ key, prevKey, label }) => {
              const afterVal    = get(key as string)
              const prevVal     = (row[prevKey] as string | undefined) ?? ''
              const fieldIssues = issues.filter(i => i.field === key)
              const hasError    = fieldIssues.some(i => i.level === 'error')
              const hasWarning  = fieldIssues.some(i => i.level === 'warning')
              const { valid, invalid } = getGroupedFieldOptions(key as string, effectiveRow, codeLists, get('jobFamily'))
              const filteredValid = key === 'band'
                ? filterBandsByStep(valid, baseBand, codeLists, stepMode)
                : valid

              return (
                <div key={key as string}
                  className={`grid grid-cols-[6rem_1fr_1fr] gap-x-2 items-start py-1 rounded ${
                    hasError ? 'bg-red-50' : hasWarning ? 'bg-orange-50' : afterVal !== prevVal ? 'bg-blue-50' : ''
                  }`}>
                  <div className="text-xs text-gray-500 truncate pt-0.5">{label}</div>
                  <div className="space-y-0.5">
                    <ComboInput
                      value={afterVal}
                      onChange={v => handleChange(key as string, v)}
                      options={filteredValid}
                      invalidOptions={invalid}
                      strictness={resolveFieldStrictness(key as string, overrides)}
                      hasIssue={hasError || hasWarning}
                    />
                    {fieldIssues.map((issue, i) => (
                      <div key={i} className={`text-[10px] ${issue.level === 'error' ? 'text-red-600' : 'text-orange-600'}`}>
                        {issue.level === 'error' ? '✕ ' : '⚠ '}{issue.message}
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1 leading-4 min-h-[26px]">
                    {prevVal || <span className="text-gray-300">—</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 導出サインバッジ */}
          {(derivedPromSign || derivedPayGradeSign) && (
            <div className="px-4 py-1.5 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-1.5">
              {derivedPromSign && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  derivedPromSign === '昇格' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                }`}>{derivedPromSign === '昇格' ? '▲ ' : '▼ '}昇降格サイン</span>
              )}
              {derivedPayGradeSign && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                  給与等級変更サイン
                </span>
              )}
            </div>
          )}

          <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
            <button onClick={onClose}
              className="text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
            >キャンセル</button>
            <button onClick={handleSaveClick}
              className="text-xs px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >保存</button>
          </div>
        </div>
      </div>

      {/* 役職→タイトル提案モーダル */}
      {titleSuggest && (
        <TitleSuggestionModal
          suggestedTitle={titleSuggest}
          onConfirm={() => {
            setBuffer(prev => ({ ...prev, localJobTitle: titleSuggest }))
            setTitleSuggest(null)
          }}
          onSkip={() => setTitleSuggest(null)}
        />
      )}

      {/* ポジション新設確認モーダル */}
      {showPosModal && pendingPosCode && (
        <NewPositionConfirmModal
          newPosCode={pendingPosCode}
          onCreateNew={() => {
            setShowPosModal(false)
            doSave({ positionCode: pendingPosCode })
            setPendingPosCode(null)
          }}
          onKeepCurrent={() => {
            setShowPosModal(false)
            doSave()
            setPendingPosCode(null)
          }}
        />
      )}
    </>
  )
}
