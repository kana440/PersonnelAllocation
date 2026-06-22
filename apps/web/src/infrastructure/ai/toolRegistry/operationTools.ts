// toolRegistry/operationTools.ts — ドメイン変更操作ツール群（propose_* / undo）
//
// オーナー: Web 開発者
// 変更方針: domain に新しい EditOperation を追加したときはこのファイルにも propose_* を追加する。
// AI 開発者は原則このファイルを変更しない（ツール定義の description 変更は除く）。
//
// ツール追加の手順:
//   1. packages/domain/src/commands/defs/ に EditOperation を追加・DEFS に登録
//   2. apps/web/src/application/aiTools/ に executeXxx 関数を追加
//   3. このファイルに ExecuteEntry または ConfirmEntry を追加
//
// propose_field_edit / propose_change_position は detectCascadeWidget を使うため
// helpers.ts に依存する。他のツールは原則として helpers.ts を直接使わない。

import type { ConfirmEntry, ExecuteEntry } from './types'
import { aiTools }                  from '../../../application/aiTools'
import { appService }               from '../../../application/HRApplicationService'
import * as P                       from '../proposalBuilders'
import {
  bindOperation,
  secondmentOutReleaseSFDef,
  concurrentSecondmentOutSFDef,
  employmentTransferDef,
} from '@personnel/domain/commands/defs'
import { CompoundCommand } from '@personnel/domain/commands/handlers/compoundCommand'
import { detectCascadeWidget } from './helpers'

export const OPERATION_TOOLS: Array<ConfirmEntry | ExecuteEntry> = [

  // ── undo ───────────────────────────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'undo',
        description: '直前の操作を取り消す（即時実行）。ユーザーが「元に戻して」「undo して」と言った場合に使う。取り消せる操作がない場合はエラーを返す。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => {
      if (!appService.getSnapshot().canUndo)
        return { ok: false, message: '取り消せる操作がありません' }
      aiTools.undo()
      return { ok: true, message: '操作を取り消しました' }
    },
  },

  // ── propose_bulk_transfer ──────────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_bulk_transfer',
        description: '指定した組織の全メンバーを別の組織に一括異動させることをユーザーに提案し、確認を得てから実行する。組織統廃合・改編などで部署全体を移動させるときに使う。sourceOrgCode（直属のみ）か sourceSubtreeOrgCode（配下含む）のどちらかを指定する。実行前に findOrgs で組織コードを確認すること。',
        parameters: {
          type: 'object',
          required: ['targetOrgCode'],
          properties: {
            sourceOrgCode:        { type: 'string', description: '移動元の組織コード（直属メンバーのみ）' },
            sourceSubtreeOrgCode: { type: 'string', description: '移動元の組織コード（配下組織も含む）' },
            targetOrgCode:        { type: 'string', description: '移動先の組織コード（externalCode）' },
          },
        },
      },
    },
    buildProposal: args => {
      const code = (args.sourceSubtreeOrgCode ?? args.sourceOrgCode) as string
      return P.buildBulkTransferProposal(code, args.targetOrgCode as string, { includeSubtree: !!args.sourceSubtreeOrgCode })
    },
    executeOnApprove: args => {
      const code = (args.sourceSubtreeOrgCode ?? args.sourceOrgCode) as string
      return aiTools.executeBulkTransfer(code, args.targetOrgCode as string, { includeSubtree: !!args.sourceSubtreeOrgCode })
    },
  },

  // ── propose_field_edit ─────────────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_field_edit',
        description: '指定した行の特定フィールドを変更する（即時実行）。値を変更する前に getFieldOptions で有効な選択肢を確認すること。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'field', 'value'],
          properties: {
            rowId: { type: 'number', description: '対象行の rowId（findPersons の positions[].rowId）' },
            field: {
              type: 'string',
              enum: [
                'employmentType', 'band', 'payGrade', 'officialPositionCode', 'localJobTitle',
                'jobFamily', 'jobType', 'location', 'costCenter',
                'secondmentToCompany', 'secondmentFromCompany', 'secondmentFromEmployeeNumber',
                'transferReason', 'concurrentReason', 'demotionReason', 'memo',
              ],
              description: '変更するフィールド名',
            },
            value: { type: 'string', description: '新しい値（空文字で削除）' },
          },
        },
      },
    },
    execute: args => {
      const beforeRow = appService.getSnapshot().allocationList.find(r => r.rowId === (args.rowId as number))
      const result    = aiTools.executeFieldEdit(args.rowId as number, args.field as string, args.value as string)
      if (!('applied' in result) || !beforeRow) return result
      const _widget = detectCascadeWidget(beforeRow, args.field as string)
      return _widget ? { ...result, _widget } : result
    },
  },

  // ── propose_bulk_set_field ─────────────────────────────────────────────────
  // getValidationDiagnosis の suggestedTool で案内される主要ツール。
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_bulk_set_field',
        description: '複数行の同一フィールドを一括で同じ値に設定することをユーザーに提案し、確認を得てから実行する。getValidationDiagnosis で取得した rowIds をそのまま使える。transferReason の一括設定、concurrentReason の一括クリアなどに使う。',
        parameters: {
          type: 'object',
          required: ['rowIds', 'field', 'value'],
          properties: {
            rowIds: {
              type: 'array',
              items: { type: 'number' },
              description: '対象行の rowId 配列（getValidationDiagnosis.byField[].rowIds をそのまま使用可）',
            },
            field: {
              type: 'string',
              description: '変更するフィールド名（例: transferReason, concurrentReason, demotionReason, memo）',
            },
            value: {
              type: 'string',
              description: '設定する値。空文字はフィールドをクリアする',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildBulkSetFieldProposal(args.rowIds as number[], args.field as string, args.value as string),
    executeOnApprove: args => aiTools.executeBulkSetField(args.rowIds as number[], args.field as string, args.value as string),
  },

  // ── propose_transfer ───────────────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_transfer',
        description: '指定した人物を別の組織に異動させることをユーザーに提案し、確認を得てから実行する。' +
          'rowIds か name/subtreeOrgCode のいずれかで対象を指定する（findPersons の事前呼び出し不要）。' +
          '確認UIに transferReason（異動事由）の入力フォームが表示される。' +
          '改組による異動は "分掌異動（改組）"、職務内容変更を伴う人事異動は "分掌異動" を transferReason に渡す。',
        parameters: {
          type: 'object',
          required: ['targetOrgCode'],
          properties: {
            rowIds: {
              type:        'array',
              items:       { type: 'number' },
              description: '異動対象の rowId 一覧（findPersons で取得済みの場合に指定）',
            },
            name: {
              type:        'string',
              description: '氏名で対象を絞り込む（rowIds 未指定時に使用）',
            },
            subtreeOrgCode: {
              type:        'string',
              description: '指定組織の配下全員を対象にする（rowIds 未指定時に使用）',
            },
            targetOrgCode: {
              type:        'string',
              description: '移動先組織の externalCode（findOrgs で取得した値）',
            },
            transferReason: {
              type:        'string',
              description: '異動事由の提案値。文脈から推測して渡す。確認UIでユーザーが変更可能',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildTransferProposal({
      rowIds:         args.rowIds         as number[]  | undefined,
      name:           args.name           as string    | undefined,
      subtreeOrgCode: args.subtreeOrgCode as string    | undefined,
      targetOrgCode:  args.targetOrgCode  as string,
      transferReason: args.transferReason as string    | undefined,
    }),
    executeOnApprove: (args, userInputs) => {
      const rowIds = args.rowIds as number[] | undefined
      const resolvedRowIds = rowIds ?? aiTools.resolveTransferRowIds({
        name:           args.name           as string | undefined,
        subtreeOrgCode: args.subtreeOrgCode as string | undefined,
      })
      return aiTools.executeTransferPersons(
        resolvedRowIds,
        args.targetOrgCode as string,
        userInputs?.['transferReason'] ?? args.transferReason as string | undefined,
      )
    },
  },

  // ── propose_promotion ──────────────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_promotion',
        description: '昇格をユーザーに提案し、確認を得てから実行する。' +
          'positionBand を指定するだけで band / payGrade が自動導出される（DryRunで確認UI に表示）。' +
          'findPersons の事前呼び出し不要。rowId か name で対象を指定する。',
        parameters: {
          type: 'object',
          required: ['rowId', 'newPositionBand'],
          properties: {
            rowId: {
              type:        'number',
              description: '昇格対象の rowId（findPersons の positions[].rowId）',
            },
            newPositionBand: {
              type:        'string',
              description: '昇格後のポジションバンド（例: "M4"）。band / payGrade はここから自動導出される',
            },
            newOfficialPositionCode: {
              type:        'string',
              description: '昇格後の役職コード（変わる場合のみ指定）',
            },
            newLocalJobTitle: {
              type:        'string',
              description: '昇格後の役職名フリーテキスト（変わる場合のみ指定）',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildPromotionProposal({
      rowId:                   args.rowId                   as number,
      newPositionBand:         args.newPositionBand         as string,
      newOfficialPositionCode: args.newOfficialPositionCode as string | undefined,
      newLocalJobTitle:        args.newLocalJobTitle        as string | undefined,
    }),
    executeOnApprove: (args, userInputs) => aiTools.executePromotion({
      rowId:                   args.rowId as number,
      newPositionBand:         userInputs?.positionBand          ?? args.newPositionBand          as string,
      newOfficialPositionCode: userInputs?.officialPositionCode  ?? args.newOfficialPositionCode  as string | undefined,
      newLocalJobTitle:        userInputs?.localJobTitle         ?? args.newLocalJobTitle         as string | undefined,
    }),
  },

  // ── propose_create_position ────────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_create_position',
        description: '空席ポジションを新規作成する（即時実行）。実行前に findOrgs で orgCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['orgCode', 'localJobTitle'],
          properties: {
            orgCode:       { type: 'string', description: '組織コード（externalCode）' },
            localJobTitle: { type: 'string', description: 'ポジションの役職名' },
          },
        },
      },
    },
    execute: args => {
      const newRowId = aiTools.createVacantPosition(args.orgCode as string, args.localJobTitle as string)
      return { applied: true, localJobTitle: args.localJobTitle, orgCode: args.orgCode, newPositionRowId: newRowId }
    },
  },

  // ── propose_assign_person ──────────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_assign_person',
        description: '空席ポジションに従業員を配属する（即時実行）。実行前に findVacantPositions で vacantRowId を、findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['vacantRowId', 'userId'],
          properties: {
            vacantRowId: { type: 'number', description: '空席ポジション行の rowId（findVacantPositions で取得）' },
            userId:      { type: 'string', description: '配属する従業員のユーザー ID' },
          },
        },
      },
    },
    execute: args => {
      aiTools.assignPersonToVacantPosition(args.vacantRowId as number, args.userId as string)
      return { applied: true, vacantRowId: args.vacantRowId, userId: args.userId }
    },
  },

  // ── propose_change_position ────────────────────────────────────────────────
  // 同一組織内でポジションを作り直す（役職変更）。旧ポジションは削除。
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_change_position',
        description: '行のポジション（役職名）を変更する（即時実行）。新しいポジションを作成し、元のポジションを削除して1回のUndoで戻せる。「課長にして」「部長から課長へ」のような役職変更に使う。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'newJobTitle'],
          properties: {
            rowId:       { type: 'number', description: '対象行の rowId（findPersons の positions[].rowId）' },
            newJobTitle: { type: 'string', description: '新しい役職名（localJobTitle）' },
          },
        },
      },
    },
    execute: args => {
      const beforeRow = appService.getSnapshot().allocationList.find(r => r.rowId === (args.rowId as number))
      const result    = aiTools.executeChangePosition(args.rowId as number, args.newJobTitle as string)
      if (!('applied' in result) || !beforeRow) return result
      const _widget = detectCascadeWidget(beforeRow, 'localJobTitle')
      return _widget ? { ...result, _widget } : result
    },
  },

  // ── propose_set_manager_position ───────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_set_manager_position',
        description: '上司ポジションコードを設定する（即時実行）。managerName も在席者の姓名から自動入力する。実行前に findPersons で対象者の rowId を、findPersons で上司の positionCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'managerPositionCode'],
          properties: {
            rowId:               { type: 'number', description: '変更対象行の rowId' },
            managerPositionCode: { type: 'string', description: '上司のポジションコード' },
          },
        },
      },
    },
    execute: args => {
      const rowId               = args.rowId as number
      const managerPositionCode = args.managerPositionCode as string
      const result = aiTools.setManagerPosition(rowId, managerPositionCode)
      return result.ok
        ? { applied: true, rowId, managerPositionCode }
        : { ok: false, error: !result.ok && result.errors?.[0]?.message }
    },
  },

  // ── propose_re_derive_manager_names ───────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_re_derive_manager_names',
        description: '全行の managerName を、現在各ポジションに在籍している人の姓名に合わせて一括更新することをユーザーに提案する。上司ポジションの担当者が変わった後などに使う。',
        parameters: { type: 'object', properties: {} },
      },
    },
    buildProposal: () => P.buildReDeriveManagerNamesProposal(),
    executeOnApprove: () => {
      const changed = aiTools.reDeriveManagerNames()
      return { applied: true, changedCount: changed }
    },
  },

  // ── propose_assign_position_codes ─────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_assign_position_codes',
        description: '内部採番コード（_pos_…）のポジションに外部コード（P + 8桁数字）を割り当てる（即時実行）。managerPositionCode として参照している行も連動して更新される。実行前に getUnassignedPositions で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['assignments'],
          properties: {
            assignments: {
              type: 'array',
              description: '割り当てリスト。rowId と newPositionCode のペアを複数指定できる。',
              items: {
                type: 'object',
                required: ['rowId', 'newPositionCode'],
                properties: {
                  rowId:           { type: 'number', description: '対象行の rowId（getUnassignedPositions で取得）' },
                  newPositionCode: { type: 'string', description: '割り当てる外部コード（P + 8桁数字、例: P12345678）' },
                },
              },
            },
          },
        },
      },
    },
    execute: args => {
      const assignments = args.assignments as Array<{ rowId: number; newPositionCode: string }>
      const result = aiTools.assignPositionCodes(assignments)
      return result.ok
        ? { applied: true, count: assignments.length }
        : { ok: false, error: result.errors?.[0]?.message }
    },
  },

  // ── propose_re_derive_org_sub_fields ──────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_re_derive_org_sub_fields',
        description: '全行の businessUnit/division/subDivision/group/team を、組織マスタから一括再導出することをユーザーに提案する。組織を移動した後などにサブフィールドがずれているときに使う。',
        parameters: { type: 'object', properties: {} },
      },
    },
    buildProposal: () => P.buildReDeriveOrgSubFieldsProposal(),
    executeOnApprove: () => {
      const changed = aiTools.reDeriveOrgSubFields()
      return { applied: true, changedCount: changed }
    },
  },

  // ── propose_leave_of_absence ───────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_leave_of_absence',
        description: '指定した行を休職させる（即時実行）。leaveOfAbsenceSign を "1" に設定する。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: '休職対象の rowId（findPersons の positions[].rowId）' },
            memo:  { type: 'string', description: '休職事由（任意）' },
          },
        },
      },
    },
    execute: args => aiTools.executeLeaveOfAbsence(args.rowId as number, args.memo as string | undefined),
  },

  // ── propose_return_from_leave ──────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_return_from_leave',
        description: '指定した行を復職させる（即時実行）。leaveOfAbsenceSign をクリアする。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: '復職対象の rowId（findPersons の positions[].rowId）' },
          },
        },
      },
    },
    execute: args => aiTools.executeReturnFromLeave(args.rowId as number),
  },

  // ── propose_concurrent_add ─────────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_add',
        description: '指定した行（本務行）に社内兼務を追加する（即時実行）。兼務行を新規作成する。実行前に findPersons で rowId（本務行）を、findOrgs で targetOrgCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'targetOrgCode'],
          properties: {
            rowId:            { type: 'number', description: '本務行の rowId（findPersons の positions[].rowId）' },
            targetOrgCode:    { type: 'string', description: '兼務先組織の externalCode' },
            concurrentReason: { type: 'string', description: '兼務理由（任意）' },
          },
        },
      },
    },
    execute: args => aiTools.executeConcurrentAdd(args.rowId as number, args.targetOrgCode as string, args.concurrentReason as string | undefined),
  },

  // ── propose_concurrent_release ─────────────────────────────────────────────
  {
    kind: 'execute',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_release',
        description: '指定した兼務行を解除する（即時実行）。兼務行を削除する。出向兼務は対象外（出向解除を使うこと）。実行前に findPersons の positions[] から兼務行（concurrentType="兼務"）の rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId: { type: 'number', description: '解除対象の兼務行の rowId（findPersons の positions[] から兼務行を選択）' },
          },
        },
      },
    },
    execute: args => aiTools.executeConcurrentRelease(args.rowId as number),
  },

  // ── propose_secondment_to_concurrent ──────────────────────────────────────
  // Tier 3 wizard: 本務出向 → 兼務出向変換（2ステップ）
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_secondment_to_concurrent',
        description: '本務出向中の従業員を兼務出向に変換することをウィザード形式でユーザーに提案する。「出向解除 → 兼務出向追加」の2ステップを透過的に見せる。ピン留め行または findPersons で rowId を確認すること。prevDepartmentCode（元の所属）が設定されていない場合は失敗する。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:            { type: 'number', description: '本務出向中の行の rowId' },
            concurrentReason: { type: 'string', description: '兼務理由（任意）' },
          },
        },
      },
    },
    buildProposal:    args => P.buildSecondmentToConcurrentProposal(args.rowId as number, args.concurrentReason as string | undefined),
    executeOnApprove: args => {
      const rowId = args.rowId as number
      const { allocationList } = appService.getSnapshot()
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row?.secondmentToCompany) return { ok: false, error: '本務出向が設定されていません' }
      if (!row.prevDepartmentCode)   return { ok: false, error: '元の所属組織 (prevDepartmentCode) が特定できません' }

      const secondmentToCompany = row.secondmentToCompany
      const secondmentDeptCode  = row.departmentCode!
      const homeDeptCode        = row.prevDepartmentCode

      return aiTools.executeOperation(new CompoundCommand(
        [
          bindOperation(secondmentOutReleaseSFDef, rowId, { departmentCode: homeDeptCode }),
          bindOperation(concurrentSecondmentOutSFDef, rowId, {
            secondmentToCompany,
            departmentCode:   secondmentDeptCode,
            concurrentReason: args.concurrentReason as string | undefined,
          }),
        ],
        `本務出向→兼務出向: ${[row.lastName, row.firstName].filter(Boolean).join(' ')}`,
      ))
    },
  },

  // ── propose_secondment_transfer ────────────────────────────────────────────
  // Tier 3 wizard: 出向先への転籍（2ステップ）
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name: 'propose_secondment_transfer',
        description: '本務出向中の従業員を出向先に転籍させることをウィザード形式でユーザーに提案する。「出向解除 → 転籍（出）」の2ステップを透過的に見せる。ピン留め行または findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId', 'transferReason'],
          properties: {
            rowId:          { type: 'number', description: '本務出向中の行の rowId' },
            transferReason: { type: 'string', description: '異動事由（例: グループ会社転籍）' },
          },
        },
      },
    },
    buildProposal:    args => P.buildSecondmentTransferProposal(args.rowId as number, args.transferReason as string),
    executeOnApprove: args => {
      const rowId         = args.rowId as number
      const transferReason = args.transferReason as string
      const { allocationList } = appService.getSnapshot()
      const row = allocationList.find(r => r.rowId === rowId)
      if (!row?.secondmentToCompany) return { ok: false, error: '本務出向が設定されていません' }
      if (!row.prevDepartmentCode)   return { ok: false, error: '元の所属組織 (prevDepartmentCode) が特定できません' }

      const homeDeptCode = row.prevDepartmentCode

      return aiTools.executeOperation(new CompoundCommand(
        [
          bindOperation(secondmentOutReleaseSFDef, rowId, { departmentCode: homeDeptCode }),
          bindOperation(employmentTransferDef, rowId, { transferReason }),
        ],
        `出向先転籍: ${[row.lastName, row.firstName].filter(Boolean).join(' ')}`,
      ))
    },
  },

  // ── propose_demotion ───────────────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_demotion',
        description: '指定した行の降格をユーザーに提案し、確認を得てから役職・バンド等を変更する。実行前に findPersons で rowId を、getFieldOptions で有効な値を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:                { type: 'number', description: '降格対象の rowId（findPersons の positions[].rowId）' },
            officialPositionCode: { type: 'string', description: '新しい役職コード' },
            localJobTitle:        { type: 'string', description: '新しい役職名' },
            band:                 { type: 'string', description: '新しいバンド' },
            payGrade:             { type: 'string', description: '新しい給与等級' },
            demotionReason:       { type: 'string', description: '降格理由（必須）' },
          },
        },
      },
    },
    buildProposal: args => P.buildDemotionProposal(args.rowId as number, {
      officialPositionCode: args.officialPositionCode as string | undefined,
      localJobTitle:        args.localJobTitle        as string | undefined,
      band:                 args.band                 as string | undefined,
      payGrade:             args.payGrade              as string | undefined,
      demotionReason:       args.demotionReason        as string | undefined,
    }),
    executeOnApprove: (args, userInputs) => aiTools.executeDemotionForUser(args.rowId as number, {
      positionBand:         userInputs?.positionBand         ?? undefined,
      officialPositionCode: userInputs?.officialPositionCode ?? args.officialPositionCode as string | undefined,
      localJobTitle:        userInputs?.localJobTitle        ?? args.localJobTitle        as string | undefined,
      band:                 userInputs?.band                 ?? args.band                 as string | undefined,
      payGrade:             userInputs?.payGrade             ?? args.payGrade              as string | undefined,
      demotionReason:       userInputs?.demotionReason       ?? args.demotionReason        as string | undefined,
    }),
  },

  // ── propose_secondment_in ──────────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_secondment_in',
        description: '指定した行に本務出向受入を設定することをユーザーに提案し、確認を得てから実行する。出向元会社・社員番号・受入先組織・雇用タイプを確認UIで入力させる。sfIntegrated=true の場合は社員番号が必須（SF統合先）。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:        { type: 'number',  description: '本務出向受入対象の rowId（findPersons の positions[].rowId）' },
            sfIntegrated: { type: 'boolean', description: 'SF統合先かどうか（デフォルト false）' },
          },
        },
      },
    },
    buildProposal: args => P.buildSecondmentInProposal(
      args.rowId as number,
      (args.sfIntegrated as boolean | undefined) ?? false,
    ),
    executeOnApprove: (args, userInputs) => {
      if (!userInputs?.secondmentFromCompany || !userInputs?.departmentCode || !userInputs?.employmentType)
        return { ok: false, errors: [{ message: '出向元会社・受入先組織・雇用タイプは必須です' }] }
      return aiTools.executeSecondmentIn(
        args.rowId as number,
        (args.sfIntegrated as boolean | undefined) ?? false,
        {
          secondmentFromCompany:        userInputs.secondmentFromCompany,
          secondmentFromEmployeeNumber: userInputs.secondmentFromEmployeeNumber,
          departmentCode:               userInputs.departmentCode,
          employmentType:               userInputs.employmentType,
        },
      )
    },
  },

  // ── propose_concurrent_secondment_in ──────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_secondment_in',
        description: '指定した行に兼務出向受入を設定することをユーザーに提案し、確認を得てから実行する。新規兼務行を作成する。出向元会社・社員番号・出向先組織・雇用タイプを確認UIで入力させる。実行前に findPersons で rowId を確認すること。',
        parameters: {
          type: 'object',
          required: ['rowId'],
          properties: {
            rowId:        { type: 'number',  description: '兼務出向受入対象の rowId（本務行）（findPersons の positions[].rowId）' },
            sfIntegrated: { type: 'boolean', description: 'SF統合先かどうか（デフォルト false）' },
          },
        },
      },
    },
    buildProposal: args => P.buildConcurrentSecondmentInProposal(
      args.rowId as number,
      (args.sfIntegrated as boolean | undefined) ?? false,
    ),
    executeOnApprove: (args, userInputs) => {
      if (!userInputs?.secondmentFromCompany || !userInputs?.departmentCode || !userInputs?.employmentType)
        return { ok: false, errors: [{ message: '出向元会社・出向先組織・雇用タイプは必須です' }] }
      return aiTools.executeConcurrentSecondmentIn(
        args.rowId as number,
        (args.sfIntegrated as boolean | undefined) ?? false,
        {
          secondmentFromCompany:        userInputs.secondmentFromCompany,
          secondmentFromEmployeeNumber: userInputs.secondmentFromEmployeeNumber,
          departmentCode:               userInputs.departmentCode,
          employmentType:               userInputs.employmentType,
          concurrentReason:             userInputs.concurrentReason,
        },
      )
    },
  },
]
