// 人操作系の変更検知: 採用・退職・休職・移籍
import type { AllocationRow } from '../../allocationRow'
import type { EditPattern } from '../defs'

export function detectPersonStatus(row: AllocationRow): Set<EditPattern> {
  const out = new Set<EditPattern>()

  // 新規採用（before に組織コードなし、after にユーザーあり）
  const isNewHire = !row.prevDepartmentCode && !!row.userId
  if (isNewHire) out.add('newHire')

  // 退職（before に組織コードあり、after にユーザー・組織コードなし）
  if (row.prevDepartmentCode && !row.userId && !row.departmentCode) out.add('termination')

  // 休職・復職
  const prevLeave  = row.prevLeaveOfAbsenceSign as string | undefined
  const afterLeave = row.leaveOfAbsenceSign     as string | undefined
  if (!prevLeave && afterLeave)  out.add('leaveOfAbsence')
  if (prevLeave  && !afterLeave) out.add('returnFromLeave')

  // 移籍
  const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
  const afterEt = (row.employmentType     as string | undefined) ?? ''
  if (prevEt && !afterEt)           out.add('employmentTransferOut')
  if (!prevEt && afterEt && isNewHire) out.add('employmentTransferIn')

  // 退職・退任（transferReason 文字列による後方互換検知）
  const tr = (row.transferReason as string | undefined) ?? ''
  if (tr.includes('退職') || tr.includes('退任')) out.add('resignation')

  return out
}
