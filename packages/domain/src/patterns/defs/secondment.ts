import type { EditPatternMeta } from './types'
import { isNoCheckReason } from '../detection/helpers'
import { TR } from '../../transferReasonLabels'

export const SECONDMENT_META: Partial<Record<string, EditPatternMeta>> = {
  // 出向（本務）
  secondmentOut: {
    label: '本務出向', addLabel: '本務出向', editLabel: '本務出向',
    badge: 'secondment', group: 'person',
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.SECONDMENT_OUT,
  },
  secondmentIn: {
    label: '本務出向受入', addLabel: '本務出向受入', editLabel: '本務出向受入',
    menuLabel: '出向受入',
    badge: 'secondment', group: 'person',
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.SECONDMENT_IN,
  },
  secondmentOutRelease: {
    label: '本務出向解除', addLabel: '本務出向解除', editLabel: '本務出向解除',
    menuLabel: '出向解除',
    badge: 'negative', group: 'person',
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.SECONDMENT_OUT_RELEASE,
  },
  secondmentInRelease: {
    label: '本務出向受入解除', addLabel: '本務出向受入解除', editLabel: '本務出向受入解除',
    menuLabel: '受入解除',
    badge: 'negative', group: 'person',
    detect: (row, ctx) => {
      const prevEt = (row.prevEmploymentType as string | undefined) ?? ''
      const prevIsSecondmentAcceptance =
        prevEt !== '' &&
        (ctx.masters.employmentTypes.find(e => e.label === prevEt)?.isSecondmentAcceptance ?? false)
      const prevIsMain = !row.prevConcurrentType || row.prevConcurrentType !== '兼務'
      const tr = (row.transferReason as string | undefined) ?? ''
      return prevIsSecondmentAcceptance && prevIsMain && tr === TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE
    },
  },
  // 出向（兼務）
  concurrentSecondmentOutNonSF: {
    label: '兼務出向（SF外）', addLabel: '兼務出向（SF外）', editLabel: '兼務出向（SF外）',
    badge: 'secondment', group: 'person',
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.CONCURRENT_SECONDMENT_OUT,
  },
  concurrentSecondmentIn: {
    label: '兼務出向受入', addLabel: '兼務出向受入', editLabel: '兼務出向受入',
    menuLabel: '兼務受入',
    badge: 'secondment', group: 'person',
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.CONCURRENT_SECONDMENT_IN,
  },
  concurrentSecondmentOutRelease: {
    label: '兼務出向解除', addLabel: '兼務出向解除', editLabel: '兼務出向解除',
    badge: 'negative', group: 'person',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === TR.CONCURRENT_SECONDMENT_OUT_RELEASE
      const prevOut  = row.prevSecondmentToCompany as string | undefined
      const afterOut = row.secondmentToCompany     as string | undefined
      return !!prevOut && !afterOut && row.prevConcurrentType === '兼務' && !row.departmentCode
    },
  },
  concurrentSecondmentInRelease: {
    label: '兼務出向受入解除', addLabel: '兼務出向受入解除', editLabel: '兼務出向受入解除',
    menuLabel: '兼務受入解除',
    badge: 'negative', group: 'person',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === TR.CONCURRENT_SECONDMENT_IN_RELEASE
      const prevIn  = row.prevSecondmentFromCompany as string | undefined
      const afterIn = row.secondmentFromCompany     as string | undefined
      return !!prevIn && !afterIn && row.prevConcurrentType === '兼務' && !row.departmentCode
    },
  },
}
