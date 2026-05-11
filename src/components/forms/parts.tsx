import type { AffDetail } from './types'
import type { BandOption, Company, Organization } from '../../domain/schemas'

// ── デフォルト値（マスタ未ロード時のフォールバック） ──────────
// ロード後は store の bands / transferReasons が使われる
export const DEFAULT_BANDS: BandOption[] = [
  { id: 'B1', label: 'B1', grade: '1等級', sortOrder: 1 },
  { id: 'B2', label: 'B2', grade: '2等級', sortOrder: 2 },
  { id: 'B3', label: 'B3', grade: '3等級', sortOrder: 3 },
  { id: 'B4', label: 'B4', grade: '4等級', sortOrder: 4 },
  { id: 'B5', label: 'B5', grade: '5等級', sortOrder: 5 },
  { id: 'B6', label: 'B6', grade: '6等級', sortOrder: 6 },
  { id: 'B7', label: 'B7', grade: '7等級', sortOrder: 7 },
]

export const DEFAULT_TRANSFER_REASONS = [
  '組織異動', '昇格', '降格', '出向', '出向解除',
  '兼務追加', '兼務解除', '採用', '退職', 'その他',
]

// ── 共通サブコンポーネント ─────────────────────────────────────

export function FromCard({ title, items }: { title: string; items: AffDetail[] }) {
  return (
    <div className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5 text-xs">
      <div className="text-gray-400 mb-0.5 font-medium">{title}</div>
      {items.length === 0
        ? <span className="text-gray-400 italic">なし</span>
        : items.map(d => (
          <div key={d.aff.id} className="flex items-center gap-1.5 flex-wrap">
            <span className="text-gray-400">{d.company.name}</span>
            <span className="font-semibold text-gray-700">{d.org.name}</span>
            <span className="text-gray-500">{d.aff.freeTitle ?? d.pos.title}</span>
            <span className="font-mono font-medium text-blue-600">{d.aff.individualBand ?? d.pos.band}</span>
            {d.aff.employmentType === '出向' && (
              <span className="bg-orange-100 text-orange-600 px-1 rounded">出向</span>
            )}
            {d.aff.type === 'concurrent' && <span className="text-purple-400">兼務</span>}
          </div>
        ))
      }
    </div>
  )
}

export function CompanyBtn({ company, selected, onSelect, activeColor }: {
  company: Company
  selected: boolean
  onSelect: () => void
  activeColor: string
}) {
  return (
    <button
      onClick={onSelect}
      className={`px-2.5 py-1.5 border rounded text-xs font-medium transition-colors ${
        selected ? activeColor : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {company.name}
      {!company.hasSF && <span className="ml-1 text-gray-400 font-normal">(SF外)</span>}
    </button>
  )
}

export function OrgSelect({ label, value, onChange, orgs }: {
  label: string
  value: string
  onChange: (id: string) => void
  orgs: Organization[]
}) {
  return (
    <div>
      <div className="text-gray-500 mb-1 text-xs">{label}</div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded px-2 py-1.5 text-xs"
      >
        <option value="">— 選択してください —</option>
        {orgs.map(o => (
          <option key={o.id} value={o.id}>{'　'.repeat(o.level - 2)}{o.name}</option>
        ))}
      </select>
    </div>
  )
}

// bands: リポジトリから取得したマスタ。未提供時はデフォルトにフォールバック。
export function BandSelector({ value, onChange, currentBand, activeColor, bands = DEFAULT_BANDS }: {
  value: string
  onChange: (b: string) => void
  currentBand?: string
  activeColor: string
  bands?: BandOption[]
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {bands.map(b => (
        <button
          key={b.id}
          onClick={() => onChange(b.id)}
          className={`px-2 py-0.5 border rounded text-xs font-medium transition-colors leading-none ${
            value === b.id ? activeColor
            : b.id === currentBand ? 'border-gray-400 bg-gray-100 text-gray-500'
            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          {b.label}
          {b.id === currentBand && (
            <span className="block text-xs text-gray-400 leading-none">現在</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function TitleRow({ title, onTitle, freeTitle, onFreeTitle, showFree = false }: {
  title: string
  onTitle: (v: string) => void
  freeTitle: string
  onFreeTitle: (v: string) => void
  showFree?: boolean
}) {
  return (
    <div className={`grid gap-2 ${showFree ? 'grid-cols-2' : 'grid-cols-1'}`}>
      <div>
        <div className="text-gray-500 mb-1 text-xs">役職</div>
        <input
          value={title}
          onChange={e => onTitle(e.target.value)}
          className="w-full border rounded px-2 py-1 text-xs"
        />
      </div>
      {showFree && (
        <div>
          <div className="text-gray-500 mb-1 text-xs">フリータイトル</div>
          <input
            value={freeTitle}
            onChange={e => onFreeTitle(e.target.value)}
            placeholder="個別役職名"
            className="w-full border rounded px-2 py-1 text-xs"
          />
        </div>
      )}
    </div>
  )
}

// transferReasons: リポジトリから取得したマスタ。未提供時はデフォルトにフォールバック。
export function MetaSection({
  transferReason, onTransferReason,
  memo, onMemo,
  promotionSign, onPromotionSign,
  transferReasons = DEFAULT_TRANSFER_REASONS,
}: {
  transferReason: string
  onTransferReason: (v: string) => void
  memo: string
  onMemo: (v: string) => void
  promotionSign: boolean
  onPromotionSign: (v: boolean) => void
  transferReasons?: string[]
}) {
  return (
    <div className="border-t border-gray-100 pt-2 space-y-1.5">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-gray-500 mb-1 text-xs">申請区分</div>
          <select
            value={transferReason}
            onChange={e => onTransferReason(e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs"
          >
            <option value="">— 自動判定 —</option>
            {transferReasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={promotionSign}
              onChange={e => onPromotionSign(e.target.checked)}
              className="rounded"
            />
            昇降格サイン
          </label>
        </div>
      </div>
      <div>
        <div className="text-gray-500 mb-1 text-xs">メモ</div>
        <input
          value={memo}
          onChange={e => onMemo(e.target.value)}
          placeholder="任意メモ..."
          className="w-full border rounded px-2 py-1 text-xs"
        />
      </div>
    </div>
  )
}

export function FormFooter({ onCancel, onSubmit, disabled }: {
  onCancel: () => void
  onSubmit: () => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-2 justify-end pt-2 border-t border-gray-100 mt-2">
      <button
        onClick={onCancel}
        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
      >
        キャンセル
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        手順に追加
      </button>
    </div>
  )
}
