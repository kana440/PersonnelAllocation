import type { EditPatternMeta } from './types'
import { isNoCheckReason } from '../detection/helpers'
import { C_GREEN, C_RED, C_GRAY } from './_shared'

export const PERSON_META: Partial<Record<string, EditPatternMeta>> = {
  leaveOfAbsence: {
    label: '休職', addLabel: '休職', editLabel: '休職',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!row.userId && !row.leaveOfAbsenceSign,
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      if (tr === '【個別対応】4/1付休職・復職') return !!(row.leaveOfAbsenceSign as string | undefined)
      return false
    },
  },
  returnFromLeave: {
    label: '復職', addLabel: '復職', editLabel: '復職',
    badgeColor: C_GREEN, group: 'person',
    availableFor: (row) => !!row.leaveOfAbsenceSign,
    detect: (row, _ctx) => {
      const tr = row.transferReason as string | undefined
      if (tr === '【個別対応】4/1付休職・復職') return !(row.leaveOfAbsenceSign as string | undefined)
      return false
    },
  },
  employmentTransferOut: {
    label: '移籍（出る）', addLabel: '移籍（出る）', editLabel: '移籍（出る）',
    menuLabel: '移籍（出）',
    badgeColor: C_RED, group: 'person',
    availableFor: (row) => !!row.userId,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '移籍（出る）'
      const prevEt  = (row.prevEmploymentType as string | undefined) ?? ''
      const afterEt = (row.employmentType     as string | undefined) ?? ''
      return !!prevEt && !afterEt
    },
  },
  employmentTransferIn: {
    label: '移籍（入る）', addLabel: '移籍（入る）', editLabel: '移籍（入る）',
    menuLabel: '移籍（入）',
    badgeColor: C_GREEN, group: 'person',
    availableFor: (row) => !row.prevDepartmentCode,
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '移籍（入る）'
      const isNewHire = !row.prevDepartmentCode && !!row.userId
      const prevEt    = (row.prevEmploymentType as string | undefined) ?? ''
      const afterEt   = (row.employmentType     as string | undefined) ?? ''
      return !prevEt && !!afterEt && isNewHire
    },
  },
  newHire: {
    label: '新規採用', addLabel: '新規採用', editLabel: '新規採用',
    badgeColor: C_GREEN, group: 'person',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '新規採用'
      return !row.prevDepartmentCode && !!row.userId
    },
  },
  termination: {
    label: '退職', addLabel: '退職', editLabel: '退職',
    badgeColor: C_RED, group: 'person',
    detect: (row, ctx) => {
      if (isNoCheckReason(row, ctx)) return (row.transferReason as string | undefined) === '退職'
      return !!(row.prevDepartmentCode && !row.userId && !row.departmentCode)
    },
  },
  noChange: {
    label: '変更なし', addLabel: '変更なし', editLabel: '変更なし',
    badgeColor: C_GRAY, group: 'person',
    // detect は detection/index.ts の後処理で制御するため常に false を返す
    detect: () => false,
  },
}
