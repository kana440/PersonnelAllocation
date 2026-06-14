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
import { SecondmentOutReleaseOperation } from '@personnel/domain/commands/handlers/secondmentOps'
import { ConcurrentSecondmentOutOperation } from '@personnel/domain/commands/handlers/secondmentOps'
import { EmploymentTransferOutOperation } from '@personnel/domain/commands/handlers/personOps'
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
  /**
   * ユーザーに見せる確認ウィジェットを構築する（副作用なし）。
   * 前提条件を満たさない場合は `{ error: string }` を返す。
   * AgentRunner はエラーをツール結果として LLM に返し、widget は表示しない。
   */
  buildProposal(args: Record<string, unknown>): { widget: ChatWidget } | { error: string }
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
        description: '指定した userId の従業員の詳細情報を全フィールド取得する。兼務・出向がある場合は複数行を返す。before（発令前）と after（発令後）を含む。promotionSign="1"→昇降格、leaveOfAbsenceSign="1"→休職、secondmentToCompany→出向先会社、secondmentFromCompany→出向元会社。',
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

  // ── Read: searchPersons ──────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'searchPersons',
        description: '複数条件で従業員を一括検索し、全フィールドを返す（1人1エントリ・本務行ベース）。「この組織の従業員を教えて」「休職中の人は誰？」「出向中の人を全員」など、属性で絞り込んで一覧したいときに使う。findPersons の上位版で、追加の API 呼び出し不要で全詳細を取得できる。',
        parameters: {
          type: 'object',
          properties: {
            name:       { type: 'string',  description: '氏名（部分一致）' },
            userId:     { type: 'string',  description: 'userId（部分一致）' },
            orgCode:    { type: 'string',  description: '所属組織コード（完全一致）' },
            hasChanges: { type: 'boolean', description: 'true のとき変更ありの人のみ返す' },
            hasErrors:  { type: 'boolean', description: 'true のときバリデーションエラーありの人のみ返す' },
            where: {
              type: 'object',
              description: 'フィールド名:値 の追加絞り込み（完全一致）。例: { "leaveOfAbsenceSign": "1" } で休職中のみ、{ "secondmentToCompany": "ABC社" } で出向先で絞り込み。使えるフィールド: leaveOfAbsenceSign, promotionSign, employmentType, band, payGrade, officialPositionCode, secondmentToCompany, secondmentFromCompany, concurrentType, transferReason, location など。',
              additionalProperties: { type: 'string' },
            },
            limit:  { type: 'number', description: '最大取得件数（デフォルト200）' },
            offset: { type: 'number', description: 'ページング開始位置（デフォルト0）' },
          },
        },
      },
    },
    execute: args => aiTools.searchPersons(args as {
      name?: string; userId?: string; orgCode?: string
      hasChanges?: boolean; hasErrors?: boolean
      where?: Record<string, string>
      limit?: number; offset?: number
    }),
  },

  // ── Read: getReviewSummary ───────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'getReviewSummary',
        description: '変更件数のサマリーを返す。totalRows（全行数）・changedRows（変更行数）・byKind（変更種別ごとの件数）・errorCount・warningCount が含まれる。「今月の変更を教えて」「変更の概要は？」のような質問にはまずこれを呼ぶ。件数が多くてもこのツールは安全（集計値のみ返す）。',
        parameters: { type: 'object', properties: {} },
      },
    },
    execute: () => aiTools.getReviewSummary(),
  },

  // ── Read: listChangedRows ────────────────────────────────────────────────
  {
    kind: 'read',
    definition: {
      type: 'function',
      function: {
        name:        'listChangedRows',
        description: '変更のある行を一覧する（最大100件）。totalCount と truncated フラグを含むので件数が多い場合は「N件中100件を表示」と案内できる。詳細確認が必要な場合に getReviewSummary の後で呼ぶ。kinds フィルタは getChangedPersons を使うこと。',
        parameters: {
          type: 'object',
          properties: {
            limit:  { type: 'number', description: '取得件数（デフォルト100、最大100）' },
            offset: { type: 'number', description: 'ページング開始位置（デフォルト0）' },
          },
        },
      },
    },
    execute: args => aiTools.listChangedRows({ limit: args.limit as number | undefined, offset: args.offset as number | undefined }),
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

  // ── Confirm: propose_leave_of_absence ─────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_leave_of_absence',
        description: '指定した従業員を休職させることをユーザーに提案し、確認を得てから leaveOfAbsenceSign を "1" に設定する。実行前に findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', description: '休職対象のユーザーID（sfPersonId）' },
            memo:   { type: 'string', description: '休職事由（任意）' },
          },
        },
      },
    },
    buildProposal: args => P.buildLeaveOfAbsenceProposal(args.userId as string, args.memo as string | undefined),
    executeOnApprove: args => aiTools.executeLeaveOfAbsence(args.userId as string, args.memo as string | undefined),
  },

  // ── Confirm: propose_return_from_leave ────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_return_from_leave',
        description: '指定した従業員を復職させることをユーザーに提案し、確認を得てから leaveOfAbsenceSign をクリアする。実行前に findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', description: '復職対象のユーザーID（sfPersonId）' },
          },
        },
      },
    },
    buildProposal: args => P.buildReturnFromLeaveProposal(args.userId as string),
    executeOnApprove: args => aiTools.executeReturnFromLeave(args.userId as string),
  },

  // ── Confirm: propose_concurrent_add ──────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_add',
        description: '指定した従業員に社内兼務を追加することをユーザーに提案し、確認を得てから兼務行を新規作成する。実行前に findPersons・findOrgs で ID を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId', 'targetOrgCode'],
          properties: {
            userId:          { type: 'string', description: '兼務追加対象のユーザーID（sfPersonId）' },
            targetOrgCode:   { type: 'string', description: '兼務先組織の externalCode' },
            concurrentReason:{ type: 'string', description: '兼務理由（任意）' },
          },
        },
      },
    },
    buildProposal: args => P.buildConcurrentAddProposal(args.userId as string, args.targetOrgCode as string, args.concurrentReason as string | undefined),
    executeOnApprove: args => aiTools.executeConcurrentAdd(args.userId as string, args.targetOrgCode as string, args.concurrentReason as string | undefined),
  },

  // ── Confirm: propose_concurrent_release ──────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_concurrent_release',
        description: '指定した従業員の社内兼務を解除することをユーザーに提案し、確認を得てから兼務行を削除する。出向兼務は対象外（出向解除を使うこと）。実行前に findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId:        { type: 'string', description: '兼務解除対象のユーザーID（sfPersonId）' },
            targetOrgCode: { type: 'string', description: '兼務先組織コード（兼務が複数ある場合に指定）' },
          },
        },
      },
    },
    buildProposal: args => P.buildConcurrentReleaseProposal(args.userId as string, args.targetOrgCode as string | undefined),
    executeOnApprove: args => aiTools.executeConcurrentRelease(args.userId as string, args.targetOrgCode as string | undefined),
  },

  // ── Confirm: propose_secondment_to_concurrent ─────────────────────────────
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

      return aiTools.executeScenario({
        label: `本務出向→兼務出向: ${[row.lastName, row.firstName].filter(Boolean).join(' ')}`,
        commands: [
          new SecondmentOutReleaseOperation(rowId, { departmentCode: homeDeptCode }),
          new ConcurrentSecondmentOutOperation(rowId, {
            secondmentToCompany,
            departmentCode:    secondmentDeptCode,
            concurrentReason:  args.concurrentReason as string | undefined,
          }),
        ],
      })
    },
  },

  // ── Confirm: propose_secondment_transfer ──────────────────────────────────
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

      return aiTools.executeScenario({
        label: `出向先転籍: ${[row.lastName, row.firstName].filter(Boolean).join(' ')}`,
        commands: [
          new SecondmentOutReleaseOperation(rowId, { departmentCode: homeDeptCode }),
          new EmploymentTransferOutOperation(rowId, transferReason),
        ],
      })
    },
  },

  // ── Confirm: propose_demotion ─────────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_demotion',
        description: '指定した従業員の降格をユーザーに提案し、確認を得てから役職・バンド等を変更する。実行前に findPersons でユーザーID を、getFieldOptions で有効な値を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId:               { type: 'string', description: '降格対象のユーザーID（sfPersonId）' },
            officialPositionCode: { type: 'string', description: '新しい役職コード' },
            localJobTitle:        { type: 'string', description: '新しい役職名' },
            band:                 { type: 'string', description: '新しいバンド' },
            payGrade:             { type: 'string', description: '新しい給与等級' },
            demotionReason:       { type: 'string', description: '降格理由（必須）' },
          },
        },
      },
    },
    buildProposal: args => P.buildDemotionProposal(args.userId as string, {
      officialPositionCode: args.officialPositionCode as string | undefined,
      localJobTitle:        args.localJobTitle        as string | undefined,
      band:                 args.band                 as string | undefined,
      payGrade:             args.payGrade              as string | undefined,
      demotionReason:       args.demotionReason        as string | undefined,
    }),
    executeOnApprove: args => aiTools.executeDemotionForUser(args.userId as string, {
      officialPositionCode: args.officialPositionCode as string | undefined,
      localJobTitle:        args.localJobTitle        as string | undefined,
      band:                 args.band                 as string | undefined,
      payGrade:             args.payGrade              as string | undefined,
      demotionReason:       args.demotionReason        as string | undefined,
    }),
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
  get definitions(): ToolDefinition[] {
    return TOOL_ENTRIES.map(e => e.definition)
  },

  getEntry(name: string): ToolEntry | undefined {
    return entryMap.get(name)
  },

  /**
   * DB から取得したスキル定義で tool description を上書きする。
   * active な skill_def がある toolName のみ反映。起動時に一度だけ呼ぶ。
   */
  applyDescriptionOverrides(overrides: Record<string, string>): void {
    for (const entry of TOOL_ENTRIES) {
      const desc = overrides[entry.definition.function.name]
      if (desc) entry.definition.function.description = desc
    }
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
