import type { AllocationRow } from '@personnel/domain/allocationRow'

// ── フィールド定義 ─────────────────────────────────────────────────────────────

type FieldDef = {
  label:      string
  value:      string
  changed?:   boolean   // 変更されたフィールド（青）
  highlight?: boolean   // ★照合キー（アンバー）
  later?:     boolean   // 後連携（グレー斜体）
  note?:      string
}

// ── サブコンポーネント ─────────────────────────────────────────────────────────

function RecordCard({ headerLabel, headerCls, fields, dashed = false }: {
  headerLabel: string
  headerCls:   string
  fields:      FieldDef[]
  dashed?:     boolean
}) {
  return (
    <div className={`rounded-lg border overflow-hidden text-xs ${dashed ? 'border-dashed border-gray-300' : 'border-gray-200 shadow-sm'}`}>
      <div className={`px-3 py-1.5 text-[10px] font-semibold ${headerCls}`}>{headerLabel}</div>
      <div className="px-3 py-2 space-y-1.5 bg-white">
        {fields.map((f, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <span className="text-[9px] text-gray-400 min-w-[5.5rem] flex-shrink-0">{f.label}</span>
            <span className={[
              'text-[10px]',
              f.highlight
                ? 'bg-amber-50 text-amber-700 font-bold px-1 rounded ring-1 ring-amber-300'
                : f.later
                ? 'text-gray-300 italic'
                : f.changed
                ? 'text-blue-700 font-semibold'
                : 'text-gray-800 font-medium',
            ].join(' ')}>
              {f.value}
            </span>
            {f.note && (
              <span className="text-[8px] text-gray-400 flex-shrink-0">← {f.note}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function FlowArrow({ label, sub, dashed }: { label: string; sub?: string; dashed?: boolean }) {
  return (
    <div className={`flex items-start gap-2 py-1 pl-3 ${dashed ? 'text-gray-400' : 'text-gray-500'}`}>
      <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
        <div className={`w-0.5 h-3 ${dashed ? 'bg-gray-300' : 'bg-gray-400'}`} />
        <span className="text-[10px]">↓</span>
      </div>
      <div>
        <span className={`text-[9px] font-semibold ${dashed ? 'text-gray-400 italic' : 'text-gray-600'}`}>{label}</span>
        {sub && <p className="text-[8px] text-gray-400 leading-tight mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function SectionWrapper({ title, titleCls, ringCls, dim, children }: {
  title:    string
  titleCls: string
  ringCls:  string
  dim:      boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border-2 p-3 space-y-2 transition-opacity ${ringCls} ${dim ? 'opacity-30 pointer-events-none select-none' : ''}`}>
      <p className={`text-[10px] font-bold ${titleCls}`}>{title}</p>
      {children}
    </div>
  )
}

// ── メインコンポーネント ───────────────────────────────────────────────────────

interface Props {
  row:         AllocationRow
  company:     string     // 出向先会社名（未入力は '' ）
  effectiveSF: boolean | null
}

export function SecondmentDiagram({ row, company, effectiveSF }: Props) {
  const name   = [row.lastName, row.firstName].filter(Boolean).join(' ') || '（未入力）'
  const empNum = row.employeeNumber ?? '（未設定）'
  const dest   = company.trim() || '出向先会社'

  const sfDim    = effectiveSF === false
  const nonSFDim = effectiveSF === true

  const beforeFields: FieldDef[] = [
    { label: '氏名',         value: name },
    { label: '雇用タイプ',   value: row.employmentType ?? '—' },
    { label: '区分',         value: row.concurrentType ?? '本務' },
    { label: '社員番号 ★',   value: empNum, note: '照合に使う' },
  ]

  const kohakoFields: FieldDef[] = [
    { label: '氏名',         value: name },
    { label: '雇用タイプ',   value: row.employmentType ?? '—' },
    { label: '区分',         value: '出向箱', changed: true },
    { label: '組織',         value: '出向者用組織へ移動', changed: true, note: '出向箱専用の組織コードを設定' },
    { label: '異動事由',     value: '本務出向', changed: true },
    { label: '出向先',       value: dest, changed: true },
  ]

  const sfReceiveFields: FieldDef[] = [
    { label: '氏名',         value: name },
    { label: '雇用タイプ',   value: '出向受入' },
    { label: '区分',         value: '本務' },
    { label: '出向元社番 ★', value: empNum, highlight: true, note: '社員番号と一致させる' },
    { label: 'G社員ID',      value: '（SF発行後）', later: true },
    { label: '社員ID',       value: '（6桁・SF発行後）', later: true },
  ]

  const nonSFReceiveFields: FieldDef[] = [
    { label: '氏名',         value: name },
    { label: '雇用タイプ',   value: '出向受入' },
    { label: '区分',         value: '本務' },
    { label: '出向元社番 ★', value: empNum, highlight: true, note: 'フォームで入力必須' },
    { label: 'G社員ID',      value: '（後連携・空欄可）', later: true },
    { label: '社員ID',       value: '（後連携・空欄可）', later: true },
  ]

  return (
    <div className="space-y-3 text-xs">

      {/* 変更前 */}
      <RecordCard
        headerLabel="変更前（現在）"
        headerCls="bg-gray-100 text-gray-600"
        fields={beforeFields}
      />

      {/* SF統合先 パス */}
      <SectionWrapper
        title="SF統合先の場合 — このツールでの操作は1件"
        titleCls={effectiveSF === true ? 'text-purple-800' : 'text-purple-600'}
        ringCls={effectiveSF === true ? 'border-purple-400 bg-purple-50/30' : 'border-purple-200'}
        dim={sfDim}
      >
        <FlowArrow label="このツールで変更" />
        <RecordCard
          headerLabel="● 出向箱に変更（あなたが操作）"
          headerCls="bg-amber-100 text-amber-800"
          fields={kohakoFields}
        />
        <FlowArrow
          label="XX社担当者が別途作成（このツールでは作成しません）"
          sub="XX社のツール上でXX社担当者が受入行を作成します。作成後に出向元社番が一致しているか確認してください。"
          dashed
        />
        <RecordCard
          headerLabel="╌ 受入行（XX社担当が作成）"
          headerCls="bg-gray-50 text-gray-400"
          fields={sfReceiveFields}
          dashed
        />
      </SectionWrapper>

      {/* SF外 パス */}
      <SectionWrapper
        title="SF外（未統合）の場合 — このツールでの操作は2件"
        titleCls={effectiveSF === false ? 'text-orange-800' : 'text-orange-600'}
        ringCls={effectiveSF === false ? 'border-orange-400 bg-orange-50/30' : 'border-orange-200'}
        dim={nonSFDim}
      >
        <FlowArrow label="このツールで変更（1件目）" />
        <RecordCard
          headerLabel="● 出向箱に変更（1件目）"
          headerCls="bg-amber-100 text-amber-800"
          fields={kohakoFields}
        />
        <FlowArrow
          label="このツールで代理作成（2件目）"
          sub={`SF外はXX社側にSFがないため、あなたが受入行を代理で作成します。出向元社番に「${empNum}」を入力してください。`}
        />
        <RecordCard
          headerLabel="● 受入行を代理作成（2件目・あなたが作成）"
          headerCls="bg-green-100 text-green-800"
          fields={nonSFReceiveFields}
        />
      </SectionWrapper>

      {/* 注釈 */}
      <p className="text-[8px] text-gray-400 leading-relaxed px-1">
        ★「出向元社番」は出向元の社員番号（{empNum}）と一致させることで、出向元と受入行を同一人物として照合できます。
        G社員ID・社員IDは後から確定次第入力してかまいません。
      </p>
    </div>
  )
}
