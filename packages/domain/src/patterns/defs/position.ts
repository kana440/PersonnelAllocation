import type { EditPatternMeta } from './types'
import { isNoCheckReason } from '../detection/helpers'
import { C_BLUE, C_RED, isOutsource } from './_shared'

export const POSITION_META: Partial<Record<string, EditPatternMeta>> = {
  orgTransfer: {
    label: '社内異動', addLabel: '社内異動', editLabel: '社内異動',
    badgeColor: C_BLUE, group: 'position',
    availableFor: (row, cl) => !isOutsource(row, cl),
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '社内異動'
      const prevCode  = row.prevDepartmentCode ?? ''
      const afterCode = row.departmentCode     ?? ''
      const deptChanged   = prevCode !== afterCode
      const isSameOrgPair = deptChanged && (ctx.sameOrgPairs?.has(`${prevCode}|${afterCode}`) ?? false)
      return deptChanged && !isSameOrgPair
    },
  },
  orgRestructure: {
    label: '組織改変', addLabel: '組織改変', editLabel: '組織改変',
    badgeColor: C_BLUE, group: 'position',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '組織改変'
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
    badgeColor: C_BLUE, group: 'position',
    availableFor: (row) => !!row.positionCode,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '上司変更'
      return (row.managerPositionCode ?? '') !== (row.prevManagerPositionCode ?? '')
    },
  },
  concurrentAdd: {
    label: '社内兼務追加', addLabel: '社内兼務追加', editLabel: '社内兼務追加',
    menuLabel: '兼務追加',
    badgeColor: C_BLUE, group: 'position',
    availableFor: (row) => !!row.userId && row.concurrentType !== '兼務',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return false
      return !!(
        !row.prevConcurrentType &&
        row.concurrentType === '兼務' &&
        !row.prevSecondmentToCompany &&
        !row.prevSecondmentFromCompany
      )
    },
  },
  concurrentRelease: {
    label: '社内兼務解除', addLabel: '社内兼務解除', editLabel: '社内兼務解除',
    menuLabel: '兼務解除',
    badgeColor: C_RED, group: 'position',
    availableFor: (row) =>
      row.concurrentType === '兼務' &&
      !row.secondmentToCompany &&
      !row.secondmentFromCompany,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return false
      return !!(
        row.prevConcurrentType === '兼務' &&
        !row.concurrentType &&
        !row.prevSecondmentToCompany &&
        !row.prevSecondmentFromCompany
      )
    },
  },
}
