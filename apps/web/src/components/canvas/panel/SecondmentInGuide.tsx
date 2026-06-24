// ガイド画面：本務出向受入 / 兼務出向受入 を＋ボタンから起動する前に表示する説明と操作イメージ

interface FieldDef {
  label:      string
  value:      string
  input?:     boolean   // ユーザーが入力する
  auto?:      boolean   // 自動設定
  highlight?: boolean   // ★照合キー
  later?:     boolean   // 後連携
  note?:      string
}

function FieldRow({ label, value, input, auto, highlight, later, note }: FieldDef) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[9px] text-gray-400 min-w-[5.5rem] flex-shrink-0">{label}</span>
      <span className={[
        'text-[10px]',
        highlight ? 'bg-amber-50 text-amber-700 font-bold px-1 rounded ring-1 ring-amber-300' :
        later     ? 'text-gray-300 italic' :
        auto      ? 'text-purple-600 font-medium' :
        input     ? 'text-blue-700 font-medium' :
        'text-gray-700 font-medium',
      ].join(' ')}>
        {value}
      </span>
      {note && <span className="text-[8px] text-gray-400 flex-shrink-0">← {note}</span>}
    </div>
  )
}

// ── 本務出向受入ガイド ────────────────────────────────────────────────────────

export function SecondmentInGuide({ orgName, onNext, onClose }: {
  orgName: string
  onNext:  () => void
  onClose: () => void
}) {
  return (
    <div className="px-5 py-4 space-y-4">

      {/* 説明 */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-3 space-y-1.5">
        <p className="text-[11px] font-semibold text-blue-900">別会社から本務出向してくる社員を受け入れます</p>
        <p className="text-[10px] text-blue-700 leading-relaxed">
          出向元会社でその社員の本務行が「出向箱」に変更されます。
          受入先（あなたの担当組織）では、この操作で受入行を1件新規作成します。
        </p>
        {orgName && (
          <p className="text-[10px] text-blue-600">
            受入先組織：<span className="font-semibold">{orgName}</span>
          </p>
        )}
      </div>

      {/* 出向元・受入先の関係説明 */}
      <div className="space-y-2">
        {/* 出向元の状態（他社が作業済み・参考） */}
        <div className="rounded-lg border border-dashed border-gray-300 overflow-hidden">
          <div className="bg-gray-50 text-gray-400 px-3 py-1.5 text-[10px] font-semibold">
            ╌ 出向元行（出向元担当者が変更済み・このツールでは操作しません）
          </div>
          <div className="px-3 py-2 space-y-1.5 bg-white">
            <FieldRow label="区分" value="出向箱（変更済み）" />
            <FieldRow label="出向先" value="あなたの会社（設定済み）" />
            <FieldRow label="社員番号 ★" value="出向元の社員番号" note="受入行の「出向元社番」と一致させる" />
          </div>
        </div>

        {/* 矢印 */}
        <div className="flex items-center gap-2 pl-3">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="w-0.5 h-3 bg-green-400" />
            <span className="text-[10px] text-green-600">↓</span>
          </div>
          <span className="text-[9px] font-semibold text-green-700">このツールで作成（1件）</span>
        </div>

        {/* 受入行（このツールで作成） */}
        <div className="rounded-lg border border-green-200 shadow-sm overflow-hidden">
          <div className="bg-green-100 text-green-800 px-3 py-1.5 text-[10px] font-semibold">
            ● 受入行（新規追加）
          </div>
          <div className="px-3 py-2.5 space-y-1.5 bg-white">
            <FieldRow label="氏名"         value="入力（必須）" input />
            <FieldRow label="雇用タイプ"   value="出向受入に対応する雇用タイプ" input />
            <FieldRow label="区分"         value="本務（自動設定）" auto />
            <FieldRow label="異動事由"     value="本務出向受入（自動設定）" auto />
            <FieldRow label="出向元会社"   value="出向元会社名を入力（必須）" input />
            <FieldRow label="出向元社番 ★" value="出向元の社員番号を確認して入力" highlight note="出向元と照合するキー" />
            <FieldRow label="G社員ID"      value="（後連携・空欄可）" later />
            <FieldRow label="社員ID"       value="（SF発行後・後連携可）" later />
          </div>
        </div>
      </div>

      {/* 注釈 */}
      <p className="text-[8px] text-gray-400 leading-relaxed">
        ★「出向元社番」は出向元担当者に社員番号を確認して入力してください。
        G社員ID・社員IDは社員番号体系が異なるため、後から別途連携できます。
      </p>

      {/* ボタン */}
      <div className="flex gap-2 pt-1">
        <button onClick={onClose}
          className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >キャンセル</button>
        <button onClick={onNext}
          className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >確認しました — 入力フォームへ →</button>
      </div>
    </div>
  )
}

// ── 兼務出向受入ガイド ────────────────────────────────────────────────────────

export function ConcurrentSecondmentInGuide({ orgName, onNext, onClose }: {
  orgName: string
  onNext:  () => void
  onClose: () => void
}) {
  return (
    <div className="px-5 py-4 space-y-4">

      {/* 説明 */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-3 space-y-1.5">
        <p className="text-[11px] font-semibold text-blue-900">別会社から兼務出向してくる社員を受け入れます</p>
        <p className="text-[10px] text-blue-700 leading-relaxed">
          出向元の本務行はそのままで、出向先に兼務行が追加される形態です。
          受入先（あなたの担当組織）では、この操作で兼務受入行を1件新規作成します。
        </p>
        {orgName && (
          <p className="text-[10px] text-blue-600">
            受入先組織：<span className="font-semibold">{orgName}</span>
          </p>
        )}
      </div>

      {/* 出向元・受入先の関係説明 */}
      <div className="space-y-2">
        {/* 出向元の本務行（変更なし） */}
        <div className="rounded-lg border border-dashed border-gray-300 overflow-hidden">
          <div className="bg-gray-50 text-gray-400 px-3 py-1.5 text-[10px] font-semibold">
            ╌ 出向元の本務行（変更なし・参考）
          </div>
          <div className="px-3 py-2 space-y-1.5 bg-white">
            <FieldRow label="区分"     value="本務（変更なし）" />
            <FieldRow label="社員番号 ★" value="出向元の社員番号" note="受入行の「出向元社番」と一致させる" />
          </div>
        </div>

        {/* 矢印 */}
        <div className="flex items-center gap-2 pl-3">
          <div className="flex flex-col items-center flex-shrink-0">
            <div className="w-0.5 h-3 bg-green-400" />
            <span className="text-[10px] text-green-600">↓</span>
          </div>
          <span className="text-[9px] font-semibold text-green-700">このツールで作成（1件）</span>
        </div>

        {/* 兼務受入行（このツールで作成） */}
        <div className="rounded-lg border border-green-200 shadow-sm overflow-hidden">
          <div className="bg-green-100 text-green-800 px-3 py-1.5 text-[10px] font-semibold">
            ● 兼務受入行（新規追加）
          </div>
          <div className="px-3 py-2.5 space-y-1.5 bg-white">
            <FieldRow label="氏名"         value="入力（必須）" input />
            <FieldRow label="雇用タイプ"   value="出向受入に対応する雇用タイプ" input />
            <FieldRow label="区分"         value="兼務（自動設定）" auto />
            <FieldRow label="異動事由"     value="兼務出向受入（自動設定）" auto />
            <FieldRow label="兼務理由"     value="入力（必須）" input />
            <FieldRow label="出向元会社"   value="出向元会社名を入力（必須）" input />
            <FieldRow label="出向元社番 ★" value="出向元の社員番号を確認して入力" highlight note="出向元と照合するキー" />
            <FieldRow label="G社員ID"      value="（後連携・空欄可）" later />
            <FieldRow label="社員ID"       value="（SF発行後・後連携可）" later />
          </div>
        </div>
      </div>

      {/* 注釈 */}
      <p className="text-[8px] text-gray-400 leading-relaxed">
        ★「出向元社番」は出向元担当者に社員番号を確認して入力してください。
        G社員ID・社員IDは後から別途入力できます。
      </p>

      {/* ボタン */}
      <div className="flex gap-2 pt-1">
        <button onClick={onClose}
          className="flex-1 text-xs px-3 py-1.5 border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
        >キャンセル</button>
        <button onClick={onNext}
          className="flex-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >確認しました — 入力フォームへ →</button>
      </div>
    </div>
  )
}
