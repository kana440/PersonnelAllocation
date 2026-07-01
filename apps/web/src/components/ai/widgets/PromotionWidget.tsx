import { useState, useMemo } from 'react'
import { useStore } from '../../../store/useStore'
import { deriveFieldUpdates, computeBandStepDiff } from '@personnel/domain/rules/derive'
import { getGroupedFieldOptions } from '@personnel/domain/rules/options'
import { filterBandsByStep } from '../../editor/PersonOperationPanel/BandStepFilter'
import type { StepMode } from '../../editor/PersonOperationPanel/BandStepFilter'

interface Props {
  rowId: number
  proposedPositionBand: string
  proposedOfficialPositionCode?: string
  proposedLocalJobTitle?: string
  label?: string
  isActive: boolean
  onConfirm: (userInputs: Record<string, string>) => void
  onCancel: () => void
}

export function PromotionWidget({
  rowId, proposedPositionBand, proposedOfficialPositionCode, proposedLocalJobTitle,
  label, isActive, onConfirm, onCancel,
}: Props) {
  const { allocationList, masters } = useStore()
  const row = useMemo(() => allocationList.find(r => r.rowId === rowId), [allocationList, rowId])

  const [positionBand,         setPositionBand]         = useState(proposedPositionBand)
  const [officialPositionCode, setOfficialPositionCode] = useState(proposedOfficialPositionCode ?? row?.officialPositionCode ?? '')
  const [localJobTitle,        setLocalJobTitle]        = useState(proposedLocalJobTitle        ?? row?.localJobTitle        ?? '')
  const [stepMode,             setStepMode]             = useState<StepMode>('1')

  const bandOptions = useMemo(() => {
    if (!row) return []
    const { valid } = getGroupedFieldOptions('positionBand', row, masters)
    return valid
  }, [row, masters])

  const filteredBands = useMemo(
    () => filterBandsByStep(bandOptions, row?.positionBand as string | undefined, masters, stepMode, 'up'),
    [bandOptions, row?.positionBand, masters, stepMode]
  )

  const derived = useMemo(() => {
    if (!row) return {}
    return deriveFieldUpdates({ positionBand }, row, masters, allocationList)
  }, [row, positionBand, masters, allocationList])

  const derivedBand     = derived.band     as string | undefined
  const derivedPayGrade = derived.payGrade as string | undefined

  const stepDiff = useMemo(
    () => computeBandStepDiff(row?.positionBand as string | undefined, positionBand, masters),
    [row?.positionBand, positionBand, masters]
  )

  if (!row) return <div className="text-xs text-red-500 px-3 py-2">行が見つかりません (rowId: {rowId})</div>

  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${rowId}`
  const stepWarning = stepDiff !== undefined && stepDiff >= 2 ? `⚠️ ${stepDiff}段階昇格` : undefined

  const handleConfirm = () => {
    if (!positionBand) return
    const inputs: Record<string, string> = { positionBand }
    if (derivedBand)           inputs.band                 = derivedBand
    if (derivedPayGrade)       inputs.payGrade             = derivedPayGrade
    if (officialPositionCode)  inputs.officialPositionCode = officialPositionCode
    if (localJobTitle)         inputs.localJobTitle        = localJobTitle
    onConfirm(inputs)
  }

  return (
    <div className="mt-2 border border-green-200 rounded-xl overflow-hidden">
      <div className="px-3 pt-2 pb-1.5 bg-green-50 border-b border-green-100">
        <span className="text-xs font-semibold text-green-700">{label ?? '昇格の確認'}</span>
        <span className="ml-2 text-xs text-green-600">{name}</span>
      </div>

      <div className="px-3 py-3 space-y-3">
        {/* 現在の状態 */}
        <div className="grid grid-cols-3 gap-2 text-[11px] bg-gray-50 rounded-lg px-2 py-1.5">
          <div>
            <span className="text-gray-400">現在バンド</span>
            <div className="font-medium text-gray-700">{(row.positionBand as string | undefined) ?? '—'}</div>
          </div>
          <div>
            <span className="text-gray-400">現在グレード</span>
            <div className="font-medium text-gray-700">{(row.band as string | undefined) ?? '—'}</div>
          </div>
          <div>
            <span className="text-gray-400">現在等級</span>
            <div className="font-medium text-gray-700">{(row.payGrade as string | undefined) ?? '—'}</div>
          </div>
        </div>

        {/* ステップフィルター */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">変更幅:</span>
          {(['1', '2', 'all'] as StepMode[]).map(m => (
            <button key={m} onClick={() => setStepMode(m)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                stepMode === m ? 'bg-green-500 text-white border-green-500' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {m === 'all' ? '全て' : `${m}段階上`}
            </button>
          ))}
        </div>

        {/* positionBand 選択 */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">
            新ポジションバンド <span className="text-red-400">*</span>
          </label>
          {row.positionBand && <p className="text-[10px] text-gray-400 mb-1">変更前: {row.positionBand as string}</p>}
          <select
            value={positionBand}
            onChange={e => setPositionBand(e.target.value)}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="">（選択してください）</option>
            {filteredBands.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          {stepWarning && <p className="text-[10px] text-orange-500 mt-0.5">{stepWarning}</p>}
        </div>

        {/* 自動導出プレビュー */}
        {positionBand && (
          <div className="grid grid-cols-2 gap-2 text-[11px] bg-green-50 rounded-lg px-2 py-1.5">
            <div>
              <span className="text-gray-400">→ グレード（自動）</span>
              <div className="font-semibold text-green-700">{derivedBand ?? '（変更なし）'}</div>
            </div>
            <div>
              <span className="text-gray-400">→ 給与等級（自動）</span>
              <div className="font-semibold text-green-700">{derivedPayGrade ?? '（変更なし）'}</div>
            </div>
          </div>
        )}

        {/* 役職コード（任意） */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">役職コード（任意）</label>
          {row.officialPositionCode && (row.officialPositionCode as string) !== officialPositionCode && officialPositionCode && (
            <p className="text-[10px] text-orange-500 mb-0.5">⚠ 変更前: {row.officialPositionCode as string}</p>
          )}
          <input type="text" value={officialPositionCode}
            onChange={e => setOfficialPositionCode(e.target.value)}
            placeholder={(row.officialPositionCode as string | undefined) ?? ''}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>

        {/* 役職名（任意） */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-0.5">役職名（任意）</label>
          {row.localJobTitle && (row.localJobTitle as string) !== localJobTitle && localJobTitle && (
            <p className="text-[10px] text-orange-500 mb-0.5">⚠ 変更前: {row.localJobTitle as string}</p>
          )}
          <input type="text" value={localJobTitle}
            onChange={e => setLocalJobTitle(e.target.value)}
            placeholder={(row.localJobTitle as string | undefined) ?? ''}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-green-400"
          />
        </div>
      </div>

      {isActive && (
        <div className="bg-green-50 px-3 py-2.5 flex gap-2 border-t border-green-100">
          <button onClick={handleConfirm} disabled={!positionBand}
            className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors">
            確認して適用
          </button>
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors">
            キャンセル
          </button>
        </div>
      )}
    </div>
  )
}
