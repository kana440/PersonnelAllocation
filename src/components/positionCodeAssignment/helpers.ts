import type { UnassignedPosition, PositionCodeAssignment } from '../../ports'
import { clipboardPositionCodeAdapter } from '../../infrastructure/positionCode/ClipboardAdapter'

export function buildExportText(positions: UnassignedPosition[]): string {
  return clipboardPositionCodeAdapter.formatForExport(positions)
}

export function parseImportText(raw: string): PositionCodeAssignment[] {
  return clipboardPositionCodeAdapter.parseImport(raw)
}
