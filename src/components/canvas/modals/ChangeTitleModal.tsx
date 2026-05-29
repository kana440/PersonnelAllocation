import { useState } from 'react'
import { appService }            from '../../../application/HRApplicationService'
import { ChangeTitleOperation }  from '../../../domain/operation/handlers/changeTitle'
import type { AllocationRow }    from '../../../domain/allocationRow'

interface ChangeTitleModalProps {
  rowId:          number
  allocationList: AllocationRow[]
  onDone:         () => void
  onCancel:       () => void
}

export function ChangeTitleModal({ rowId, allocationList, onDone, onCancel }: ChangeTitleModalProps) {
  const row = allocationList.find(r => r.rowId === rowId)
  const { codeLists } = appService.getSnapshot()

  const [officialPositionCode, setOfficialPositionCode] = useState(row?.officialPositionCode ?? '')
  const [localJobTitle,        setLocalJobTitle]        = useState(row?.localJobTitle        ?? '')
  const [positionBand,         setPositionBand]         = useState(row?.positionBand         ?? '')
  const [band,                 setBand]                 = useState(row?.band                 ?? '')
  const [payGrade,             setPayGrade]             = useState(row?.payGrade             ?? '')
  const [error,                setError]                = useState<string | null>(null)

  if (!row) return null

  const personName = [row.lastName, row.firstName].filter(Boolean).join(' ') || '—'

  const handleConfirm = () => {
    const result = appService.executeOperation(
      new ChangeTitleOperation(rowId, officialPositionCode, localJobTitle, positionBand, band, payGrade)
    )
    if (!result.ok) {
      setError(result.errors.map(e => e.message).join(' / '))
      return
    }
    onDone()
  }

  const selectedOfficialEntry = codeLists.officialPositions.find(e => e.code === officialPositionCode)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[420px] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-bold text-gray-800">役職変更</div>
          <div className="text-xs text-gray-500 mt-0.5">{personName}</div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {/* 役職コード */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">役職</label>
            <select
              value={officialPositionCode}
              onChange={e => setOfficialPositionCode(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-blue-400"
            >
              <option value="">（未設定）</option>
              {codeLists.officialPositions.map(opt => (
                <option key={opt.code} value={opt.code}>{opt.label || opt.code}</option>
              ))}
            </select>
          </div>

          {/* 役職フリーテキスト：選択した役職が isFreeTitle の場合のみ入力可 */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              役職フリーテキスト
              {selectedOfficialEntry && !selectedOfficialEntry.isFreeTitle && (
                <span className="ml-1 text-gray-400 font-normal">（この役職はフリーテキスト非対応）</span>
              )}
            </label>
            <input
              type="text"
              value={localJobTitle}
              onChange={e => setLocalJobTitle(e.target.value)}
              disabled={!!(selectedOfficialEntry && !selectedOfficialEntry.isFreeTitle)}
              placeholder="フリーテキストで役職名を入力"
              className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {/* ポジションバンド */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">ポジションバンド</label>
              <input
                type="text"
                value={positionBand}
                onChange={e => setPositionBand(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* バンド */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">バンド</label>
              <input
                type="text"
                value={band}
                onChange={e => setBand(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-blue-400"
              />
            </div>

            {/* 給与等級 */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">給与等級</label>
              <select
                value={payGrade}
                onChange={e => setPayGrade(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-2 text-xs focus:outline-none focus:border-blue-400"
              >
                <option value="">（未設定）</option>
                {codeLists.payGrades.map(opt => (
                  <option key={opt.code} value={opt.code}>{opt.label || opt.code}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 現在値の表示 */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-[11px] text-gray-500 leading-relaxed">
            <span className="font-medium text-gray-600">現在: </span>
            {[
              row.officialPositionCode && `役職=${row.officialPositionCode}`,
              row.localJobTitle        && `FT=${row.localJobTitle}`,
              row.positionBand         && `PBand=${row.positionBand}`,
              row.band                 && `Band=${row.band}`,
              row.payGrade             && `GR=${row.payGrade}`,
            ].filter(Boolean).join(' / ') || '（未設定）'}
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 rounded text-xs border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 font-medium"
          >
            変更する
          </button>
        </div>
      </div>
    </div>
  )
}
