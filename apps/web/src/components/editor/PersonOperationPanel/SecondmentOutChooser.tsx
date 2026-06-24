import { useState, useMemo } from 'react'
import { ComboInput } from '../../common/ComboInput'
import { isSFIntegratedCompany } from '@personnel/domain/commands/helpers'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import { SecondmentDiagram } from './SecondmentDiagram'

interface Props {
  row:             AllocationRow
  masters:         AllMasters
  onSelectSF:      (company: string) => void
  onSelectNonSF:   (company: string) => void
  onBack:          () => void
}

/**
 * 「本務出向」の SF統合先 / SF外 ルーティングステップ。
 * 出向先会社名を入力し、SF判定を表示する。手動切り替え可。
 * SF統合先 → 単一行フォーム（secondmentOutSFDef）
 * SF外    → 2行フォーム（nonSFSecondmentOutDef）
 */
export function SecondmentOutChooser({ row, masters, onSelectSF, onSelectNonSF, onBack }: Props) {
  const [company,        setCompany]        = useState('')
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)

  const autoSF = useMemo(() => {
    if (!company.trim()) return null
    return isSFIntegratedCompany(company.trim(), masters)
  }, [company, masters])

  const effectiveSF: boolean | null = company.trim()
    ? (manualOverride !== null ? manualOverride : (autoSF ?? false))
    : null

  const handleCompanyChange = (v: string) => {
    setCompany(v)
    setManualOverride(null)
  }

  const handleConfirm = () => {
    const c = company.trim()
    if (!c || effectiveSF === null) return
    effectiveSF ? onSelectSF(c) : onSelectNonSF(c)
  }

  const name         = [row.lastName, row.firstName].filter(Boolean).join(' ') || '対象者'
  const isDetected   = autoSF !== null
  const isOverriding = manualOverride !== null && autoSF !== null && manualOverride !== autoSF

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ヘッダー */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1" title="戻る">←</button>
        <span className="text-xs font-semibold text-gray-700">本務出向</span>
        <span className="text-[10px] text-gray-400 ml-auto truncate">{name}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* 文脈説明 */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-blue-900">{name}さんを別会社に本務出向させます</p>
          <p className="text-[10px] text-blue-700 leading-relaxed">
            出向中は現在のポジションから「出向箱」に移動し、出向先のレコードが作成されます。
            出向先がSFシステムを共有しているかどうかによって、このツールで必要な操作件数が変わります。
          </p>
        </div>

        {/* 出向先会社入力 */}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1.5">
            出向先会社名<span className="text-red-400 ml-0.5">*</span>
          </label>
          <ComboInput
            value={company}
            onChange={handleCompanyChange}
            options={masters.companies.map(c => c.label)}
            modified={!!company}
          />
        </div>

        {/* SF判定 & トグル */}
        {company.trim() && (
          <div className="space-y-2">
            <div className="text-[10px] text-gray-500">
              {isDetected
                ? <>自動判定：<span className="font-semibold">{autoSF ? 'SF統合先' : 'SF外'}</span>{isOverriding && <span className="text-amber-600 ml-1">（手動で上書き中）</span>}</>
                : 'マスタ未登録のため自動判定できません。下のボタンで手動選択してください。'}
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[11px] font-medium">
              <button
                onClick={() => setManualOverride(true)}
                className={`flex-1 py-2 transition-colors ${
                  effectiveSF === true ? 'bg-purple-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >SF統合先</button>
              <button
                onClick={() => setManualOverride(false)}
                className={`flex-1 py-2 border-l border-gray-200 transition-colors ${
                  effectiveSF === false ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >SF外（未統合）</button>
            </div>

            {/* 選択後の一言サマリー */}
            {effectiveSF !== null && (
              <p className={`text-[10px] font-medium rounded px-2 py-1.5 ${
                effectiveSF
                  ? 'bg-purple-50 border border-purple-100 text-purple-700'
                  : 'bg-orange-50 border border-orange-100 text-orange-700'
              }`}>
                {effectiveSF
                  ? '▶ 操作1件：出向箱に変更するだけです。受入行はXX社担当が別途作成します。'
                  : '▶ 操作2件：出向箱への変更 ＋ 受入行の代理作成 を続けて行います。'}
              </p>
            )}
          </div>
        )}

        {/* レコード変化ガイド */}
        <div>
          <p className="text-[10px] font-medium text-gray-500 mb-2">作成・変更されるレコードのイメージ</p>
          {company.trim() ? (
            <SecondmentDiagram
              row={row}
              company={company.trim()}
              effectiveSF={effectiveSF}
            />
          ) : (
            <div className="text-center text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded-lg py-6">
              出向先会社名を入力すると<br />作成・変更されるレコードを確認できます
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
        <button onClick={onBack}
          className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >キャンセル</button>
        <button
          onClick={handleConfirm}
          disabled={effectiveSF === null}
          className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >次へ</button>
      </div>
    </div>
  )
}
