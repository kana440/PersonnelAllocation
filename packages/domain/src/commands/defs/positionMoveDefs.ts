// 部下の引継・統合、空きポジションへ移動
import type { EditOperation } from './types'
import { AVAILABLE, unavailable } from './types'
import { ok, fail }               from '../types'
import type { AllocationRow }     from '../../allocationRow'
import { getDescendantPositionCodes } from '../helpers'
import { isVacantPosition, assignPersonToVacant, countSubordinates } from './positionVacant'

function personName(row: AllocationRow): string {
  return [row.lastName, row.firstName].filter(Boolean).join(' ') || `rowId:${row.rowId}`
}

// ── 部下の引継・統合 ──────────────────────────────────────────────────────────

export const subordinateHandoffDef: EditOperation = {
  id:         'SubordinateHandoff',
  label:      '部下の引継・統合',
  group:      'position',
  badge:      'transfer',

  description: '配下のメンバーの上司ポジションを引継先に変更します。統合元が空きポジションの場合はその行を削除します。',
  entryPoints:     ['personMenu'] as const,
  availabilityNote: 'ポジションコードが設定されている行（在席・空席問わず）。配下のレポートラインを別ポジションに引き継ぐ。',

  availableFor: (row) =>
    (row.positionCode as string | undefined)
      ? AVAILABLE
      : unavailable('ポジションコードが設定されていない行には設定できません'),

  inputs: [
    {
      field:          'managerPositionCode',
      required:       true,
      label:          '引継先ポジション',
      picker:         'position',
      positionFilter: (row, ctx) => {
        const selfPosCode = row.positionCode as string | undefined
        if (!selfPosCode) return () => true
        const descendants = getDescendantPositionCodes(selfPosCode, ctx.allocationList)
        return (candidate) =>
          !!candidate.positionCode &&
          candidate.positionCode !== selfPosCode &&
          !descendants.has(candidate.positionCode as string)
      },
    },
    { field: 'managerName', required: false, readOnly: true, label: '引継先担当者名' },
    { field: 'memo',        required: false },
  ],

  onOpen: (_row, _ctx) => ({
    managerPositionCode: undefined,
    managerName:         undefined,
    memo:                undefined,
  }),

  createCommand(rowId, values) {
    return {
      kind: 'SubordinateHandoff',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        const srcPosCode = row.positionCode as string | undefined
        if (!srcPosCode) return fail('ポジションコードが設定されていません')
        const targetPosCode = values.managerPositionCode as string | undefined
        if (!targetPosCode) return fail('引継先ポジションを選択してください')
        if (targetPosCode === srcPosCode) return fail('引継先に自分自身は選択できません')
        return ok()
      },
      apply(ctx) {
        const row        = ctx.allocationList.find(r => r.rowId === rowId)!
        const srcPosCode = row.positionCode as string | undefined
        const targetPos  = values.managerPositionCode as string | undefined
        const targetName = values.managerName as string | undefined

        let updatedList = ctx.allocationList.map(r => {
          if ((r.managerPositionCode as string | undefined) === srcPosCode && r.rowId !== rowId) {
            return { ...r, managerPositionCode: targetPos, managerName: targetName }
          }
          return r
        })

        if (isVacantPosition(row)) {
          updatedList = updatedList.filter(r => r.rowId !== rowId)
        }

        return {
          updatedList,
          label: `部下引継: ${personName(row)} → ${targetPos ?? ''}`,
        }
      },
    }
  },
}

// ── 空きポジションへ移動 ──────────────────────────────────────────────────────

export const moveToVacantPositionDef: EditOperation = {
  id:         'MoveToVacantPosition',
  label:      '空Posへ移動',
  group:      'position',
  badge:      'transfer',

  description: '人を空きポジションに移動します。「元のポジションを空席として残す」を選択すると、変更前のポジションに空席行が追加されます。',
  entryPoints:     ['personMenu', 'dragIntent'] as const,
  availabilityNote: '在席者（userId あり）でポジションコードが設定されている行。移動先の空きポジションはフォーム内で選択する。',

  availableFor: (row) => {
    if (!(row.positionCode as string | undefined))
      return unavailable('ポジションコードが設定されていない行には設定できません')
    if (!(row.userId as string | undefined))
      return unavailable('人が割り当てられていない行（空きポジション）には設定できません')
    return AVAILABLE
  },

  // 簡易モード: 空席フラグだけ入力（変更内容は ChangePreview に表示）
  quickInputs: [
    {
      field:     '_leaveSourceVacant',
      label:     '元のポジションを空席として残す',
      required:  false,
      inputType: 'checkbox',
    },
  ],

  inputs: [
    {
      field:          '_targetPositionCode',
      required:       true,
      label:          '移動先の空きポジション',
      picker:         'position',
      positionFilter: (row, _ctx) => (candidate) =>
        isVacantPosition(candidate) &&
        candidate.positionCode !== (row.positionCode as string | undefined),
    },
    { kind: 'section', label: '移動先ポジションの情報（参照）' },
    { field: 'positionCode',         required: false, readOnly: true, label: 'ポジションコード' },
    { field: 'positionBand',         required: false, readOnly: true, label: 'バンド' },
    { field: 'officialPositionCode', required: false, readOnly: true, label: '役職' },
    { field: 'managerPositionCode',  required: false, readOnly: true, label: '上司ポジションコード' },
    { field: 'managerName',          required: false, readOnly: true, label: '上司名' },
    { kind: 'section', label: '操作設定' },
    {
      field:     '_leaveSourceVacant',
      label:     '元のポジションを空席として残す',
      required:  false,
      inputType: 'checkbox',
    },
    { field: 'transferReason', required: false },
    { field: 'memo',           required: false },
  ],

  onOpen: (row, ctx) => ({
    _targetPositionCode: undefined,
    _leaveSourceVacant: countSubordinates(row, ctx.allocationList) > 0 ? '1' : '',
  }),

  onFieldChange: {
    // 移動先ポジションが決まったら、そのポジションの情報を readonly フィールドに転記（参照表示用）
    _targetPositionCode: (posCode, ctx) => {
      if (!posCode) return {}
      const targetRow = ctx.allocationList.find(r => (r.positionCode as string | undefined) === posCode)
      if (!targetRow) return {}
      return {
        setValues: {
          positionCode:         targetRow.positionCode         as string | undefined,
          positionBand:         targetRow.positionBand         as string | undefined,
          officialPositionCode: targetRow.officialPositionCode as string | undefined,
          managerPositionCode:  targetRow.managerPositionCode  as string | undefined,
          managerName:          targetRow.managerName          as string | undefined,
        },
      }
    },
  },

  createCommand(rowId, values) {
    return {
      kind: 'MoveToVacantPosition',
      validate(ctx) {
        const row = ctx.allocationList.find(r => r.rowId === rowId)
        if (!row) return fail(`行が見つかりません (rowId: ${rowId})`)
        if (!(row.userId as string | undefined)) return fail('人が割り当てられていない行です')
        const targetPosCode = values._targetPositionCode as string | undefined
        if (!targetPosCode) return fail('移動先の空きポジションを選択してください')
        const targetRow = ctx.allocationList.find(r => (r.positionCode as string | undefined) === targetPosCode)
        if (!targetRow) return fail(`指定されたポジションが見つかりません: ${targetPosCode}`)
        if (!isVacantPosition(targetRow)) return fail('指定されたポジションは空きポジションではありません')
        return ok()
      },
      apply(ctx) {
        const row           = ctx.allocationList.find(r => r.rowId === rowId)!
        const targetPosCode = values._targetPositionCode as string | undefined
        const targetRow     = ctx.allocationList.find(r => (r.positionCode as string | undefined) === targetPosCode)!
        const leaveSourceVacant = !!(values._leaveSourceVacant as string | undefined)

        const { updatedList } = assignPersonToVacant(row, targetRow, ctx, {
          leaveSourceVacant,
          overrideBand: undefined,
        })

        return {
          updatedList,
          label: `空Pos移動: ${personName(row)} → ${targetPosCode ?? ''}`,
        }
      },
    }
  },
}

export const DEFS: EditOperation[] = [subordinateHandoffDef, moveToVacantPositionDef]
