import type { EditPatternMeta } from './types'
import { TR } from '../../transferReasonLabels'
import { C_GREEN, C_RED, C_GRAY } from './_shared'

export const PERSON_META: Partial<Record<string, EditPatternMeta>> = {
  leaveOfAbsence: {
    label: '休職', addLabel: '休職', editLabel: '休職',
    badgeColor: C_RED, group: 'person',
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      if (tr === TR.LEAVE_AND_RETURN) return !!(row.leaveOfAbsenceSign as string | undefined)
      return false
    },
  },
  returnFromLeave: {
    label: '復職', addLabel: '復職', editLabel: '復職',
    badgeColor: C_GREEN, group: 'person',
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      if (tr === TR.LEAVE_AND_RETURN) return !(row.leaveOfAbsenceSign as string | undefined)
      return false
    },
  },
  employmentTransfer: {
    label: '移籍', addLabel: '移籍', editLabel: '移籍',
    menuLabel: '移籍',
    badgeColor: C_RED, group: 'person',
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      if (tr === TR.TRANSFER) return !(row.leaveOfAbsenceSign as string | undefined)
      return false
    },
  },
  termination: {
    label: '退職', addLabel: '退職', editLabel: '退職',
    badgeColor: C_RED, group: 'person',
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      if (tr === TR.TERMINATION) return !(row.leaveOfAbsenceSign as string | undefined)
      return false
    },
  },
  noChange: {
    label: '変更なし', addLabel: '変更なし', editLabel: '変更なし',
    badgeColor: C_GRAY, group: 'person',
    // detect は detection/index.ts の後処理で制御するため常に false を返す
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      if (tr === TR.NO_CHANGE) return !(row.leaveOfAbsenceSign as string | undefined)
      return false
    },
  },
}
