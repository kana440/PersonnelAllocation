// 職務内容・雇用形態 — ジョブタイプ変更・雇用延長
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail } from '../types'
import type { AllocationRow } from '../../allocationRow'
import { isRegularEmployee, isExtendedEmployeeTarget } from '../helpers'
import { TR } from '../../transferReasonLabels'
import { preserve } from './afterConstraintHelpers'
import {
  detectSubordinateMode,
  SUBORDINATE_TRANSFER_INPUTS,
  applySubordinateTransfer,
} from './promotionDefs'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// 雇用延長保存時に空欄化するフィールド
const computeEmploymentExtensionAfter = (): Partial<AllocationRow> => ({
  band:                          undefined,
  payGrade:                      undefined,
  positionBand:                  undefined,
  officialPositionCode:          undefined,
  localJobTitle:                 undefined,
  jobFamily:                     undefined,
  jobType:                       undefined,
  employmentType:                undefined,
  unionFlag:                     undefined,
  discretionaryWorkFlag:         undefined,
  nonUnionAgreementFlag:         undefined,
  positionUnionFlag:             undefined,
  positionDiscretionaryWorkFlag: undefined,
  trainingPositionFlag:          undefined,
})


// ── ジョブタイプ変更 ──────────────────────────────────────────────────────────

export const jobTypeChangeDef: EditOperation = {
  id:         'JobTypeChange',
  label:      '職種変更',
  group:      'jobClassification',
  badge:      'jobChange',

  description: 'ジョブファミリー・ジョブタイプを変更します。jobType × band → payGrade の導出により、band が変わらなくても給与等級が変わる場合があります。給与等級が変わる場合はポジション変更も必要です（フォーム内 [変更] ボタンから対応）。',
  entryPoints:      ['personMenu', 'dragIntent'] as const,
  availabilityNote: '常に有効（対象を行の状態で絞り込まない）。',

  availableFor: () => AVAILABLE,

  // 簡易モード: ジョブファミリー・ジョブタイプだけ入力（JF・JTグループへのドラッグ&ドロップで使用）
  quickInputs: [
    { field: 'jobFamily', required: false },
    { field: 'jobType',   required: true  },
  ],

  inputs: [
    // ── ヘッダーインジケーター（自動導出サイン）───────────────────────────
    { field: 'promotionSign',      required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'payGradeChangeSign', required: false, readOnly: true, inputType: 'checkbox', indicator: true },
    { field: 'transferReason', required: false,
      options: [TR.DIV_TRANSFER], optionsMode: 'suggest' },
    { field: 'memo',           required: false },
    { kind: 'section', label: 'ジョブタイプ情報' },
    { field: 'jobFamily',      required: false },
    { field: 'jobType',        required: true  },
    { field: 'payGrade',       required: false },
    { field: 'positionCode',   required: false, readOnly: true, picker: 'newPosition' },
    { kind: 'section', label: '裁量労働' },
    { field: 'positionDiscretionaryWorkFlag', required: false },
    { field: 'discretionaryWorkFlag',         required: false },
    // ── 部下の引き継ぎ（部下がいる場合のみ表示）───────────────────────────
    ...SUBORDINATE_TRANSFER_INPUTS,
  ],

  onOpen: (row, ctx) => ({
    promotionSign:               row.promotionSign               as string | undefined,
    payGradeChangeSign:          row.payGradeChangeSign          as string | undefined,
    transferReason:              row.transferReason ?? TR.DIV_TRANSFER as string | undefined,
    jobFamily:                   row.jobFamily                   as string | undefined,
    jobType:                     row.jobType                     as string | undefined,
    payGrade:                    row.payGrade                    as string | undefined,
    positionCode:                row.positionCode                as string | undefined,
    positionDiscretionaryWorkFlag: row.positionDiscretionaryWorkFlag as string | undefined,
    discretionaryWorkFlag:         row.discretionaryWorkFlag         as string | undefined,
    memo:                        row.memo ?? '職種変更'           as string | undefined,
    _managerTransferMode:        detectSubordinateMode(row, ctx),
  }),

  createCommand(rowId, values) {
    return {
      kind: 'JobTypeChange',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId))
          return fail(`行が見つかりません (rowId: ${rowId})`)
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        const { _managerTransferMode, ...cleanValues } = values
        const label = `ジョブタイプ変更: ${personName(row)}`
        const result = {
          updatedList: ctx.allocationList.map(r => r.rowId === rowId ? { ...r, ...cleanValues } : r),
          label,
        }
        return applySubordinateTransfer(row, values, result)
      },
    }
  },
}

// ── 雇用延長 ─────────────────────────────────────────────────────────────────

export const employmentExtensionDef: EditOperation = {
  id:         'EmploymentExtension',
  label:      '雇用延長',
  group:      'jobClassification',
  badge:      'jobChange',

  description: '３月末に雇用延長する対象者については、当個別に雇用延長登録いたします。申請書上は申請区分を入力いただき、他の入力項目は空欄にしてください。',
  entryPoints:      ['personMenu'] as const,
  availabilityNote: '雇用延長対象バンドの行、または正社員の行。',

  operationRole: {
    kind:                'lock',
    isActive:            (row) => row.transferReason === TR.EMPLOYMENT_EXTENSION_PROCEDURE,
    isActiveThisSession: (row) => row.transferReason === TR.EMPLOYMENT_EXTENSION_PROCEDURE,
  },

  availableFor: (row, ms) =>
    isExtendedEmployeeTarget(row, ms) || isRegularEmployee(row, ms)
      ? AVAILABLE
      : unavailable('雇用延長の対象者または正社員のみ対象です'),

  inputs: [
    { field: 'transferReason', required: true, readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: TR.EMPLOYMENT_EXTENSION_PROCEDURE as string | undefined,
    memo:           row.memo as string | undefined,
  }),

  createCommand(rowId, values) {
    return {
      kind: 'EmploymentExtension',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!values.transferReason) return fail('変更事由は必須です')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        return {
          updatedList: ctx.allocationList.map(r =>
            r.rowId === rowId
              ? {
                  ...r,
                  ...computeEmploymentExtensionAfter(),
                  transferReason: values.transferReason as AllocationRow['transferReason'],
                  ...(values.memo !== undefined ? { memo: values.memo as AllocationRow['memo'] } : {}),
                }
              : r
          ),
          label: `雇用延長: ${personName(row)}`,
        }
      },
    }
  },
}

// ── 雇用タイプ変更 ───────────────────────────────────────────────────────────

export const employmentTypeChangeDef: EditOperation = {
  id:         'EmploymentTypeChange',
  label:      '雇用タイプ変更',
  group:      'jobClassification',
  badge:      'jobChange',

  description: '雇用タイプ変更の手続きを記入します。バンドや給与等級など関連項目も必要に応じて変更してください。',
  entryPoints:      ['personMenu'] as const,
  availabilityNote: '在席者（userId あり）の行（本務・兼務いずれも対象）。雇用タイプ変更手続として登録。',

  availableFor: (row) =>
    row.userId ? AVAILABLE : unavailable('担当者が配属されていない行には設定できません'),

  inputs: [
    { field: 'transferReason', required: true, readOnly: true },
    { field: 'memo',           required: false },
    { kind: 'section', label: '雇用タイプ情報' },
    { field: 'employmentType', required: true },
  ],

  onOpen: (row) => ({
    transferReason: TR.EMPLOYMENT_TYPE_CHANGE_PROCEDURE as string | undefined,
    memo:           row.memo           as string | undefined,
    employmentType: row.employmentType as string | undefined,
  }),

  createCommand(rowId, values) {
    return {
      kind: 'EmploymentTypeChange',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!values.employmentType) return fail('雇用タイプは必須です')
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        const changes = Object.fromEntries(
          Object.entries(values).filter(([, v]) => v !== undefined)
        )
        return {
          updatedList: ctx.allocationList.map(r => r.rowId === rowId ? { ...r, ...changes } : r),
          label: `雇用タイプ変更: ${personName(row)}`,
        }
      },
    }
  },
}

// ── 雇用延長取消 ──────────────────────────────────────────────────────────────

export const employmentExtensionCancelDef: EditOperation = {
  id:          'EmploymentExtensionCancel',
  label:       '雇用延長取消',
  group:       'jobClassification',
  badge:       'jobChange',

  description: '雇用延長登録を取り消します。バンド・給与等級などのフィールドはインポート前の値に戻ります。',
  entryPoints:      ['personMenu'] as const,
  availabilityNote: 'このセッションで雇用延長を設定した行のみ。雇用延長取消操作（lockCancel）。',

  operationRole: { kind: 'lockCancel', of: 'EmploymentExtension' },

  availableFor: () => AVAILABLE,

  inputs: [
    { field: 'transferReason', required: false, readOnly: true },
    { field: 'memo',           required: false },
  ],

  onOpen: (row) => ({
    transferReason: undefined,
    memo:           row.memo as string | undefined,
  }),

  createCommand(rowId, values) {
    return {
      kind: 'EmploymentExtensionCancel',
      validate(ctx) {
        if (!ctx.allocationList.find(r => r.rowId === rowId))
          return fail(`行が見つかりません (rowId: ${rowId})`)
        return ok()
      },
      apply(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)!
        return {
          updatedList: ctx.allocationList.map(r =>
            r.rowId === rowId
              ? {
                  ...r,
                  ...preserve(row),
                  transferReason: undefined,
                  memo:           values.memo as string | undefined,
                }
              : r
          ),
          label: `雇用延長取消: ${personName(row)}`,
        }
      },
    }
  },
}

export const DEFS: EditOperation[] = [
  jobTypeChangeDef,
  employmentExtensionDef, employmentExtensionCancelDef,
  employmentTypeChangeDef,
]
