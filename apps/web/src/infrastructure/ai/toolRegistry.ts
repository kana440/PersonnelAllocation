// Tool registry — classifies tools into three kinds and exposes them to AgentRunner.
//
// read    : 即時実行し結果をLLMに返す（副作用なし）
// render  : ウィジェットをUIに表示しつつ要約をLLMに返す（副作用：Widget表示）
// confirm : ユーザーの確認を待ってから操作を適用する（副作用：ドメイン変更）
//
// confirm ツールの実際の実行は AgentRunner の onConfirm コールバック経由で行われ、
// ユーザーが承認した場合のみ executeOnApprove が呼ばれる。

// toolRegistry — LLMプロトコルアダプター。
//
// 責務: ToolDefinition（JSONスキーマ）の定義 + aiTools/proposalBuilders へのルーティングのみ。
// ビジネスロジックは aiTools/ に、確認ウィジェット組み立ては proposalBuilders.ts に置く。
// 設計思想: specs/G4-ai/00-design-philosophy.md

import type { ChatWidget, PersonInfo } from '../../application/aiTypes'
import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import * as P from './proposalBuilders'
import type { ToolDefinition, ToolCall } from '../../ports'

export interface ToolResult {
  toolCallId: string
  content:    string
}

// ── Entry types ───────────────────────────────────────────────────────────────

export interface ReadEntry {
  kind: 'read'
  definition: ToolDefinition
  execute(args: Record<string, unknown>): unknown
}

export interface RenderEntry {
  kind: 'render'
  definition: ToolDefinition
  /** summary はLLMへのツール結果として返す。widget はUIに表示する。 */
  execute(args: Record<string, unknown>): { summary: unknown; widget: ChatWidget }
}

export interface ConfirmEntry {
  kind: 'confirm'
  definition: ToolDefinition
  /** ユーザーに見せる確認ウィジェットを構築する（副作用なし）。 */
  buildProposal(args: Record<string, unknown>): { widget: ChatWidget }
  /** ユーザーが承認した後に呼ばれる。EditCommand 経由でのみ変更する。 */
  executeOnApprove(args: Record<string, unknown>): unknown
}

export type ToolEntry = ReadEntry | RenderEntry | ConfirmEntry

// ── Tool entries ──────────────────────────────────────────────────────────────

const TOOL_ENTRIES: ToolEntry[] = [

  // ── Read: findPersons ────────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'findPersons',
        description: '従業員を氏名・userId・組織コードで検索する。複数の条件を同時に指定可能。',
        parameters: {
          type: 'object',
          properties: {
            name:    { type: 'string', description: '氏名（部分一致）' },
            userId:  { type: 'string', description: 'ユーザー ID（部分一致）' },
            orgCode: { type: 'string', description: '組織コード（完全一致）' },
          },
        },
      },
    },
    execute: args => aiTools.findPersons(args as { name?: string; userId?: string; orgCode?: string }),
  },

  // ── Read: findOrgs ───────────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'findOrgs',
        description: '組織を名前またはコードで検索する。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '組織名（部分一致）' },
            code: { type: 'string', description: '組織コード（部分一致）' },
          },
        },
      },
    },
    execute: args => aiTools.findOrgs(args as { name?: string; code?: string }),
  },

  // ── Read: getPersonDetail ────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getPersonDetail',
        description: '指定した userId の従業員の詳細情報を取得する。before（発令前）と after（発令後/現在の変更状態）の両方を返す。promotionSign が "1" であれば昇降格フラグ、leaveOfAbsenceSign が "1" であれば休職中。',
        parameters: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', description: 'ユーザー ID' },
          },
        },
      },
    },
    execute: args => aiTools.getPersonDetail(args.userId as string),
  },

  // ── Read: listChangedRows ────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'listChangedRows',
        description: '今のセッションで変更された行を一覧する。変更内容（等級・役職・組織の前後）も含む。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => aiTools.listChangedRows(),
  },

  // ── Read: getOrgMembers ──────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getOrgMembers',
        description: '指定した組織コードに直属するメンバー一覧を取得する。配下組織は含まない。',
        parameters: {
          type: 'object',
          required: ['orgCode'],
          properties: {
            orgCode: { type: 'string', description: '組織コード' },
          },
        },
      },
    },
    execute: args => aiTools.findPersons({ orgCode: args.orgCode as string }),
  },

  // ── Render: getOrgTree ──────────────────────────────────────────────────
  {
    kind: 'render',
    definition: {
      type: 'function',
      function: {
        name:        'getOrgTree',
        description: '組織の階層ツリーをウィジェットで視覚表示する。「全体像を見せて」「組織図を確認したい」のように組織構造を把握したいときに使う。rootOrgCode を省略するとルート組織から表示する。',
        parameters: {
          type: 'object',
          properties: {
            rootOrgCode: { type: 'string', description: '起点となる組織コード（省略時はルート組織）' },
          },
        },
      },
    },
    execute: args => {
      const result = aiTools.getOrgTreeData(args.rootOrgCode as string | undefined)
      if (!result.ok) return {
        summary: { error: result.error },
        widget:  { type: 'org-members', orgName: '（不明）', members: [] } as ChatWidget,
      }
      const widget: ChatWidget = { type: 'org-tree', orgName: result.orgName, tree: result.tree }
      return { summary: { orgName: result.orgName, totalMembers: result.totalMembers }, widget }
    },
  },

  // ── Read: getValidationDiagnosis ─────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getValidationDiagnosis',
        description: 'バリデーション問題をフィールド別に集計し、修正方法（suggestedTool/suggestedAction）と対象 rowIds を返す。操作後や「バリデーションを確認して」と言われたときに優先して使う。getValidationIssues の上位版。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => aiTools.getValidationDiagnosis(),
  },

  // ── Read: getFieldOptions ────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getFieldOptions',
        description: '指定した行・フィールドに入力できる有効な選択肢を返す。フィールドの値を変更する前に必ずこれで確認し、リスト外の値を設定しないこと。F1/F2/F3 の雇用タイプ制約も自動反映される。',
        parameters: {
          type: 'object',
          required: ['rowId', 'field'],
          properties: {
            rowId: { type: 'number', description: '対象行の rowId' },
            field: { type: 'string', description: 'フィールド名（例: band, payGrade, officialPositionCode, location）' },
          },
        },
      },
    },
    execute: args => ({ options: aiTools.getFieldOptions(args.rowId as number, args.field as string) }),
  },

  // ── Read: undo ───────────────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'undo',
        description: '直前の操作を取り消す。ユーザーが「元に戻して」「undo して」と言った場合に使う。取り消せる操作がない場合はその旨を返す。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => {
      if (!appService.getSnapshot().canUndo) return { ok: false, message: '取り消せる操作がありません' }
      aiTools.undo()
      return { ok: true, message: '操作を取り消しました' }
    },
  },

  // ── Render: show_org_members ─────────────────────────────────────────────
  {
    kind: 'render',
    definition: {
      type: 'function',
      function: {
        name:        'show_org_members',
        description: '指定した組織のメンバー一覧をチャット内ウィジェットで視覚表示する。getOrgMembers よりも見やすい形式でユーザーに提示したい場合に使う。',
        parameters: {
          type: 'object',
          required: ['orgCode'],
          properties: {
            orgCode: { type: 'string', description: '組織コード' },
          },
        },
      },
    },
    execute: args => {
      const orgCode = args.orgCode as string
      const org     = aiTools.findOrgs({ code: orgCode })[0]
      const persons = aiTools.findPersons({ orgCode })
      const members: PersonInfo[] = persons.map(p => ({
        userId:  p.userId,
        name:    p.name,
        orgName: p.orgName,
        rowIds:  p.rowIds,
      }))
      const widget: ChatWidget = {
        type:    'org-members',
        orgName: org?.name ?? orgCode,
        members,
      }
      return { summary: { memberCount: members.length }, widget }
    },
  },

  // ── Confirm: propose_bulk_transfer ───────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_bulk_transfer',
        description: '指定した組織の全メンバーを別の組織に一括異動させることをユーザーに提案し、確認を得てから実行する。組織統廃合・改編などで部署全体を移動させるときに使う。実行前に findOrgs で sourceOrgCode と targetOrgCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['sourceOrgCode', 'targetOrgCode'],
          properties: {
            sourceOrgCode: { type: 'string', description: '移動元の組織コード（externalCode）' },
            targetOrgCode: { type: 'string', description: '移動先の組織コード（externalCode）' },
          },
        },
      },
    },
    buildProposal: args => P.buildBulkTransferProposal(args.sourceOrgCode as string, args.targetOrgCode as string),
    executeOnApprove: args => aiTools.executeBulkTransfer(args.sourceOrgCode as string, args.targetOrgCode as string),
  },

  // ── Confirm: propose_field_edit ───────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_field_edit',
        description: '従業員の特定フィールドを変更することをユーザーに提案し、確認を得てから実行する。値を変更する前に getFieldOptions で有効な選択肢を確認すること。実行前に findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId', 'field', 'value'],
          properties: {
            userId: { type: 'string', description: 'ユーザー ID（sfPersonId）' },
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
    buildProposal: args => P.buildFieldEditProposal(args.userId as string, args.field as string, args.value as string),
    executeOnApprove: args => aiTools.executeFieldEdit(args.userId as string, args.field as string, args.value as string),
  },

  // ── Confirm: propose_bulk_set_field ─────────────────────────────────────
  // getValidationDiagnosis の suggestedTool で案内される主要ツール。
  // propose_field_edit の複数行版。diff-preview を再利用。
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

  // ── Confirm: propose_transfer ────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_transfer',
        description: '指定した従業員を別の組織に異動させることをユーザーに提案し、確認を得てから実行する。実行前に findPersons で userId を、findOrgs で targetOrgCode を確認すること。',
        parameters: {
          type: 'object',
          required: ['userIds', 'targetOrgCode'],
          properties: {
            userIds: {
              type:        'array',
              items:       { type: 'string' },
              description: '異動対象のユーザーID（sfPersonId）の一覧',
            },
            targetOrgCode: {
              type:        'string',
              description: '移動先組織の externalCode（findOrgs で取得した値）',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildTransferProposal(args.userIds as string[], args.targetOrgCode as string),
    executeOnApprove: args => aiTools.executeTransferPersons(args.userIds as string[], args.targetOrgCode as string),
  },

  // ── Confirm: propose_promotion ───────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_promotion',
        description: '指定した従業員の昇格をユーザーに提案し、確認を得てから昇格フラグ（promotionSign）を適用する。実行前に findPersons でユーザーIDを確認すること。',
        parameters: {
          type: 'object',
          required: ['userIds'],
          properties: {
            userIds: {
              type:        'array',
              items:       { type: 'string' },
              description: '昇格対象のユーザーID（sfPersonId）の一覧',
            },
          },
        },
      },
    },
    buildProposal: args => P.buildPromotionProposal(args.userIds as string[]),
    executeOnApprove: args => aiTools.executeSetPromotion(args.userIds as string[]),
  },

  // ── Confirm: propose_create_position ─────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_create_position',
        description: '空席ポジションの新規作成をユーザーに提案し、確認を得てから実行する。実行前に findOrgs で orgCode を確認すること。',
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
    buildProposal: args => P.buildCreatePositionProposal(args.orgCode as string, args.localJobTitle as string),
    executeOnApprove: args => {
      const newRowId = aiTools.createVacantPosition(args.orgCode as string, args.localJobTitle as string)
      return { applied: true, localJobTitle: args.localJobTitle, orgCode: args.orgCode, newPositionRowId: newRowId }
    },
  },

  // ── Confirm: propose_assign_person ────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_assign_person',
        description: '空席ポジションに従業員を配属することをユーザーに提案し、確認を得てから実行する。実行前に findVacantPositions で vacantRowId を、findPersons で userId を確認すること。',
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
    buildProposal: args => P.buildAssignPersonProposal(args.vacantRowId as number, args.userId as string),
    executeOnApprove: args => {
      aiTools.assignPersonToVacantPosition(args.vacantRowId as number, args.userId as string)
      return { applied: true, vacantRowId: args.vacantRowId, userId: args.userId }
    },
  },

  // ── Confirm: propose_change_position ─────────────────────────────────────
  // 同一組織内でポジションを作り直す（役職変更）。旧ポジションは削除。
  // TransferPersonOperation を同一組織・retireOriginal=true で呼ぶことで1回のUndoに収める。
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_change_position',
        description: '従業員のポジション（役職名）を変更する。新しいポジションを作成し、元のポジションを削除して1回のUndoで戻せる。「課長にして」「部長から課長へ」のような役職変更に使う。実行前に findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId', 'newJobTitle'],
          properties: {
            userId:      { type: 'string', description: '対象従業員の userId（sfPersonId）' },
            newJobTitle: { type: 'string', description: '新しい役職名（localJobTitle）' },
          },
        },
      },
    },
    buildProposal: args => P.buildChangePositionProposal(args.userId as string, args.newJobTitle as string),
    executeOnApprove: args => aiTools.executeChangePosition(args.userId as string, args.newJobTitle as string),
  },
  // ── Confirm: propose_set_manager_position ────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_set_manager_position',
        description: '上司ポジションコードをユーザーに提案し確認を得てから設定する。managerName も在席者の姓名から自動入力する。実行前に findPersons で対象者の rowId を、findPersons で上司の positionCode を確認すること。',
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
    buildProposal: args => P.buildSetManagerPositionProposal(args.rowId as number, args.managerPositionCode as string),
    executeOnApprove: args => {
      const rowId               = args.rowId as number
      const managerPositionCode = args.managerPositionCode as string
      const result = aiTools.setManagerPosition(rowId, managerPositionCode)
      return result.ok
        ? { applied: true, rowId, managerPositionCode }
        : { ok: false, error: !result.ok && result.errors?.[0]?.message }
    },
  },

  // ── Confirm: propose_re_derive_manager_names ─────────────────────────────
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

  // ── Read: getUnassignedPositions ─────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getUnassignedPositions',
        description: '内部採番コード（_pos_…）のままになっているポジションの一覧を返す。propose_assign_position_codes と組み合わせて外部コードを割り当てるために使う。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => aiTools.getUnassignedPositions(),
  },

  // ── Confirm: propose_assign_position_codes ────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_assign_position_codes',
        description: '内部採番コード（_pos_…）のポジションに外部コード（P + 8桁数字）を割り当てることをユーザーに提案し、確認を得てから実行する。managerPositionCode として参照している行も連動して更新される。実行前に getUnassignedPositions で rowId を確認すること。',
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
    buildProposal: args => P.buildAssignPositionCodesProposal(args.assignments as Array<{ rowId: number; newPositionCode: string }>),
    executeOnApprove: args => {
      const assignments = args.assignments as Array<{ rowId: number; newPositionCode: string }>
      const result = aiTools.assignPositionCodes(assignments)
      return result.ok
        ? { applied: true, count: assignments.length }
        : { ok: false, error: result.errors?.[0]?.message }
    },
  },

  // ── Confirm: propose_re_derive_org_sub_fields ─────────────────────────────
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
]

// ── Public API ────────────────────────────────────────────────────────────────

const entryMap = new Map<string, ToolEntry>(
  TOOL_ENTRIES.map(e => [e.definition.function.name, e])
)

function parseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown> }
  catch { return {} }
}

export const toolRegistry = {
  definitions: TOOL_ENTRIES.map(e => e.definition) as ToolDefinition[],

  getEntry(name: string): ToolEntry | undefined {
    return entryMap.get(name)
  },

  /** read ツール用の便利メソッド（AgentRunner が内部で使う）。 */
  execute(call: ToolCall): ToolResult {
    const entry = entryMap.get(call.function.name)
    const args  = parseArgs(call.function.arguments)
    let result: unknown
    try {
      if (entry?.kind === 'read') {
        result = entry.execute(args)
      } else {
        result = { error: `'${call.function.name}' は read ツールではありません` }
      }
    } catch (e) {
      result = { error: String(e) }
    }
    return { toolCallId: call.id, content: JSON.stringify(result) }
  },
}
