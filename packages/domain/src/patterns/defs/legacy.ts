import type { EditPatternMeta } from './types'
import { isNoCheckReason } from '../detection/helpers'
import { C_BLUE, C_RED, isOutsource } from './_shared'

export const LEGACY_META: Partial<Record<string, EditPatternMeta>> = {
  // 退職・退任（transferReason 文字列による後方互換検知）
  resignation: {
    label: '退職', addLabel: '退職', editLabel: '退職',
    badgeColor: C_RED, group: 'legacy',
    availableFor: (row, cl) => !isOutsource(row, cl),
    detect: (row, _ctx) => {
      // noCheck かどうかに関わらず transferReason 文字列に依存する後方互換パターン
      const tr = (row.transferReason as string | undefined) ?? ''
      return tr.includes('退職') || tr.includes('退任')
    },
  },
  // 席移動（ポジションコードが変わったが組織異動ではない場合）
  vacantPositionMove: {
    label: 'ポジション異動', addLabel: 'ポジション異動', editLabel: 'ポジション異動',
    menuLabel: '席異動',
    badgeColor: C_BLUE, group: 'legacy',
    availableFor: (row, cl) => !isOutsource(row, cl),
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return false
      const posCodeChanged =
        (row.positionCode ?? '') !== '' &&
        (row.positionCode ?? '') !== (row.prevPositionCode ?? '')
      if (!posCodeChanged) return false
      // orgTransfer が火を噴く条件と同じものを確認し、噴かない場合のみ vacantPositionMove
      const prevCode      = row.prevDepartmentCode ?? ''
      const afterCode     = row.departmentCode     ?? ''
      const deptChanged   = prevCode !== afterCode
      const isSameOrgPair = deptChanged && (ctx.sameOrgPairs?.has(`${prevCode}|${afterCode}`) ?? false)
      const isTransfer    = deptChanged && !isSameOrgPair
      return !isTransfer
    },
  },
}
