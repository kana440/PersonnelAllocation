import { SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../infrastructure/excel/engine'

interface Props {
  onClose: () => void
}

export function SetupHelp({ onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-800">Excelファイルの要件</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="space-y-5 text-xs text-gray-700">
          <HelpSection title={`シート①：${SHEET_ALLOCATION}`}>
            <p className="text-gray-500 mb-2">要員（社員・派遣・業務委託受入）の配置情報を記載するシートです。</p>
            <HelpTable rows={[
              ['B列以降', '配置データ（ユーザーID、氏名、組織コード、ポジション等）'],
              ['ヘッダ行', '「No」または「ユーザー/社員ID」を含む行を自動検出'],
            ]} />
          </HelpSection>

          <HelpSection title={`シート②：${SHEET_CODE_LISTS}`}>
            <p className="text-gray-500 mb-2">コードリストが横並びで配置されているシートです。行1がヘッダ、行2以降がデータ。</p>
            <HelpTable rows={[
              ['B – D列',    '会社絞込用（会社CD・名称・裁量VMフラグ）'],
              ['F – I列',    '異動事由'],
              ['K – P列',    '雇用タイプ'],
              ['R – Z列',    '給与等級'],
              ['AE – AH列',  '役職'],
              ['AJ – AK列',  '勤務場所'],
              ['AM – AN列',  '職種（Job Family）'],
              ['AP – AU列',  'Sub Job Family（親Job Family CDはAP列）'],
              ['AW – BG列',  '職務レベル'],
              ['BI列',       '業務研修ポジション（単一列リスト）'],
              ['BM列',       '裁量労働／業務研修（単一列リスト）'],
              ['BQ列',       '兼務理由'],
              ['BS列',       '昇降格理由'],
            ]} />
          </HelpSection>

          <HelpSection title={`シート③：${SHEET_ORG_MASTER}`}>
            <p className="text-gray-500 mb-2">組織マスタデータのシートです。行1がヘッダ、行2以降がデータ。</p>
            <HelpTable rows={[
              ['B列', '組織コード（必須・行末判定キー）'],
              ['C列', 'ビジネスユニット'],
              ['D列', '部門'],
              ['E列', '統括部'],
              ['F列', 'グループ'],
              ['G列', 'チーム'],
              ['H列', '組織レベル（数値）'],
            ]} />
          </HelpSection>

          <p className="text-gray-400 border-t border-gray-100 pt-3">
            サンプルファイルを使う場合は{' '}
            <code className="bg-gray-100 px-1 rounded font-mono">public/.local/sample.xlsx</code>{' '}
            に配置してください（.gitignore 対象）。
          </p>
        </div>
      </div>
    </div>
  )
}

function HelpSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-gray-800 mb-2 pb-1 border-b border-gray-200">{title}</h3>
      {children}
    </div>
  )
}

function HelpTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map(([col, desc], i) => (
          <tr key={i} className="border-b border-gray-100 last:border-0">
            <td className="py-1 pr-4 font-mono text-blue-600 whitespace-nowrap align-top w-28">{col}</td>
            <td className="py-1 text-gray-600">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
