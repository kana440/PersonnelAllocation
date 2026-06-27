// 本務出向操作 — 出向/受入・解除（SF統合・非統合）
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isRegularEmployee, wasSecondedIn, isMainAssignment, prevWasSecondmentIn, isSFIntegratedCompany, findSecondmentOrgCode, findReturnOrgCode } from '../helpers'
import type { AllMasters } from '../../masters/aggregate'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 本務出向（SF統合先） ──────────────────────────────────────────────────────

export const secondmentOutSFDef: EditOperation = {
  id:                  'SecondmentOutSF',
  label:               '本務出向（SF統合先）',
  group:               'secondmentMain',
  badge:               'secondment',
  supportsLeaveVacant: true,

  operationRole: {
    kind:                'lock',
    isActive:            (row) => row.concurrentType === '出向箱',
    isActiveThisSession: (row) => row.concurrentType === '出向箱' && row.prevConcurrentType !== '出向箱',
  },

  availableFor(row, ms) {
    if (!isRegularEmployee(row, ms)) return unavailable('正社員のみ対象です')
    const isThisSessionSecondedOut = row.concurrentType === '出向箱' && row.prevConcurrentType !== '出向箱'
    if (!isThisSessionSecondedOut && !isMainAssignment(row))
      return unavailable('本務行のみ対象です（兼務行・出向箱には設定できません）')
    if (row.concurrentType === '出向箱' && !isThisSessionSecondedOut)
      return unavailable('すでに出向中のため設定できません')
    return AVAILABLE
  },

  inputs: [
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード', picker: 'org' },
    { field: 'memo',                required: false },
    { kind: 'section', label: '自動設定される項目' },
    { field: 'transferReason',       required: false, readOnly: true, label: '申請区分' },
    { field: 'concurrentType',       required: false, readOnly: true, label: '本務兼務区分' },
    { field: 'officialPositionCode', required: false, readOnly: true, label: '役職' },
    { field: 'localJobTitle',        required: false, readOnly: true, label: 'フリータイトル' },
    { field: 'location',             required: false, readOnly: true, label: '勤務場所' },
  ],

  onOpen: (row, ctx) => ({
    secondmentToCompany:  row.secondmentToCompany as string | undefined,
    departmentCode:       findSecondmentOrgCode(row.departmentCode as string ?? '', ctx.afterOrganizations, ctx.masters),
    memo:                 row.memo as string | undefined,
    transferReason:       TR.SECONDMENT_OUT,
    concurrentType:       '出向箱',
    officialPositionCode: '出向者',
    localJobTitle:        undefined,
    location:             '出向',
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId)                 return fail('人が配属されていない行に本務出向を設定できません')
    if (!isMainAssignment(row))      return fail('本務行のみ対象です')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row      = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub   = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              secondmentToCompany:  values.secondmentToCompany as string,
              departmentCode:       deptCode,
              ...orgSub,
              transferReason:       TR.SECONDMENT_OUT,
              concurrentType:       '出向箱',
              officialPositionCode: '出向者',
              localJobTitle:        undefined,
              location:             '出向',
              memo:                 values.memo as string | undefined,
            }
          : r
      ),
      label: `本務出向: ${personName(row)} → ${values.secondmentToCompany as string}`,
    }
  },
}

// ── 本務出向（SF非統合先） ────────────────────────────────────────────────────

export const secondmentOutNonSFDef: EditOperation = {
  id:                  'SecondmentOutNonSF',
  label:               '本務出向（SF非統合先）',
  group:               'secondmentMain',
  badge:               'secondment',
  supportsLeaveVacant: true,

  operationRole: {
    kind:                'lock',
    isActive:            (row) => row.concurrentType === '出向箱',
    isActiveThisSession: (row) => row.concurrentType === '出向箱' && row.prevConcurrentType !== '出向箱',
  },

  availableFor(row, ms) {
    if (!isRegularEmployee(row, ms)) return unavailable('正社員のみ対象です')
    const isThisSessionSecondedOut = row.concurrentType === '出向箱' && row.prevConcurrentType !== '出向箱'
    if (!isThisSessionSecondedOut && !isMainAssignment(row))
      return unavailable('本務行のみ対象です（兼務行・出向箱には設定できません）')
    if (row.concurrentType === '出向箱' && !isThisSessionSecondedOut)
      return unavailable('すでに出向中のため設定できません')
    return AVAILABLE
  },

  inputs: [
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF非統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード（任意）', picker: 'org' },
    { field: 'memo',                required: false },
    { kind: 'section', label: '自動設定される項目' },
    { field: 'transferReason',       required: false, readOnly: true, label: '申請区分' },
    { field: 'concurrentType',       required: false, readOnly: true, label: '本務兼務区分' },
    { field: 'officialPositionCode', required: false, readOnly: true, label: '役職' },
    { field: 'localJobTitle',        required: false, readOnly: true, label: 'フリータイトル' },
    { field: 'location',             required: false, readOnly: true, label: '勤務場所' },
  ],

  onOpen: (row, ctx) => ({
    secondmentToCompany:  row.secondmentToCompany as string | undefined,
    departmentCode:       findSecondmentOrgCode(row.departmentCode as string ?? '', ctx.afterOrganizations, ctx.masters),
    memo:                 row.memo as string | undefined,
    transferReason:       TR.SECONDMENT_OUT,
    concurrentType:       '出向箱',
    officialPositionCode: '出向者',
    localJobTitle:        undefined,
    location:             '出向',
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)                        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId)                 return fail('人が配属されていない行に本務出向を設定できません')
    if (!isMainAssignment(row))      return fail('本務行のみ対象です')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row      = ctx.allocationList.find(r => r.rowId === rowId)!
    const deptCode = values.departmentCode as string | undefined
    const orgSub   = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              secondmentToCompany:  values.secondmentToCompany as string,
              departmentCode:       deptCode,
              ...orgSub,
              transferReason:       TR.SECONDMENT_OUT,
              concurrentType:       '出向箱',
              officialPositionCode: '出向者',
              localJobTitle:        undefined,
              location:             '出向',
              memo:                 values.memo as string | undefined,
            }
          : r
      ),
      label: `本務出向: ${personName(row)} → ${values.secondmentToCompany as string}`,
    }
  },
}

// ── 本務出向受入 新規（SF統合・SF外共通） ────────────────────────────────────────

export const secondmentInNewDef: EditOperation = {
  id:    'SecondmentInNew',
  label: '本務出向受入 新規',
  group: 'secondmentMain',
  badge: 'secondment',

  availableFor: () => unavailable('組織パネルボタンからのみ起動できます'),

  inputs: [
    { field: 'userId',                       required: false, picker: 'person' },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）',
      options: (ctx) => ctx.masters.employmentTypes.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false,
      options: (ctx) => ctx.masters.jobLevels.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'payGrade',                     required: false,
      options: (ctx) => ctx.masters.payGrades.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'memo',                         required: false },
    { kind: 'section', label: '自動設定される項目' },
    { field: 'transferReason', required: false, readOnly: true, label: '申請区分' },
    { field: 'concurrentType', required: false, readOnly: true, label: '本務兼務区分' },
  ],

  onOpen: (row) => ({
    departmentCode: row.departmentCode,
    transferReason: TR.SECONDMENT_IN,
    concurrentType: '本務',
  }),

  onValidate(_ctx, _rowId, values) {
    if (!values.lastName)              return fail('姓は必須です')
    if (!values.firstName)             return fail('名は必須です')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    if (!values.employmentType)        return fail('雇用タイプは必須です')
    return ok()
  },

  onSubmit(ctx, _rowId, values) {
    const newRowId = nextRowId(ctx.allocationList)
    const orgSub   = values.departmentCode
      ? deriveOrgSubFields(values.departmentCode as string, ctx.masters)
      : {}
    const formVals = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''))
    const name     = [values.lastName, values.firstName].filter(Boolean).join(' ')
    const newRow: AllocationRow = {
      ...orgSub,
      ...formVals,
      rowId:                newRowId,
      positionCode:         `_pos_${newRowId}`,
      departmentCode:       (values.departmentCode as string) || '',
      concurrentType:       '本務',
      transferReason:       TR.SECONDMENT_IN,
      trainingPositionFlag: '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow
    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `本務出向受入（新規）: ${name} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 本務出向解除 共通ヘルパー ─────────────────────────────────────────────────

const outReleaseInputs = [
  { field: 'departmentCode'       as const, required: false, label: '戻り先組織コード', picker: 'org' as const },
  { field: 'officialPositionCode' as const, required: false, label: '役職（出向前の役職に戻す）' },
  { field: 'localJobTitle'        as const, required: false, label: 'フリータイトル（任意）' },
  { field: 'location'             as const, required: false, label: '勤務場所' },
  { field: 'memo'                 as const, required: false },
  { kind: 'section' as const, label: '自動設定される項目' },
  { field: 'transferReason'       as const, required: false, readOnly: true as const, label: '申請区分' },
  { field: 'concurrentType'       as const, required: false, readOnly: true as const, label: '本務兼務区分' },
  { field: 'secondmentToCompany'  as const, required: false, readOnly: true as const, label: '出向先会社（クリア）' },
] as const

const outReleaseOnOpen = (row: AllocationRow, ctx: { allocationList: AllocationRow[] }) => ({
  departmentCode:       findReturnOrgCode(row, ctx.allocationList),
  officialPositionCode: undefined,
  localJobTitle:        undefined,
  location:             undefined,
  memo:                 row.memo as string | undefined,
  transferReason:       TR.SECONDMENT_OUT_RELEASE,
  concurrentType:       '本務',
  secondmentToCompany:  undefined,
})

const outReleaseOnSubmit = (
  ctx: { allocationList: AllocationRow[]; masters: AllMasters },
  rowId: number,
  values: Record<string, unknown>,
) => {
  const row      = ctx.allocationList.find(r => r.rowId === rowId)!
  const deptCode = values.departmentCode as string | undefined
  const orgSub   = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}
  return {
    updatedList: ctx.allocationList.map(r =>
      r.rowId === rowId
        ? {
            ...r,
            departmentCode:       deptCode,
            ...orgSub,
            officialPositionCode: values.officialPositionCode as string | undefined,
            localJobTitle:        values.localJobTitle        as string | undefined,
            location:             values.location             as string | undefined,
            transferReason:       TR.SECONDMENT_OUT_RELEASE,
            concurrentType:       '本務',
            secondmentToCompany:  undefined,
            memo:                 values.memo                 as string | undefined,
          }
        : r
    ),
    label: `本務出向解除: ${personName(row)}`,
  }
}

// ── 本務出向解除（SF導入先） ──────────────────────────────────────────────────

export const secondmentOutReleaseSFDef: EditOperation = {
  id: 'SecondmentOutReleaseSF', label: '本務出向解除（SF導入先）',
  group: 'secondmentMain', badge: 'negative',

  availableFor(row, ms) {
    const wasSecondedPrev = (row.prevConcurrentType as string | undefined) === '出向箱'
      || !!(row.prevSecondmentToCompany as string | undefined)
    if (!wasSecondedPrev) return unavailable('インポート前から出向中の行のみ解除できます')
    if (!isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, ms))
      return unavailable('SF未導入先の出向解除は「SF未導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...outReleaseInputs],
  onOpen: outReleaseOnOpen,

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentToCompany) return fail('出向先が設定されていないため出向解除できません')
    return ok()
  },

  onSubmit: outReleaseOnSubmit,
}

// ── 本務出向解除（SF未導入先） ────────────────────────────────────────────────

export const secondmentOutReleaseNonSFDef: EditOperation = {
  id: 'SecondmentOutReleaseNonSF', label: '本務出向解除（SF未導入先）',
  group: 'secondmentMain', badge: 'negative',

  availableFor(row, ms) {
    const wasSecondedPrev = (row.prevConcurrentType as string | undefined) === '出向箱'
      || !!(row.prevSecondmentToCompany as string | undefined)
    if (!wasSecondedPrev) return unavailable('インポート前から出向中の行のみ解除できます')
    if (isSFIntegratedCompany(row.prevSecondmentToCompany as string | undefined, ms))
      return unavailable('SF導入先の出向解除は「SF導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...outReleaseInputs],
  onOpen: outReleaseOnOpen,

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentToCompany) return fail('出向先が設定されていないため出向解除できません')
    return ok()
  },

  onSubmit: outReleaseOnSubmit,
}

// ── 出向受入解除 共通ヘルパー（本務・兼務共用） ────────────────────────────────

export const inReleaseInputs = [
  { field: 'transferReason' as const, required: true, label: '異動事由', readOnly: true as const },
  { field: 'memo'           as const, required: true, label: 'メモ' },
] as const

export const inReleaseInitial = () => ({
  transferReason: TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE,
})

// ── 本務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const secondmentInReleaseSFDef: EditOperation = {
  id: 'SecondmentInReleaseSF', label: '本務出向受入解除（SF導入先）',
  group: 'secondmentMain', badge: 'negative',

  availableFor(row, ms) {
    if (!wasSecondedIn(row))           return unavailable('出向受入中でないため解除できません')
    if (!prevWasSecondmentIn(row, ms)) return unavailable('インポート前から出向受入でない行は対象外です')
    if (!isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, ms))
      return unavailable('SF未導入先の出向受入解除は「SF未導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentFromCompany) return fail('出向元が設定されていないため出向受入解除できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              transferReason:               values.transferReason,
              secondmentFromCompany:        undefined,
              secondmentFromEmployeeNumber: undefined,
            }
          : r
      ),
      label: `本務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 本務出向受入解除（SF未導入先） ────────────────────────────────────────────

export const secondmentInReleaseNonSFDef: EditOperation = {
  id: 'SecondmentInReleaseNonSF', label: '本務出向受入解除（SF未導入先）',
  group: 'secondmentMain', badge: 'negative',

  availableFor(row, ms) {
    if (!wasSecondedIn(row))           return unavailable('出向受入中でないため解除できません')
    if (!prevWasSecondmentIn(row, ms)) return unavailable('インポート前から出向受入でない行は対象外です')
    if (isSFIntegratedCompany(row.prevSecondmentFromCompany as string | undefined, ms))
      return unavailable('SF導入先の出向受入解除は「SF導入先」操作を使用してください')
    return AVAILABLE
  },

  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.prevSecondmentFromCompany) return fail('出向元が設定されていないため出向受入解除できません')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.map(r =>
        r.rowId === rowId
          ? {
              ...r,
              transferReason:               values.transferReason,
              secondmentFromCompany:        undefined,
              secondmentFromEmployeeNumber: undefined,
            }
          : r
      ),
      label: `本務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 本務出向受入取消（セッション内追加分） ────────────────────────────────────

export const secondmentInCancelDef: EditOperation = {
  id: 'SecondmentInCancel', label: '本務出向受入取消',
  group: 'secondmentMain', badge: 'negative',
  description: 'このセッションで追加した出向受入を取消します。下記の情報が削除されます。',
  suppressSideEffectWarning: true,

  availableFor(row) {
    if (!isMainAssignment(row))        return unavailable('本務行のみ対象です（兼務行には設定できません）')
    if (!row.secondmentFromCompany)    return unavailable('出向受入が設定されていません')
    if (row.prevSecondmentFromCompany) return unavailable('インポート前からの出向受入は取消できません（出向受入解除を使用してください）')
    if ((row.transferReason as string | undefined) === TR.SECONDMENT_OUT)
      return unavailable('SF外出向ペアの受入行です。「SF外出向取り消し」操作を使用してください')
    return AVAILABLE
  },

  inputs: [
    { field: 'lastName',                     required: false, readOnly: true },
    { field: 'firstName',                    required: false, readOnly: true },
    { field: 'secondmentFromCompany',        required: false, readOnly: true, label: '出向元会社' },
    { field: 'secondmentFromEmployeeNumber', required: false, readOnly: true, label: '出向元社員番号' },
    { field: 'departmentCode',               required: false, readOnly: true, label: '受入先組織コード' },
    { field: 'employmentType',               required: false, readOnly: true },
  ],

  onOpen: (row) => ({
    lastName:                     row.lastName,
    firstName:                    row.firstName,
    secondmentFromCompany:        row.secondmentFromCompany,
    secondmentFromEmployeeNumber: row.secondmentFromEmployeeNumber,
    departmentCode:               row.departmentCode,
    employmentType:               row.employmentType,
  }),

  onValidate(ctx, rowId) {
    if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },

  onSubmit(ctx, rowId) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `本務出向受入取消: ${personName(row)}` }
  },
}

export const DEFS: EditOperation[] = [
  secondmentOutSFDef,        secondmentOutNonSFDef,
  secondmentInNewDef,
  secondmentOutReleaseSFDef, secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,  secondmentInReleaseNonSFDef,
  secondmentInCancelDef,
]
