// 出向操作 — 本務出向/受入・兼務出向/受入・それぞれの解除（SF統合・非統合）
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { afterKeysByBinding, nextRowId } from '../../allocationRow'
import { deriveOrgSubFields } from '../orgHelpers'
import { isRegularEmployee, wasSecondedOut, wasSecondedIn, isMainAssignment, prevWasSecondmentIn, isSFIntegratedCompany, findSecondmentOrgCode, findReturnOrgCode } from '../helpers'
import type { AllMasters } from '../../masters/aggregate'
import { TR } from '../../transferReasonLabels'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 本務出向（SF統合先） ──────────────────────────────────────────────────────

export const secondmentOutSFDef: EditOperation = {
  id:                  'SecondmentOutSF',
  label:               '本務出向（SF統合先）',
  group:               'person',
  badge:               'secondment',
  supportsLeaveVacant: true,

  operationRole: {
    kind:                'lock',
    isActive:            (row) => row.concurrentType === '出向箱',
    isActiveThisSession: (row) => row.concurrentType === '出向箱' && row.prevConcurrentType !== '出向箱',
  },

  availableFor(row, ms) {
    if (!isRegularEmployee(row, ms)) return unavailable('正社員のみ対象です')
    // このセッションで設定した出向箱は再編集可（セッション内 lock の再実行）
    const isThisSessionSecondedOut = row.concurrentType === '出向箱' && row.prevConcurrentType !== '出向箱'
    if (!isThisSessionSecondedOut && !isMainAssignment(row))
      return unavailable('本務行のみ対象です（兼務行・出向箱には設定できません）')
    if (wasSecondedOut(row) && !isThisSessionSecondedOut)
      return unavailable('すでに出向中のため設定できません')
    return AVAILABLE
  },

  inputs: [
    // ── ユーザー入力 ───────────────────────────────────────────
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード', picker: 'org' },
    { field: 'memo',                required: false },
    // ── 自動設定（readOnly プレビュー）──────────────────────────
    { kind: 'section', label: '自動設定される項目' },
    { field: 'transferReason',       required: false, readOnly: true, label: '申請区分' },
    { field: 'concurrentType',       required: false, readOnly: true, label: '本務兼務区分' },
    { field: 'officialPositionCode', required: false, readOnly: true, label: '役職' },
    { field: 'localJobTitle',        required: false, readOnly: true, label: 'フリータイトル' },
    { field: 'location',             required: false, readOnly: true, label: '勤務場所' },
  ],

  onOpen: (row, ctx) => ({
    secondmentToCompany:  row.secondmentToCompany as string | undefined,
    departmentCode:       findSecondmentOrgCode(
      row.departmentCode as string ?? '',
      ctx.afterOrganizations,
      ctx.masters,
    ),
    memo:                 row.memo as string | undefined,
    // 自動セットプレビュー
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
  group:               'person',
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
    if (wasSecondedOut(row) && !isThisSessionSecondedOut)
      return unavailable('すでに出向中のため設定できません')
    return AVAILABLE
  },

  inputs: [
    // ── ユーザー入力 ───────────────────────────────────────────
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF非統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード（任意）', picker: 'org' },
    { field: 'memo',                required: false },
    // ── 自動設定（readOnly プレビュー）──────────────────────────
    { kind: 'section', label: '自動設定される項目' },
    { field: 'transferReason',       required: false, readOnly: true, label: '申請区分' },
    { field: 'concurrentType',       required: false, readOnly: true, label: '本務兼務区分' },
    { field: 'officialPositionCode', required: false, readOnly: true, label: '役職' },
    { field: 'localJobTitle',        required: false, readOnly: true, label: 'フリータイトル' },
    { field: 'location',             required: false, readOnly: true, label: '勤務場所' },
  ],

  onOpen: (row, ctx) => ({
    secondmentToCompany:  row.secondmentToCompany as string | undefined,
    departmentCode:       findSecondmentOrgCode(
      row.departmentCode as string ?? '',
      ctx.afterOrganizations,
      ctx.masters,
    ),
    memo:                 row.memo as string | undefined,
    // 自動セットプレビュー
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


// ── 本務出向受入 新規（SF統合・SF外共通：組織ボタンから） ────────────────────────
// SF統合先・SF外問わず受入側の入力は同一。出向元の管理は出向元のシステムが担う。

export const secondmentInNewDef: EditOperation = {
  id:         'SecondmentInNew',
  label:      '本務出向受入 新規',
  group:      'person',
  badge: 'secondment',

  availableFor: () => unavailable('組織パネルボタンからのみ起動できます'),

  inputs: [
    // ── 人物情報 ────────────────────────────────────────────────
    { field: 'userId',                       required: false, picker: 'person' },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    // ── 出向元情報 ──────────────────────────────────────────────
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    // ── 受入先情報 ──────────────────────────────────────────────
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）',
      options: (ctx) => ctx.masters.employmentTypes.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    // ── 職務情報 ────────────────────────────────────────────────
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false,
      options: (ctx) => ctx.masters.jobLevels.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'payGrade',                     required: false,
      options: (ctx) => ctx.masters.payGrades.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'memo',                         required: false },
    // ── 自動設定（readOnly プレビュー）──────────────────────────
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

// ── 兼務出向受入 新規（SF統合・SF外共通：組織ボタンから） ────────────────────────
// SF統合先・SF外問わず受入側の入力は同一。出向元の管理は出向元のシステムが担う。

export const concurrentSecondmentInNewDef: EditOperation = {
  id:         'ConcurrentSecondmentInNew',
  label:      '兼務出向受入 新規',
  group:      'person',
  badge: 'secondment',

  availableFor: () => unavailable('組織パネルボタンからのみ起動できます'),

  inputs: [
    // ── 人物情報 ────────────────────────────────────────────────
    { field: 'userId',                       required: false, picker: 'person' },
    { field: 'groupEmployeeId',              required: false },
    { field: 'employeeNumber',               required: false },
    { field: 'lastName',                     required: true  },
    { field: 'firstName',                    required: true  },
    // ── 出向元情報 ──────────────────────────────────────────────
    { field: 'secondmentFromCompany',        required: true,  label: '出向元会社' },
    { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
    // ── 受入先情報 ──────────────────────────────────────────────
    { field: 'departmentCode',               required: true,  label: '受入先組織コード', picker: 'org' },
    { field: 'employmentType',               required: true,  label: '雇用タイプ（出向受入）',
      options: (ctx) => ctx.masters.employmentTypes.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'concurrentReason',             required: true  },
    // ── 職務情報 ────────────────────────────────────────────────
    { field: 'positionBand',                 required: false },
    { field: 'band',                         required: false,
      options: (ctx) => ctx.masters.jobLevels.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'payGrade',                     required: false,
      options: (ctx) => ctx.masters.payGrades.filter(e => e.isSecondmentAcceptance).map(e => e.label) },
    { field: 'memo',                         required: false },
    // ── 自動設定（readOnly プレビュー）──────────────────────────
    { kind: 'section', label: '自動設定される項目' },
    { field: 'transferReason', required: false, readOnly: true, label: '申請区分' },
    { field: 'concurrentType', required: false, readOnly: true, label: '本務兼務区分' },
  ],

  onOpen: (row) => ({
    departmentCode: row.departmentCode,
    transferReason: TR.CONCURRENT_SECONDMENT_IN,
    concurrentType: '兼務',
  }),

  onValidate(_ctx, _rowId, values) {
    if (!values.lastName)              return fail('姓は必須です')
    if (!values.firstName)             return fail('名は必須です')
    if (!values.secondmentFromCompany) return fail('出向元会社は必須です')
    if (!values.departmentCode)        return fail('受入先組織コードは必須です')
    if (!values.employmentType)        return fail('雇用タイプは必須です')
    if (!values.concurrentReason)      return fail('兼務理由は必須です')
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
      concurrentType:       '兼務',
      transferReason:       TR.CONCURRENT_SECONDMENT_IN,
      trainingPositionFlag: '0',
      userId:               (values.userId as string | undefined) || undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向受入（新規）: ${name} ← ${values.secondmentFromCompany as string ?? ''}`,
    }
  },
}

// ── 兼務出向（SF非統合先のみ） ────────────────────────────────────────────────
// SF統合先への兼務出向はSFが管理するためツール操作不要。SF外のみ対応。

export const concurrentSecondmentOutNonSFDef: EditOperation = {
  id:         'ConcurrentSecondmentOutNonSF',
  label:      '兼務出向（SF非統合先）',
  group:      'person',
  badge: 'secondment',

  availableFor(row, ms) {
    if (!isRegularEmployee(row, ms)) return unavailable('正社員のみ対象です')
    if (!isMainAssignment(row))      return unavailable('本務行のみ対象です（兼務行には設定できません）')
    return AVAILABLE
  },

  inputs: [
    { field: 'transferReason',      required: false },
    { field: 'secondmentToCompany', required: true,  label: '出向先会社（SF非統合）' },
    { field: 'departmentCode',      required: false, label: '出向先組織コード（任意）' },
    { field: 'concurrentReason',    required: false },
    { field: 'memo',                required: false },
  ],

  onOpen: (row) => ({
    transferReason: row.transferReason as string | undefined,
    memo:           row.memo           as string | undefined,
  }),

  onValidate(ctx, rowId, values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row)        return fail(`行が見つかりません (rowId: ${rowId})`)
    if (!row.userId) return fail('人が配属されていない行に兼務出向を追加できません')
    if (row.concurrentType === '兼務') return fail('兼務行には兼務出向を追加できません')
    if (!values.secondmentToCompany) return fail('出向先会社は必須です')
    return ok()
  },

  onSubmit(ctx, rowId, values) {
    const src = ctx.allocationList.find(r => r.rowId === rowId)!
    const newRowId = nextRowId(ctx.allocationList)
    const posClears   = Object.fromEntries(afterKeysByBinding('position').map(k => [k, undefined]))
    const deptCode = (values.departmentCode as string | undefined) ?? ''
    const orgSub = deptCode ? deriveOrgSubFields(deptCode, ctx.masters) : {}

    const newRow: AllocationRow = {
      ...src,
      ...posClears,
      ...orgSub,
      rowId:                   newRowId,
      positionCode:            `_pos_${newRowId}`,
      departmentCode:          deptCode,
      concurrentType:          '兼務',
      concurrentReason:        values.concurrentReason as string | undefined,
      secondmentToCompany:     values.secondmentToCompany as string,
      memo:                    values.memo as string | undefined,
      prevDepartmentCode:      undefined,
      prevPositionCode:        undefined,
      prevConcurrentType:      undefined,
      prevSecondmentToCompany: undefined,
    } as AllocationRow

    return {
      updatedList: [...ctx.allocationList, newRow],
      label: `兼務出向追加: ${personName(src)} → ${values.secondmentToCompany as string}`,
    }
  },
}


// ── 共通ヘルパー: 本務出向解除の inputs / onOpen / onSubmit ─────────────────

const outReleaseInputs = [
  // ── ユーザー入力（出向時に上書きされたため再入力が必要）──────────────────
  { field: 'departmentCode'      as const, required: false, label: '戻り先組織コード', picker: 'org' as const },
  { field: 'officialPositionCode' as const, required: false, label: '役職（出向前の役職に戻す）' },
  { field: 'localJobTitle'       as const, required: false, label: 'フリータイトル（任意）' },
  { field: 'location'            as const, required: false, label: '勤務場所' },
  { field: 'memo'                as const, required: false },
  // ── 自動設定（readOnly プレビュー）────────────────────────────────────────
  { kind: 'section' as const, label: '自動設定される項目' },
  { field: 'transferReason'      as const, required: false, readOnly: true as const, label: '申請区分' },
  { field: 'concurrentType'      as const, required: false, readOnly: true as const, label: '本務兼務区分' },
  { field: 'secondmentToCompany' as const, required: false, readOnly: true as const, label: '出向先会社（クリア）' },
] as const

const outReleaseOnOpen = (row: AllocationRow, ctx: { allocationList: AllocationRow[] }) => ({
  // 上司が動いていなければ戻り先を自動提案、それ以外は空欄で手入力
  departmentCode:       findReturnOrgCode(row, ctx.allocationList),
  // 役職・勤務場所は prev が出向状態（出向者/出向）の可能性が高いため空欄で手入力
  officialPositionCode: undefined,
  localJobTitle:        undefined,
  location:             undefined,
  memo:                 row.memo as string | undefined,
  // 自動セットプレビュー
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

// ── 本務出向解除（SF導入先）──────────────────────────────────────────────────

export const secondmentOutReleaseSFDef: EditOperation = {
  id: 'SecondmentOutReleaseSF', label: '本務出向解除（SF導入先）',
  group: 'person', badge: 'negative',

  availableFor(row, ms) {
    // prev 状態で出向中かチェック（当セッションで設定した分は Undo/取消で対応）
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
  group: 'person', badge: 'negative',

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

// ── 共通: 出向受入解除 inputs / validate / apply ─────────────────────────────

const inReleaseInputs = [
  { field: 'transferReason' as const, required: true, label: '異動事由', readOnly: true as const },
  { field: 'memo'           as const, required: true, label: 'メモ' },
] as const

const inReleaseInitial = () => ({
  transferReason: TR.CONCURRENT_OR_SECONDMENT_IN_RELEASE,
})

// ── 本務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const secondmentInReleaseSFDef: EditOperation = {
  id: 'SecondmentInReleaseSF', label: '本務出向受入解除（SF導入先）',
  group: 'person', badge: 'negative',
  availableFor(row, ms) {
    if (!wasSecondedIn(row))          return unavailable('出向受入中でないため解除できません')
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
    if (!row.prevSecondmentFromCompany)
      return fail('出向元が設定されていないため出向受入解除できません')
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
  group: 'person', badge: 'negative',
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
    if (!row.prevSecondmentFromCompany)
      return fail('出向元が設定されていないため出向受入解除できません')
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

// ── 兼務出向解除（SF導入先） ──────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseSFDef: EditOperation = {
  id: 'ConcurrentSecondmentOutReleaseSF', label: '兼務出向解除（SF導入先）',
  group: 'person', badge: 'negative',
  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentToCompany)      return unavailable('出向先が設定されていない兼務行は対象外です')
    if (!isSFIntegratedCompany(row.secondmentToCompany as string | undefined, ms))
                                       return unavailable('SF未導入先の兼務出向解除は「SF未導入先」操作を使用してください')
    return AVAILABLE
  },
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
      return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向解除: ${personName(row)}`,
    }
  },
}

// ── 兼務出向解除（SF未導入先） ────────────────────────────────────────────────

export const concurrentSecondmentOutReleaseNonSFDef: EditOperation = {
  id: 'ConcurrentSecondmentOutReleaseNonSF', label: '兼務出向解除（SF未導入先）',
  group: 'person', badge: 'negative',
  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentToCompany)      return unavailable('出向先が設定されていない兼務行は対象外です')
    if (isSFIntegratedCompany(row.secondmentToCompany as string | undefined, ms))
                                       return unavailable('SF導入先の兼務出向解除は「SF導入先」操作を使用してください')
    return AVAILABLE
  },
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentToCompany)
      return fail('兼務出向行ではありません（concurrentType=兼務 かつ secondmentToCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向解除: ${personName(row)}`,
    }
  },
}

// ── 兼務出向受入解除（SF導入先） ──────────────────────────────────────────────

export const concurrentSecondmentInReleaseSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInReleaseSF', label: '兼務出向受入解除（SF導入先）',
  group: 'person', badge: 'negative',
  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentFromCompany)    return unavailable('出向受入元が設定されていない兼務行は対象外です')
    if (!isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, ms))
                                       return unavailable('SF未導入先の兼務出向受入解除は「SF未導入先」操作を使用してください')
    return AVAILABLE
  },
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
      return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 兼務出向受入解除（SF未導入先） ────────────────────────────────────────────

export const concurrentSecondmentInReleaseNonSFDef: EditOperation = {
  id: 'ConcurrentSecondmentInReleaseNonSF',
  label: '兼務出向受入解除（SF未導入先）',
  group: 'person', badge: 'negative',
  availableFor(row, ms) {
    if (row.concurrentType !== '兼務') return unavailable('兼務行のみ対象です')
    if (!row.secondmentFromCompany)    return unavailable('出向受入元が設定されていない兼務行は対象外です')
    if (isSFIntegratedCompany(row.secondmentFromCompany as string | undefined, ms))
                                       return unavailable('SF導入先の兼務出向受入解除は「SF導入先」操作を使用してください')
    return AVAILABLE
  },
  inputs: [...inReleaseInputs],
  onOpen: (row) => ({ ...inReleaseInitial(), memo: row.memo as string | undefined }),

  onValidate(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)
    if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
    if (row.concurrentType !== '兼務' || !row.secondmentFromCompany)
      return fail('兼務出向受入行ではありません（concurrentType=兼務 かつ secondmentFromCompany が必要）')
    return ok()
  },

  onSubmit(ctx, rowId, _values) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return {
      updatedList: ctx.allocationList.filter(r => r.rowId !== rowId),
      label: `兼務出向受入解除: ${personName(row)}`,
    }
  },
}

// ── 出向受入取消（セッション内追加分） ──────────────────────────────────────────
// このセッションで追加した受入行を削除する（prevSecondmentFromCompany が空 = このセッション内追加）
// SF統合・SF外を問わず共通ロジック

const cancelDescription = 'このセッションで追加した出向受入を取消します。下記の情報が削除されます。'

export const secondmentInCancelDef: EditOperation = {
  id: 'SecondmentInCancel', label: '本務出向受入取消',
  group: 'person', badge: 'negative',
  availableFor(row) {
    if (!isMainAssignment(row))          return unavailable('本務行のみ対象です（兼務行には設定できません）')
    if (!row.secondmentFromCompany)      return unavailable('出向受入が設定されていません')
    if (row.prevSecondmentFromCompany)   return unavailable('インポート前からの出向受入は取消できません（出向受入解除を使用してください）')
    // SF外ペアの受入行（transferReason=本務出向）は「SF外出向取り消し」で2行同時削除する
    if ((row.transferReason as string | undefined) === TR.SECONDMENT_OUT)
      return unavailable('SF外出向ペアの受入行です。「SF外出向取り消し」操作を使用してください')
    return AVAILABLE
  },
  description: cancelDescription,
  suppressSideEffectWarning: true,
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

const concurrentCancelDescription = 'このセッションで追加した兼務出向受入を取消します。下記の情報が削除されます。'

export const concurrentSecondmentInCancelDef: EditOperation = {
  id: 'ConcurrentSecondmentInCancel', label: '兼務出向受入取消',
  group: 'person', badge: 'negative',
  availableFor(row) {
    if (row.concurrentType !== '兼務')   return unavailable('兼務行のみ対象です')
    if (!row.secondmentFromCompany)      return unavailable('出向受入が設定されていません')
    if (row.prevSecondmentFromCompany)   return unavailable('インポート前からの兼務出向受入は取消できません（出向受入解除を使用してください）')
    return AVAILABLE
  },
  description: concurrentCancelDescription,
  suppressSideEffectWarning: true,
  inputs: [
    { field: 'lastName',                     required: false, readOnly: true },
    { field: 'firstName',                    required: false, readOnly: true },
    { field: 'secondmentFromCompany',        required: false, readOnly: true, label: '出向元会社' },
    { field: 'secondmentFromEmployeeNumber', required: false, readOnly: true, label: '出向元社員番号' },
    { field: 'departmentCode',               required: false, readOnly: true, label: '受入先組織コード' },
    { field: 'concurrentReason',             required: false, readOnly: true },
  ],
  onOpen: (row) => ({
    lastName:                     row.lastName,
    firstName:                    row.firstName,
    secondmentFromCompany:        row.secondmentFromCompany,
    secondmentFromEmployeeNumber: row.secondmentFromEmployeeNumber,
    departmentCode:               row.departmentCode,
    concurrentReason:             row.concurrentReason,
  }),
  onValidate(ctx, rowId) {
    if (!ctx.allocationList.find(r => r.rowId === rowId)) return fail(`行が見つかりません (rowId: ${rowId})`)
    return ok()
  },
  onSubmit(ctx, rowId) {
    const row = ctx.allocationList.find(r => r.rowId === rowId)!
    return { updatedList: ctx.allocationList.filter(r => r.rowId !== rowId), label: `兼務出向受入取消: ${personName(row)}` }
  },
}

export const DEFS: EditOperation[] = [
  secondmentOutSFDef,              secondmentOutNonSFDef,
  secondmentInNewDef,                              // 旧SF/非SF統合
  concurrentSecondmentOutNonSFDef,                 // SF統合先への兼務出向はSFが管理するため不要
  concurrentSecondmentInNewDef,                    // 旧SF/非SF統合
  secondmentOutReleaseSFDef,       secondmentOutReleaseNonSFDef,
  secondmentInReleaseSFDef,        secondmentInReleaseNonSFDef,
  concurrentSecondmentOutReleaseSFDef, concurrentSecondmentOutReleaseNonSFDef,
  concurrentSecondmentInReleaseSFDef,  concurrentSecondmentInReleaseNonSFDef,
  secondmentInCancelDef,                           // 旧SF/非SF統合・operationRole修正
  concurrentSecondmentInCancelDef,                 // 同上
]
