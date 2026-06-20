import type { MultiRowOperationDef } from './multiRowTypes'
import {
  NonSFSecondmentPairCommand,
  NonSFSecondmentCancelCommand,
  NonSFSecondmentReleaseCommand,
  canCreateNonSFSecondmentPair,
  canCancelNonSFSecondmentPair,
  canReleaseNonSFSecondment,
} from '../handlers/nonSFSecondmentPair'

export const nonSFSecondmentOutDef: MultiRowOperationDef = {
  id:          'NonSFSecondmentOut',
  label:       'SF外出向（出向元＋受入）',
  buttonLabel: 'SF外出向\n出向元＋受入',
  description: '出向元行を出向箱に移動し、SF未導入会社の受入行を新規作成します。',
  badge:       'secondment',

  availableFor: (anchor, ms, _allRows) => canCreateNonSFSecondmentPair(anchor, ms),

  sections: [
    {
      label: '出向元（既存行を更新）',
      inputs: [
        { field: 'secondmentToCompany', required: true },
        { field: 'departmentCode',      required: false, label: '出向箱の組織', picker: 'org' },
        { field: 'transferReason',      required: false },
        { field: 'employmentType',      required: false, label: '雇用タイプ（出向後）' },
        { field: 'memo',                required: false },
      ],
    },
    {
      label:    '出向受入（新規行を作成）',
      isNewRow: true,
      notice:   '氏名・社員番号・グループ社員IDは出向元行から自動コピーされます。',
      inputs: [
        { field: 'departmentCode',               required: true,  label: '受入先組織', picker: 'org' },
        { field: 'employmentType',               required: false, label: '雇用タイプ（受入）' },
        { field: 'secondmentFromEmployeeNumber', required: false, label: '出向元社員番号（任意）' },
        { field: 'band',                         required: false, label: 'バンド（任意）' },
        { field: 'memo',                         required: false },
      ],
    },
  ],

  createCommand: (anchorRowId, sectionValues, _ctx) => {
    const src  = sectionValues[0] ?? {}
    const recv = sectionValues[1] ?? {}
    return new NonSFSecondmentPairCommand(
      anchorRowId,
      {
        secondmentToCompany: src.secondmentToCompany ?? '',
        departmentCode:      src.departmentCode  || undefined,
        transferReason:      src.transferReason  || undefined,
        employmentType:      src.employmentType  || undefined,
        memo:                src.memo            || undefined,
      },
      {
        departmentCode:               recv.departmentCode ?? '',
        employmentType:               recv.employmentType               || undefined,
        secondmentFromEmployeeNumber: recv.secondmentFromEmployeeNumber || undefined,
        band:                         recv.band                         || undefined,
        memo:                         recv.memo                         || undefined,
      },
    )
  },
}

/** SF外出向取り消し（セッション内で作成したペアを取り消す。出向元・受入どちらからでも実行可） */
export const nonSFSecondmentCancelDef: MultiRowOperationDef = {
  id:               'NonSFSecondmentCancel',
  label:            'SF外出向取り消し',
  buttonLabel:      'SF外出向\n取消',
  description:      'セッション内で作成した出向設定をクリアし、出向受入行を削除します。出向元行は発令前の状態に戻ります。',
  badge:            'negative',
  affectedRowCount: 2,

  availableFor: (anchor, _cl, allRows) => canCancelNonSFSecondmentPair(anchor, allRows),

  sections: [
    {
      label:             '出向受入行（削除）',
      style:             'delete',
      deleteDescription: '対応する出向受入行を削除します。',
      relatedRowFinder:  (anchor, allRows) => {
        const outCompany = anchor.secondmentToCompany as string | undefined
        if (outCompany) {
          return allRows.find(r =>
            r.rowId !== anchor.rowId &&
            (r.secondmentFromCompany as string | undefined) === outCompany,
          )
        }
        const inCompany = anchor.secondmentFromCompany as string | undefined
        return inCompany
          ? allRows.find(r =>
              r.rowId !== anchor.rowId &&
              (r.secondmentToCompany as string | undefined) === inCompany,
            )
          : undefined
      },
      inputs: [],
    },
  ],

  createCommand: (anchorRowId, _sectionValues, _ctx) =>
    new NonSFSecondmentCancelCommand(anchorRowId),
}

/** SF外出向解除（既存の出向を業務的に解除。出向元行更新 + 受入行削除） */
export const nonSFSecondmentReleaseDef: MultiRowOperationDef = {
  id:          'NonSFSecondmentRelease',
  label:       'SF外出向解除（出向元＋受入）',
  buttonLabel: 'SF外出向\n解除',
  description: '既存の出向を解除します。出向元行の出向設定をクリアし、出向受入行を削除します。',
  badge:       'secondment',

  availableFor: (anchor, _cl, allRows) => canReleaseNonSFSecondment(anchor, allRows),

  sections: [
    {
      label: '出向元（出向解除）',
      inputs: [
        { field: 'transferReason', required: false, label: '異動事由（解除）' },
        { field: 'memo',           required: false },
      ],
    },
    {
      label:             '出向受入行（削除）',
      style:             'delete',
      deleteDescription: '対応する出向受入行を削除します。',
      relatedRowFinder:  (anchor, allRows) => {
        const company = anchor.secondmentToCompany as string | undefined
        if (!company) return undefined
        return allRows.find(r =>
          r.rowId !== anchor.rowId &&
          (r.secondmentFromCompany as string | undefined) === company,
        )
      },
      inputs: [],
    },
  ],

  createCommand: (anchorRowId, sectionValues, ctx) => {
    const src        = sectionValues[0] ?? {}
    const anchor     = ctx.allocationList.find(r => r.rowId === anchorRowId)!
    const company    = anchor.secondmentToCompany as string | undefined ?? ''
    const receivingRow = ctx.allocationList.find(r =>
      r.rowId !== anchorRowId &&
      (r.secondmentFromCompany as string | undefined) === company,
    )
    return new NonSFSecondmentReleaseCommand(
      anchorRowId,
      receivingRow?.rowId ?? -1,
      src.transferReason || undefined,
      src.memo           || undefined,
    )
  },
}

export const ALL_MULTI_ROW_OPERATION_DEFS: readonly MultiRowOperationDef[] = [
  nonSFSecondmentOutDef,
  nonSFSecondmentReleaseDef,
  nonSFSecondmentCancelDef,
]
