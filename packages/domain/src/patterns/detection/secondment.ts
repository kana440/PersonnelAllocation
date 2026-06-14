// 出向系の変更検知: 本務・兼務の出向追加/解除
import type { AllocationRow } from '../../allocationRow'
import type { EditPattern } from '../defs'

export function detectSecondment(row: AllocationRow): Set<EditPattern> {
  const out = new Set<EditPattern>()

  const prevOut  = row.prevSecondmentToCompany   as string | undefined
  const afterOut = row.secondmentToCompany       as string | undefined
  const prevIn   = row.prevSecondmentFromCompany as string | undefined
  const afterIn  = row.secondmentFromCompany     as string | undefined
  const isConcurrent  = row.concurrentType     === '兼務'
  const wasConcurrent = row.prevConcurrentType === '兼務'

  // 出向追加
  if (!prevOut && afterOut) out.add(isConcurrent ? 'concurrentSecondmentOut' : 'secondmentOut')
  if (!prevIn  && afterIn)  out.add(isConcurrent ? 'concurrentSecondmentIn'  : 'secondmentIn')

  // 出向解除（本務）
  if (prevOut && !afterOut && !isConcurrent)  out.add('secondmentOutRelease')
  if (prevIn  && !afterIn  && !isConcurrent)  out.add('secondmentInRelease')

  // 出向解除（兼務行が消える）
  if (prevOut && !afterOut && wasConcurrent && !row.departmentCode) out.add('concurrentSecondmentOutRelease')
  if (prevIn  && !afterIn  && wasConcurrent && !row.departmentCode) out.add('concurrentSecondmentInRelease')

  return out
}
