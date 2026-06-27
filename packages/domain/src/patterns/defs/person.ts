import type { EditPatternMeta } from './types'
import { TR } from '../../transferReasonLabels'

const tr = (key: typeof TR[keyof typeof TR]): EditPatternMeta['detect'] =>
  (row, _ctx) => (row.transferReason as string | undefined) === key

export const PERSON_META: Partial<Record<string, EditPatternMeta>> = {
  leaveOfAbsence: {
    label: '休職', addLabel: '休職', editLabel: '休職',
    badge: 'negative', group: 'person',
    detect: (row, _ctx) => {
      if ((row.transferReason as string | undefined) !== TR.LEAVE_AND_RETURN) return false
      return !!(row.leaveOfAbsenceSign as string | undefined)
    },
  },
  returnFromLeave: {
    label: '復職', addLabel: '復職', editLabel: '復職',
    badge: 'positive', group: 'person',
    detect: (row, _ctx) => {
      if ((row.transferReason as string | undefined) !== TR.LEAVE_AND_RETURN) return false
      return !(row.leaveOfAbsenceSign as string | undefined)
    },
  },
  executiveAppointment: {
    label: '役員就任', addLabel: '役員就任', editLabel: '役員就任',
    badge: 'positive', group: 'person',
    detect: tr(TR.EXECUTIVE_APPOINTMENT),
  },
  employmentTransfer: {
    label: '移籍', addLabel: '移籍', editLabel: '移籍',
    menuLabel: '移籍',
    badge: 'negative', group: 'person',
    detect: tr(TR.TRANSFER),
  },
  termination: {
    label: '退職', addLabel: '退職', editLabel: '退職',
    badge: 'negative', group: 'person',
    detect: tr(TR.TERMINATION),
  },
  noChange: {
    label: '変更なし', addLabel: '変更なし', editLabel: '変更なし',
    badge: 'neutral', group: 'person',
    detect: tr(TR.NO_CHANGE),
  },
}
