import type { AllocationRow } from '../allocationRow'
import type { ValidationIssue } from './types'

/** B1: 社員番号は7桁の半角数字 */
function checkB1(row: AllocationRow): ValidationIssue[] {
  const num = row.employeeNumber
  if (!num) return []
  if (/^\d{7}$/.test(num)) return []
  return [{ field: 'employeeNumber', level: 'error', message: '社員番号は7桁の半角数字で入力してください' }]
}

/** B2: ポジションコードは P + 8桁半角数字（_pos_ 始まりの内部採番は対象外） */
function checkB2(row: AllocationRow): ValidationIssue[] {
  const code = row.positionCode
  if (!code) return []
  if (code.startsWith('_pos_')) return []
  if (/^P\d{8}$/.test(code)) return []
  return [{ field: 'positionCode', level: 'error', message: 'ポジションコードは「P」+ 8桁半角数字の形式で入力してください（例: P12345678）' }]
}

/** B3: コストセンターは 数字5桁-英数字7桁（半角大文字） */
function checkB3(row: AllocationRow): ValidationIssue[] {
  const val = row.costCenter
  if (!val) return []
  if (/^\d{5}-[A-Z0-9]{7}$/.test(val)) return []
  return [{ field: 'costCenter', level: 'error', message: 'コストセンターは「数字5桁-英数字7桁」の半角大文字で入力してください（例: 12345-AB00001）' }]
}

/** B4: ユーザーIDは半角数字のみ */
function checkB4(row: AllocationRow): ValidationIssue[] {
  const val = row.userId
  if (!val) return []
  if (/^\d+$/.test(val)) return []
  return [{ field: 'userId', level: 'error', message: 'ユーザーIDは半角数字で入力してください' }]
}

export function runBasedOnFormat(row: AllocationRow): ValidationIssue[] {
  return [
    ...checkB1(row),
    ...checkB2(row),
    ...checkB3(row),
    ...checkB4(row),
  ]
}
