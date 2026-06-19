// 人操作系の変更検知: 採用・退職・休職・移籍
import type { AllocationRow } from '../../allocationRow'
import type { EditPattern } from '../defs'
import { TR } from '../../transferReasonLabels'

export function detectPersonStatus(row: AllocationRow): Set<EditPattern> {
  const out = new Set<EditPattern>()

  // 休職・復職
  const prevLeave  = row.prevLeaveOfAbsenceSign as string | undefined
  const afterLeave = row.leaveOfAbsenceSign     as string | undefined
  if (!prevLeave && afterLeave)  out.add('leaveOfAbsence')
  if (prevLeave  && !afterLeave) out.add('returnFromLeave')

  // 移籍・退職・変更なし（transferReason 文字列ベース）
  const tr = (row.transferReason as string | undefined) ?? ''
  if (tr === TR.TRANSFER)    out.add('employmentTransfer')
  if (tr === TR.TERMINATION) out.add('termination')
  if (tr.includes('退職') || tr.includes('退任'))        out.add('resignation')

  return out
}
