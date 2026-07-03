import { useState, useMemo } from 'react'
import { ComboInput } from '../../common/ComboInput'
import { isSFIntegratedCompany } from '@personnel/domain/commands/helpers'
import type { AllMasters } from '@personnel/domain/masters/aggregate'
import type { AllocationRow } from '@personnel/domain/allocationRow'

interface Props {
  row:           AllocationRow
  masters:       AllMasters
  onSelectNonSF: (company: string) => void
  onBack:        () => void
}

/**
 * 「兼務出向」の SF統合先 / SF外 ルーティングステップ。
 * SF統合先 → このツールでの操作は不要（SFが管理）と案内して終了
 * SF外     → ConcurrentSecondmentOutNonSF フォームへ進む
 */
export function ConcurrentSecondmentOutChooser({ row, masters, onSelectNonSF, onBack }: Props) {
  const [company,        setCompany]        = useState('')
  const [manualOverride, setManualOverride] = useState<boolean | null>(null)

  const autoSF = useMemo(() => {
    if (!company.trim()) return null
    return isSFIntegratedCompany(company.trim(), masters)
  }, [company, masters])

  // マスタ未登録の場合は null のまま（false にデフォルトしない。明示的選択を求める）
  const effectiveSF: boolean | null = company.trim()
    ? (manualOverride !== null ? manualOverride : autoSF)
    : null

  const handleCompanyChange = (v: string) => {
    setCompany(v)
    setManualOverride(null)
  }

  const name         = [row.lastName, row.firstName].filter(Boolean).join(' ') || '対象者'
  const empNum       = row.employeeNumber ?? '—'
  const isDetected   = autoSF !== null
  const isOverriding = manualOverride !== null && autoSF !== null && manualOverride !== autoSF

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ヘッダー */}
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-shrink-0">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1" title="戻る">←</button>
        <span className="text-xs font-semibold text-gray-700">兼務出向</span>
        <span className="text-[10px] text-gray-400 ml-auto truncate">{name}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* 文脈説明 */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-blue-900">{name}さんを別会社に兼務出向させます</p>
          <p className="text-[10px] text-blue-700 leading-relaxed">
            本務を維持したまま、出向先でも兼務として所属する形態です。
            本務行は変更されません。<br />
            <span className="font-semibold text-blue-800">
              出向先がSF統合先の場合、このツールでの操作は不要です（SFが管理）。
            </span>
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
                ? <>自動判定：<span className="font-semibold">{autoSF ? 'SF統合先' : 'SF外'}</span>
                    {isOverriding && <span className="text-amber-600 ml-1">（手動で上書き中）</span>}</>
                : <>マスタ未登録のため自動判定できません。<br />マスタにない場合はSFで会社を個別登録してください。登録後のコード・会社名を入力してください。</>}
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
          </div>
        )}

        {/* ── SF統合先 → 操作不要 ── */}
        {effectiveSF === true && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-purple-500 text-lg leading-none flex-shrink-0">✓</span>
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-purple-900">このツールでの操作は不要です</p>
                <p className="text-[10px] text-purple-700 leading-relaxed">
                  SF統合先への兼務出向は、SF（SuccessFactors）の機能で自動管理されます。
                  SF上で兼務設定の手続きを行ってください。
                </p>
              </div>
            </div>
            <div className="bg-purple-100 rounded-lg px-3 py-2.5 space-y-1 text-[10px] text-purple-800">
              <p className="font-semibold mb-1">このツールで変更されるレコード：</p>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-purple-500 min-w-[6rem]">{name}さんの本務行</span>
                <span className="font-semibold">変更なし</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-purple-500 min-w-[6rem]">兼務行の追加</span>
                <span className="font-semibold">不要（SFが管理）</span>
              </div>
            </div>
            <p className="text-[9px] text-purple-500 leading-relaxed">
              ※ SF上に兼務レコードが作成された後、必要に応じてExcelから取り込み直すことで本ツール上にも反映されます。
            </p>
          </div>
        )}

        {/* ── SF外 → 兼務行追加の説明 ── */}
        {effectiveSF === false && (
          <div className="space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
              <p className="text-[10px] font-semibold text-orange-800">
                ▶ 操作1件：兼務行を新規追加します（本務行は変更しません）
              </p>
            </div>
            <ConcurrentDiagram row={row} company={company.trim()} empNum={empNum} />
          </div>
        )}

        {/* ── 未選択時のプレースホルダー ── */}
        {company.trim() && effectiveSF === null && (
          <div className="text-center text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded-lg py-5">
            SF統合先・SF外を選択すると<br />必要な操作が確認できます
          </div>
        )}
        {!company.trim() && (
          <div className="text-center text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded-lg py-5">
            出向先会社名を入力すると<br />必要な操作が確認できます
          </div>
        )}
      </div>

      {/* フッターボタン */}
      <div className="border-t border-gray-100 px-4 py-3 flex gap-2 flex-shrink-0">
        <button onClick={onBack}
          className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >キャンセル</button>

        {effectiveSF === true ? (
          // SF統合先の場合：閉じるだけ（操作不要なので次のフォームは開かない）
          <button onClick={onBack}
            className="flex-1 text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
          >閉じる（操作不要）</button>
        ) : (
          // SF外 or 未選択
          <button
            onClick={() => { if (effectiveSF === false) onSelectNonSF(company.trim()) }}
            disabled={effectiveSF !== false}
            className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >次へ（兼務行を追加）</button>
        )}
      </div>
    </div>
  )
}

// ── 兼務出向（SF外）のミニダイアグラム ───────────────────────────────────────────

function ConcurrentDiagram({ row, company, empNum }: {
  row:     AllocationRow
  company: string
  empNum:  string
}) {
  const name = [row.lastName, row.firstName].filter(Boolean).join(' ') || '（未入力）'

  return (
    <div className="space-y-2 text-xs">
      {/* 本務行（変更なし） */}
      <Card headerLabel="本務行（変更なし）" headerCls="bg-gray-100 text-gray-600">
        <FieldRow label="氏名"       value={name} />
        <FieldRow label="雇用タイプ" value={row.employmentType ?? '—'} />
        <FieldRow label="区分"       value="本務" />
      </Card>

      {/* 矢印 */}
      <div className="flex items-start gap-2 pl-3 py-0.5 text-green-600">
        <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
          <div className="w-0.5 h-3 bg-green-400" />
          <span className="text-[10px]">↓</span>
        </div>
        <span className="text-[9px] font-semibold text-green-700">このツールで追加（1件）</span>
      </div>

      {/* 新規兼務行 */}
      <Card headerLabel="● 兼務行（新規追加）" headerCls="bg-green-100 text-green-800">
        <FieldRow label="氏名"         value={name} />
        <FieldRow label="雇用タイプ"   value="出向受入" changed />
        <FieldRow label="区分"         value="兼務" changed />
        <FieldRow label="出向先"       value={company} changed />
        <FieldRow label="出向元社番 ★" value={empNum} highlight note="社員番号と一致させる" />
        <FieldRow label="G社員ID"      value="（後連携・空欄可）" later />
        <FieldRow label="社員ID"       value="（後連携・空欄可）" later />
      </Card>

      <p className="text-[8px] text-gray-400 px-1 leading-relaxed">
        ★ 出向元社番は出向元の社員番号（{empNum}）と一致させてください。G社員ID・社員IDは後から入力できます。
      </p>
    </div>
  )
}

function Card({ headerLabel, headerCls, children }: {
  headerLabel: string
  headerCls:   string
  children:    React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className={`px-3 py-1.5 text-[10px] font-semibold ${headerCls}`}>{headerLabel}</div>
      <div className="px-3 py-2 space-y-1.5 bg-white">{children}</div>
    </div>
  )
}

function FieldRow({ label, value, changed, highlight, later, note }: {
  label:      string
  value:      string
  changed?:   boolean
  highlight?: boolean
  later?:     boolean
  note?:      string
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] text-gray-400 min-w-[5.5rem] flex-shrink-0">{label}</span>
      <span className={[
        'text-[10px]',
        highlight ? 'bg-amber-50 text-amber-700 font-bold px-1 rounded ring-1 ring-amber-300' :
        later     ? 'text-gray-300 italic' :
        changed   ? 'text-blue-700 font-semibold' :
        'text-gray-800 font-medium',
      ].join(' ')}>
        {value}
      </span>
      {note && <span className="text-[8px] text-gray-400 flex-shrink-0">← {note}</span>}
    </div>
  )
}
