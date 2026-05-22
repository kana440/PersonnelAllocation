import { SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from '../../../infrastructure/excel/engine'

export function ExcelHelpWidget() {
  return (
    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden bg-white text-xs text-gray-700">
      <Section title={`シート①：${SHEET_ALLOCATION}`}>
        <p className="text-gray-500 mb-2">要員の配置情報シートです。「No」または「ユーザー/社員ID」を含むヘッダ行を自動検出します。</p>
      </Section>

      <Section title={`シート②：${SHEET_CODE_LISTS}`}>
        <p className="text-gray-500 mb-2">コードリストが横並びのシートです。行1がヘッダ、行2以降がデータです。</p>
        <Table rows={[
          ['B–D列',   '会社絞込用（会社CD・名称）'],
          ['F–I列',   '異動事由'],
          ['K–P列',   '雇用タイプ'],
          ['R–Z列',   '給与等級'],
          ['AE–AH列', '役職'],
          ['AJ–AK列', '勤務場所'],
          ['AM–AN列', '職種（Job Family）'],
          ['AP–AU列', 'Sub Job Family'],
          ['AW–BG列', '職務レベル'],
        ]} />
      </Section>

      <Section title={`シート③：${SHEET_ORG_MASTER}`}>
        <p className="text-gray-500 mb-2">組織マスタシートです。行1がヘッダ、行2以降がデータです。</p>
        <Table rows={[
          ['B列', '組織コード（必須）'],
          ['C列', 'ビジネスユニット'],
          ['D列', '部門'],
          ['E列', '統括部'],
          ['F列', 'グループ'],
          ['G列', 'チーム'],
          ['H列', '組織レベル'],
        ]} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 last:border-0 px-4 py-3">
      <h4 className="font-semibold text-gray-800 mb-2">{title}</h4>
      {children}
    </div>
  )
}

function Table({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full border-collapse">
      <tbody>
        {rows.map(([col, desc], i) => (
          <tr key={i} className="border-b border-gray-50 last:border-0">
            <td className="py-0.5 pr-3 font-mono text-blue-600 whitespace-nowrap w-20 align-top">{col}</td>
            <td className="py-0.5 text-gray-600">{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
