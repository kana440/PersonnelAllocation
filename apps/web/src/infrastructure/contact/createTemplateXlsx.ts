import { TSV_COLUMNS } from './ContactTsvSerializer'

/** ヘッダー行だけ入った連絡票テンプレート .xlsx を生成してダウンロードする */
export async function downloadContactTemplate(filename = '連絡票.xlsx'): Promise<void> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('連絡票')

  // ヘッダー行（1行目）
  ws.addRow([...TSV_COLUMNS])

  // ヘッダーを太字・背景色つきで装飾
  const headerRow = ws.getRow(1)
  headerRow.eachCell(cell => {
    cell.font      = { bold: true }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } }
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FF8AAED4' } } }
    cell.alignment = { vertical: 'middle' }
  })

  // 列幅を自動設定（最低 12、最大 40）
  ws.columns.forEach((col, i) => {
    const label = TSV_COLUMNS[i] ?? ''
    col.width = Math.min(40, Math.max(12, label.length * 2.2))
  })

  // スレッドData 列（12列目）と アンカーData 列（16列目）は生データ列なので初期非表示
  const threadCol = ws.getColumn(12)
  threadCol.width = 50
  threadCol.hidden = true

  const anchorCol = ws.getColumn(16)
  anchorCol.width = 30
  anchorCol.hidden = true

  // ダウンロード
  const buf   = await wb.xlsx.writeBuffer()
  const blob  = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href      = url
  a.download  = filename
  a.click()
  URL.revokeObjectURL(url)
}
