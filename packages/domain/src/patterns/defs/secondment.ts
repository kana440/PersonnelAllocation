import type { EditPatternMeta } from './types'
import { isNoCheckReason } from '../detection/helpers'
import { C_BLUE, C_RED, isOutsource } from './_shared'

export const SECONDMENT_META: Partial<Record<string, EditPatternMeta>> = {
  // 出向（本務）
  secondmentOut: {
    label: '本務出向', addLabel: '本務出向', editLabel: '本務出向',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row, cl) => !isOutsource(row, cl) && row.concurrentType !== '兼務',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '本務出向'
      const prevOut = row.prevSecondmentToCompany as string | undefined
      const afterOut = row.secondmentToCompany   as string | undefined
      return !prevOut && !!afterOut && row.concurrentType !== '兼務'
    },
  },
  secondmentIn: {
    label: '本務出向受入', addLabel: '本務出向受入', editLabel: '本務出向受入',
    menuLabel: '出向受入',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row) => row.concurrentType !== '兼務',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '本務出向受入'
      const prevIn  = row.prevSecondmentFromCompany as string | undefined
      const afterIn = row.secondmentFromCompany     as string | undefined
      return !prevIn && !!afterIn && row.concurrentType !== '兼務'
    },
  },
  secondmentOutRelease: {
    label: '本務出向解除', addLabel: '本務出向解除', editLabel: '本務出向解除',
    menuLabel: '出向解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!(row.prevSecondmentToCompany as string | undefined),
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '本務出向解除'
      const prevOut  = row.prevSecondmentToCompany as string | undefined
      const afterOut = row.secondmentToCompany     as string | undefined
      return !!prevOut && !afterOut && row.concurrentType !== '兼務'
    },
  },
  secondmentInRelease: {
    label: '本務出向受入解除', addLabel: '本務出向受入解除', editLabel: '本務出向受入解除',
    menuLabel: '受入解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!(row.prevSecondmentFromCompany as string | undefined),
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '本務出向受入解除'
      const prevIn  = row.prevSecondmentFromCompany as string | undefined
      const afterIn = row.secondmentFromCompany     as string | undefined
      return !!prevIn && !afterIn && row.concurrentType !== '兼務'
    },
  },
  // 出向（兼務）
  concurrentSecondmentOut: {
    label: '兼務出向', addLabel: '兼務出向', editLabel: '兼務出向',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row) => row.concurrentType !== '兼務',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '兼務出向'
      const prevOut  = row.prevSecondmentToCompany as string | undefined
      const afterOut = row.secondmentToCompany     as string | undefined
      return !prevOut && !!afterOut && row.concurrentType === '兼務'
    },
  },
  concurrentSecondmentIn: {
    label: '兼務出向受入', addLabel: '兼務出向受入', editLabel: '兼務出向受入',
    menuLabel: '兼務受入',
    badgeColor: C_BLUE, group: 'person',
    availableFor: (row) => row.concurrentType !== '兼務',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '兼務出向受入'
      const prevIn  = row.prevSecondmentFromCompany as string | undefined
      const afterIn = row.secondmentFromCompany     as string | undefined
      return !prevIn && !!afterIn && row.concurrentType === '兼務'
    },
  },
  concurrentSecondmentOutRelease: {
    label: '兼務出向解除', addLabel: '兼務出向解除', editLabel: '兼務出向解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => row.concurrentType === '兼務' && !!row.secondmentToCompany,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '兼務出向解除'
      const prevOut  = row.prevSecondmentToCompany as string | undefined
      const afterOut = row.secondmentToCompany     as string | undefined
      return !!prevOut && !afterOut && row.prevConcurrentType === '兼務' && !row.departmentCode
    },
  },
  concurrentSecondmentInRelease: {
    label: '兼務出向受入解除', addLabel: '兼務出向受入解除', editLabel: '兼務出向受入解除',
    menuLabel: '兼務受入解除',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => row.concurrentType === '兼務' && !!row.secondmentFromCompany,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '兼務出向受入解除'
      const prevIn  = row.prevSecondmentFromCompany as string | undefined
      const afterIn = row.secondmentFromCompany     as string | undefined
      return !!prevIn && !afterIn && row.prevConcurrentType === '兼務' && !row.departmentCode
    },
  },
}
