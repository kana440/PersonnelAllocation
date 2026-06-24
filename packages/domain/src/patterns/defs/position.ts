import type { EditPatternMeta } from './types'
import { isNoCheckReason } from '../detection/helpers'
import { TR } from '../../transferReasonLabels'

export const POSITION_META: Partial<Record<string, EditPatternMeta>> = {
  orgTransfer: {
    label: '別組織へ異動', addLabel: '別組織へ異動', editLabel: '別組織へ異動',
    menuLabel: '別組織異動',
    badge: 'transfer', group: 'position',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === TR.ORG_TRANSFER
      const prevCode  = row.prevDepartmentCode ?? ''
      const afterCode = row.departmentCode     ?? ''
      const deptChanged   = prevCode !== afterCode
      const isSameOrgPair = deptChanged && (ctx.sameOrgPairs?.has(`${prevCode}|${afterCode}`) ?? false)
      return deptChanged && !isSameOrgPair
    },
  },
  orgRestructure: {
    label: '組織コード変更(組改)', addLabel: '組織コード変更(組改)', editLabel: '組織コード変更(組改)',
    menuLabel: '組織CD変更(組改)',
    badge: 'transfer', group: 'position',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === TR.ORG_RESTRUCTURE
      const prevCode  = row.prevDepartmentCode ?? ''
      const afterCode = row.departmentCode     ?? ''
      const deptChanged   = prevCode !== afterCode
      const isSameOrgPair = deptChanged && (ctx.sameOrgPairs?.has(`${prevCode}|${afterCode}`) ?? false)
      // sameOrgPairs に含まれる = 組織コード改名・統廃合（同一組織の異なるコード）+ positionCode が同じ
      return !!(
        prevCode && afterCode && isSameOrgPair &&
        (row.prevPositionCode ?? '') !== '' &&
        (row.positionCode ?? '') === (row.prevPositionCode ?? '')
      )
    },
  },
  managerChange: {
    label: '上司変更', addLabel: '上司変更', editLabel: '上司変更',
    badge: 'transfer', group: 'position',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === TR.MANAGER_CHANGE
      return (row.managerPositionCode ?? '') !== (row.prevManagerPositionCode ?? '')
    },
  },
  concurrentAdd: {
    label: '社内兼務追加', addLabel: '社内兼務追加', editLabel: '社内兼務追加',
    menuLabel: '兼務追加',
    badge: 'concurrent', group: 'position',
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.CONCURRENT,
  },
  concurrentRelease: {
    label: '社内兼務解除', addLabel: '社内兼務解除', editLabel: '社内兼務解除',
    menuLabel: '兼務解除',
    badge: 'negative', group: 'position',
    detect: (row, ctx) => {
      if ((row.transferReason as string | undefined) !== TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE) return false
      const prevEt = (row.prevEmploymentType as string | undefined) ?? ''
      const isRegular = prevEt !== '' &&
        (ctx.masters.employmentTypes.find(e => e.label === prevEt)?.isRegularEmployee ?? false)
      return isRegular && (row.prevConcurrentType as string | undefined) === '兼務'
    },
  },
}
