// ClipboardAdapter — IPositionCodePort implementation for clipboard-based workflow.
//
// Export format (TSV, 6 columns):
//   rowId | 内部コード | 職種 | 組織コード | 組織名 | 新ポジションコード（空欄）
//
// Import format: same TSV, column 5 (0-indexed) filled with P\d{8} code.
// The header row is skipped; rows without a valid code are silently ignored.

import type { IPositionCodePort, UnassignedPosition, PositionCodeAssignment } from '../../ports'

export class ClipboardPositionCodeAdapter implements IPositionCodePort {

  formatForExport(positions: UnassignedPosition[]): string {
    const header = 'rowId\t内部コード\t職種\t組織コード\t組織名\t新ポジションコード'
    const rows   = positions.map(p =>
      `${p.rowId}\t${p.positionCode}\t${p.localJobTitle}\t${p.departmentCode}\t${p.orgName}\t`
    )
    return [header, ...rows].join('\n')
  }

  parseImport(raw: string): PositionCodeAssignment[] {
    const lines   = raw.trim().split(/\r?\n/)
    const results: PositionCodeAssignment[] = []
    for (const line of lines) {
      const cols           = line.split('\t')
      const rowIdRaw       = (cols[0] ?? '').trim()
      const newPositionCode = (cols[5] ?? '').trim()
      if (!rowIdRaw || rowIdRaw === 'rowId') continue  // skip empty / header
      const rowId = parseInt(rowIdRaw, 10)
      if (isNaN(rowId)) continue
      if (!/^P\d{8}$/.test(newPositionCode)) continue  // skip rows without valid code
      results.push({ rowId, newPositionCode })
    }
    return results
  }
}

export const clipboardPositionCodeAdapter = new ClipboardPositionCodeAdapter()
