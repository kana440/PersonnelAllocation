import type { AllocationRow } from '../../allocationRow'
import type { EditPatternMeta } from './types'
import type { DetectContext } from '../detection/helpers'
import { TR } from '../../transferReasonLabels'

// ── 共有 TR の分岐ヘルパー ────────────────────────────────────────────────────
// TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE は 3 パターンで共有される。
// prevEmploymentType.isSecondmentAcceptance と prevConcurrentType で一意に決まる。

function prevIsSecondmentAcceptance(row: AllocationRow, ctx: DetectContext): boolean {
  const prevEt = row.prevEmploymentType as string | undefined
  if (!prevEt) return false
  return ctx.masters.employmentTypes.find(e => e.label === prevEt)?.isSecondmentAcceptance ?? false
}

const tr = (key: typeof TR[keyof typeof TR]): EditPatternMeta['detect'] =>
  (row, _ctx) => (row.transferReason as string | undefined) === key

export const SECONDMENT_META: Partial<Record<string, EditPatternMeta>> = {
  // ── 本務出向 ────────────────────────────────────────────────────────────────
  secondmentOut: {
    label: '本務出向', addLabel: '本務出向', editLabel: '本務出向',
    chipLabel: '本務出向',
    description: '異動事由が「本務出向」。',
    badge: 'secondment', group: 'person',
    detect: tr(TR.SECONDMENT_OUT),
  },
  secondmentIn: {
    label: '本務出向受入', addLabel: '本務出向受入', editLabel: '本務出向受入',
    chipLabel: '本務出向受',
    description: '異動事由が「本務出向受入」。',
    menuLabel: '本務出向受入',
    badge: 'secondment', group: 'person',
    detect: tr(TR.SECONDMENT_IN),
  },
  secondmentOutRelease: {
    label: '本務出向解除', addLabel: '本務出向解除', editLabel: '本務出向解除',
    chipLabel: '本務出向解',
    description: '異動事由が「本務出向解除」。',
    menuLabel: '本務出向解除',
    badge: 'negative', group: 'person',
    detect: tr(TR.SECONDMENT_OUT_RELEASE),
  },
  secondmentInRelease: {
    label: '本務出向受入解除', addLabel: '本務出向受入解除', editLabel: '本務出向受入解除',
    chipLabel: '本務受入解',
    description: '共有解除事由で、isSecondmentAcceptance=true の雇用タイプかつ prevConcurrentType=本務 の行が解除。',
    menuLabel: '本務出向受入解除',
    badge: 'negative', group: 'person',
    detect: (row, ctx) => {
      if ((row.transferReason as string | undefined) !== TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE) return false
      return prevIsSecondmentAcceptance(row, ctx) &&
        (row.prevConcurrentType as string | undefined) === '本務'
    },
  },

  // ── 兼務出向 ────────────────────────────────────────────────────────────────
  concurrentSecondmentOutNonSF: {
    label: '兼務出向（SF外）', addLabel: '兼務出向（SF外）', editLabel: '兼務出向（SF外）',
    chipLabel: '兼務出向SF外',
    description: '異動事由が「兼務出向」。SF外（非SF登録）の出向先へ兼務行として登録。',
    badge: 'secondment', group: 'person',
    detect: tr(TR.CONCURRENT_SECONDMENT_OUT),
  },
  concurrentSecondmentIn: {
    label: '兼務出向受入', addLabel: '兼務出向受入', editLabel: '兼務出向受入',
    chipLabel: '兼務出向受',
    description: '異動事由が「兼務出向受入」。',
    menuLabel: '兼務受入',
    badge: 'secondment', group: 'person',
    detect: tr(TR.CONCURRENT_SECONDMENT_IN),
  },
  concurrentSecondmentOutRelease: {
    label: '兼務出向解除', addLabel: '兼務出向解除', editLabel: '兼務出向解除',
    chipLabel: '兼務出向解',
    description: '異動事由が「兼務出向解除」。',
    badge: 'negative', group: 'person',
    detect: tr(TR.CONCURRENT_SECONDMENT_OUT_RELEASE),
  },
  concurrentSecondmentInRelease: {
    label: '兼務出向受入解除', addLabel: '兼務出向受入解除', editLabel: '兼務出向受入解除',
    chipLabel: '兼務受入解',
    description: '専用解除事由または共有解除事由で、isSecondmentAcceptance=true の雇用タイプかつ prevConcurrentType=兼務 の行が解除。',
    menuLabel: '兼務受入解除',
    badge: 'negative', group: 'person',
    detect: (row, ctx) => {
      const trVal = row.transferReason as string | undefined
      // 専用 TR
      if (trVal === TR.CONCURRENT_SECONDMENT_IN_RELEASE) return true
      // 共有 TR からの分岐（isSecondmentAcceptance=true かつ prevConcurrentType='兼務'）
      if (trVal !== TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE) return false
      return prevIsSecondmentAcceptance(row, ctx) &&
        (row.prevConcurrentType as string | undefined) === '兼務'
    },
  },
}
