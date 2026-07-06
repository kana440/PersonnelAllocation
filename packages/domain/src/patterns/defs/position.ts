import type { EditPatternMeta } from './types'
import { isNoCheckReason } from '../detection/helpers'
import { TR } from '../../transferReasonLabels'

export const POSITION_META: Partial<Record<string, EditPatternMeta>> = {
  orgTransfer: {
    label: '異動', addLabel: '異動', editLabel: '異動',
    chipLabel: '異動',
    description: '所属組織コードが変化し、組改マッピング（sameOrgPairs）で別組織と判定される実質的な異動。',
    menuLabel: '異動',
    badge: 'transfer', group: 'position', defaultVisible: true,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === TR.ORG_TRANSFER
      const prevCode  = row.prevDepartmentCode as string | undefined
      const afterCode = row.departmentCode     as string | undefined
      if (!prevCode || !afterCode || prevCode === afterCode) return false
      return !ctx.sameOrgPairs?.has(`${prevCode}|${afterCode}`)
    },
  },
  orgRestructure: {
    label: '異動（改組）', addLabel: '異動（改組）', editLabel: '異動（改組）',
    chipLabel: '改組',
    description: '所属組織コードが変化したが、組改マッピングで同一組織と判定（コード変更のみの組織改編）。',
    menuLabel: '異動（改組）',
    badge: 'transfer', group: 'position', defaultVisible: true,
    detect: (row, ctx) => {
      const prevCode  = row.prevDepartmentCode as string | undefined
      const afterCode = row.departmentCode     as string | undefined
      if (!prevCode || !afterCode || prevCode === afterCode) return false
      return !!ctx.sameOrgPairs?.has(`${prevCode}|${afterCode}`)
    },
  },
  positionChange: {
    label: 'Pos変更', addLabel: 'Pos変更', editLabel: 'Pos変更',
    chipLabel: 'Pos変',
    description: 'ポジションコード（positionCode）が変化。',
    badge: 'transfer', group: 'position', defaultVisible: false,
    detect: (row, _ctx) => {
      const prev  = row.prevPositionCode as string | undefined
      const after = row.positionCode     as string | undefined
      return !!prev && !!after && prev !== after
    },
  },
  managerChange: {
    label: '上司Pos変更', addLabel: '上司Pos変更', editLabel: '上司Pos変更',
    chipLabel: '上司Pos変',
    description: '上司ポジションコード（managerPositionCode）が変化。noCheckRequired 行は「上司Pos変更」事由で判定。',
    badge: 'transfer', group: 'position', defaultVisible: false,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === TR.MANAGER_CHANGE
      const prev  = row.prevManagerPositionCode as string | undefined
      const after = row.managerPositionCode     as string | undefined
      return !!prev && !!after && prev !== after
    },
  },
  newPosition: {
    label: '新規Pos', addLabel: '新規Pos', editLabel: '新規Pos',
    chipLabel: '新Pos',
    description: '異動事由が「新規ポジション」。',
    badge: 'transfer', group: 'position', defaultVisible: true,
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.NEW_POSITION,
  },
  concurrentAdd: {
    label: '社内兼務追加', addLabel: '社内兼務追加', editLabel: '社内兼務追加',
    chipLabel: '兼追',
    description: '異動事由が「社内兼務」。兼務行（concurrentType=兼務）として追加。',
    menuLabel: '兼務追加',
    badge: 'concurrent', group: 'position', defaultVisible: true,
    detect: (row, _ctx) => (row.transferReason as string | undefined) === TR.CONCURRENT,
  },
  concurrentRelease: {
    label: '社内兼務解除', addLabel: '社内兼務解除', editLabel: '社内兼務解除',
    chipLabel: '兼解',
    description: '共有解除事由（CONCURRENT_OR_SECONDMENT_IN_RELEASE）で、出向受入型でない兼務区分（prevConcurrentType=兼務）の行が解除。',
    menuLabel: '兼務解除',
    badge: 'negative', group: 'position', defaultVisible: true,
    detect: (row, ctx) => {
      if ((row.transferReason as string | undefined) !== TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE) return false
      const prevEt = row.prevEmploymentType as string | undefined
      const isSecAcc = prevEt
        ? (ctx.masters.employmentTypes.find(e => e.label === prevEt)?.isSecondmentAcceptance ?? false)
        : false
      return !isSecAcc && (row.prevConcurrentType as string | undefined) === '兼務'
    },
  },
}
