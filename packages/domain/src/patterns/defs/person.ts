import type { EditPatternMeta } from './types'
import { TR } from '../../transferReasonLabels'

const tr = (key: typeof TR[keyof typeof TR]): EditPatternMeta['detect'] =>
  (row, _ctx) => (row.transferReason as string | undefined) === key

export const PERSON_META: Partial<Record<string, EditPatternMeta>> = {
  leaveOfAbsence: {
    label: '4/1休職', addLabel: '4/1休職', editLabel: '4/1休職',
    chipLabel: '4/1休職',
    description: '異動事由が「休職・復職」かつ休職フラグ（leaveOfAbsenceSign）が設定されている。',
    badge: 'negative', group: 'person', defaultVisible: true,
    detect: (row, _ctx) => {
      if ((row.transferReason as string | undefined) !== TR.LEAVE_AND_RETURN) return false
      return !!(row.leaveOfAbsenceSign as string | undefined)
    },
  },
  returnFromLeave: {
    label: '4/1復職', addLabel: '4/1復職', editLabel: '4/1復職',
    chipLabel: '4/1復職',
    description: '異動事由が「休職・復職」かつ休職フラグ（leaveOfAbsenceSign）が未設定。',
    badge: 'positive', group: 'person', defaultVisible: true,
    detect: (row, _ctx) => {
      if ((row.transferReason as string | undefined) !== TR.LEAVE_AND_RETURN) return false
      return !(row.leaveOfAbsenceSign as string | undefined)
    },
  },
  executiveAppointment: {
    label: '役員就任', addLabel: '役員就任', editLabel: '役員就任',
    chipLabel: '役員就任',
    description: '異動事由が「役員就任」。',
    badge: 'positive', group: 'person', defaultVisible: true,
    detect: tr(TR.EXECUTIVE_APPOINTMENT),
  },
  employmentTransfer: {
    label: '4/1移籍', addLabel: '4/1移籍', editLabel: '4/1移籍',
    chipLabel: '4/1移籍',
    description: '異動事由が「移籍」。',
    menuLabel: '4/1移籍',
    badge: 'negative', group: 'person', defaultVisible: true,
    detect: tr(TR.TRANSFER),
  },
  termination: {
    label: '4/1退職', addLabel: '4/1退職', editLabel: '4/1退職',
    chipLabel: '4/1退職',
    description: '異動事由が「退職」。',
    badge: 'negative', group: 'person', defaultVisible: true,
    detect: tr(TR.TERMINATION),
  },
  noChange: {
    label: '変更なし', addLabel: '変更なし', editLabel: '変更なし',
    chipLabel: '変更なし',
    description: '異動事由が「変更なし」。',
    badge: 'neutral', group: 'person', defaultVisible: false,
    detect: tr(TR.NO_CHANGE),
  },
}
