// Tool registry — classifies tools into three kinds and exposes them to AgentRunner.
//
// read    : 即時実行し結果をLLMに返す（副作用なし）
// render  : ウィジェットをUIに表示しつつ要約をLLMに返す（副作用：Widget表示）
// confirm : ユーザーの確認を待ってから操作を適用する（副作用：ドメイン変更）
//
// confirm ツールの実際の実行は AgentRunner の onConfirm コールバック経由で行われ、
// ユーザーが承認した場合のみ executeOnApprove が呼ばれる。

import type { ChatWidget, PersonInfo, PersonDiff, OrgTreeNode } from '../../application/aiTypes'
import { aiTools } from '../../application/aiTools'
import { buildOrgTree } from './scenarios/checkDepartment'
import { appService } from '../../application/HRApplicationService'
import { DirectEditOperation } from '../../domain/operation/handlers/directEdit'
import { BulkMoveToOrgOperation } from '../../domain/operation/handlers/bulkMoveToOrg'
import { reDeriveManagerNamesForList, reDeriveOrgSubFieldsForList } from '../../domain/operation/orgHelpers'
import { CreateVacantPositionOperation, AssignPersonToPositionOperation } from '../../domain/operation/handlers/positionOps'
import { TransferPersonOperation } from '../../domain/operation/handlers/transferPerson'
import { AssignPositionCodesOperation } from '../../domain/operation/handlers/assignPositionCodes'
import type { AfterValues } from '../../domain/allocationRow'
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
  /** ユーザーが承認した後に呼ばれる。IDomainOperation 経由でのみ変更する。 */
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
        description: '指定した userId の従業員の詳細情報を取得する。before（発令前）と after（発令後/現在の変更状態）の両方を返す。promotionSign が設定されていれば昇格済み。',
        parameters: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', description: 'ユーザー ID' },
          },
        },
      },
    },
    execute: args => {
      const { afterOrganizations } = appService.getSnapshot()
      const rows = aiTools.getPersonRows(args.userId as string)
      return rows.map(r => {
        const orgName     = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.departmentCode)?.name
        const prevOrgName = afterOrganizations.find(o => (o.externalCode ?? o.id) === r.prevDepartmentCode)?.name
        return {
          rowId:        r.rowId,
          name:         [r.lastName, r.firstName].filter(Boolean).join(' '),
          concurrentType: r.concurrentType ?? r.prevConcurrentType,
          before: {
            departmentCode: r.prevDepartmentCode,
            orgName:        prevOrgName ?? r.prevDepartmentCode,
            grade:          r.prevPayGrade,
            position:       r.prevOfficialPositionCode,
          },
          after: {
            departmentCode: r.departmentCode,
            orgName:        orgName ?? r.departmentCode,
            grade:          r.payGrade || r.prevPayGrade,
            position:       r.officialPositionCode || r.prevOfficialPositionCode,
          },
          promotionSign:       r.promotionSign       || undefined,
          managerPositionCode: r.managerPositionCode || undefined,
          positionCode:        r.positionCode        || undefined,
        }
      })
    },
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
    execute: () => {
      const { allocationList, afterOrganizations } = appService.getSnapshot()
      return allocationList
        .filter(r => r.operationGroupId)
        .map(r => {
          const orgName = afterOrganizations.find(
            o => (o.externalCode ?? o.id) === r.departmentCode
          )?.name ?? r.departmentCode
          return {
            rowId:    r.rowId,
            userId:   r.userId,
            name:     [r.lastName, r.firstName].filter(Boolean).join(' '),
            orgName,
            grade:    r.prevPayGrade !== r.payGrade
              ? { before: r.prevPayGrade, after: r.payGrade } : null,
            position: r.prevOfficialPositionCode !== r.officialPositionCode
              ? { before: r.prevOfficialPositionCode, after: r.officialPositionCode } : null,
          }
        })
    },
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
      const { afterOrganizations } = appService.getSnapshot()
      const rootCode   = args.rootOrgCode as string | undefined
      const allPersons = aiTools.findPersons({})

      const rootOrg = rootCode
        ? afterOrganizations.find(o => o.externalCode === rootCode || o.id === rootCode)
        : afterOrganizations.find(o => !o.parentId && !o.isAbandoned)

      if (!rootOrg) return {
        summary: { error: rootCode ? `組織コード "${rootCode}" が見つかりません` : '組織データがありません' },
        widget:  { type: 'org-members', orgName: '（不明）', members: [] } as ChatWidget,
      }

      const tree: OrgTreeNode = buildOrgTree(rootOrg, afterOrganizations, allPersons)

      function countTotal(node: OrgTreeNode): number {
        return node.members.length + node.children.reduce((s, c) => s + countTotal(c), 0)
      }

      const widget: ChatWidget = { type: 'org-tree', orgName: rootOrg.name, tree }
      return { summary: { orgName: rootOrg.name, totalMembers: countTotal(tree) }, widget }
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
      appService.undo()
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
    buildProposal: args => {
      const sourceCode = args.sourceOrgCode as string
      const targetCode = args.targetOrgCode as string
      const { allocationList, afterOrganizations } = appService.getSnapshot()
      const sourceOrg = afterOrganizations.find(o => o.externalCode === sourceCode || o.id === sourceCode)
      const targetOrg = afterOrganizations.find(o => o.externalCode === targetCode || o.id === targetCode)
      const persons: PersonDiff[] = allocationList
        .filter(r => r.departmentCode === sourceCode && r.userId)
        .map(r => ({
          userId:  r.userId!,
          name:    [r.lastName, r.firstName].filter(Boolean).join(' '),
          orgName: sourceOrg?.name ?? sourceCode,
          rowId:   r.rowId,
          before:  { orgName: sourceOrg?.name ?? sourceCode },
          after:   { orgName: targetOrg?.name ?? targetCode },
        }))
      const widget: ChatWidget = { type: 'diff-preview', persons, label: '一括異動の確認' }
      return { widget }
    },
    executeOnApprove: args => {
      const sourceCode = args.sourceOrgCode as string
      const targetCode = args.targetOrgCode as string
      const { afterOrganizations } = appService.getSnapshot()
      const sourceOrg = afterOrganizations.find(o => o.externalCode === sourceCode || o.id === sourceCode)
      const targetOrg = afterOrganizations.find(o => o.externalCode === targetCode || o.id === targetCode)
      if (!sourceOrg) return { ok: false, error: '移動元組織が見つかりません' }
      if (!targetOrg) return { ok: false, error: '移動先組織が見つかりません' }
      const label  = `${sourceOrg.name} 全員 → ${targetOrg.name} 一括異動`
      const result = appService.executeOperation(new BulkMoveToOrgOperation(sourceOrg.id, targetOrg.id, label))
      return result.ok
        ? { applied: true, sourceOrgName: sourceOrg.name, targetOrgName: targetOrg.name }
        : { ok: false, error: !result.ok && result.errors?.[0]?.message }
    },
  },

  // ── Confirm: propose_field_edit ───────────────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_field_edit',
        description: '従業員の特定フィールドを変更することをユーザーに提案し、確認を得てから実行する。実行前に findPersons で userId を確認すること。',
        parameters: {
          type: 'object',
          required: ['userId', 'field', 'value'],
          properties: {
            userId: { type: 'string', description: 'ユーザー ID（sfPersonId）' },
            field: {
              type: 'string',
              enum: ['localJobTitle', 'band', 'payGrade', 'officialPositionCode', 'transferReason'],
              description: '変更するフィールド名',
            },
            value: { type: 'string', description: '新しい値（空文字で削除）' },
          },
        },
      },
    },
    buildProposal: args => {
      const userId = args.userId as string
      const field  = args.field  as string
      const value  = args.value  as string
      const LABELS: Record<string, string> = {
        localJobTitle: '役職名', band: 'バンド', payGrade: '給与等級',
        officialPositionCode: '役職コード', transferReason: '異動事由',
      }
      const { afterOrganizations } = appService.getSnapshot()
      const rows    = aiTools.getPersonRows(userId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      if (!primary) return { widget: { type: 'diff-preview', persons: [] } as ChatWidget }
      const org          = afterOrganizations.find(o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode)
      const currentValue = String(primary[field as keyof typeof primary] ?? '')
      const isGrade      = field === 'band' || field === 'payGrade'
      const person: PersonDiff = {
        userId, rowId: primary.rowId,
        name:    [primary.lastName, primary.firstName].filter(Boolean).join(' '),
        orgName: org?.name ?? primary.departmentCode ?? '',
        before:  isGrade ? { grade: `${LABELS[field]}: ${currentValue || '（未設定）'}` } : { position: `${LABELS[field]}: ${currentValue || '（未設定）'}` },
        after:   isGrade ? { grade: value || '（削除）' }                                 : { position: value || '（削除）' },
      }
      return { widget: { type: 'diff-preview', persons: [person], label: 'フィールド変更の確認' } as ChatWidget }
    },
    executeOnApprove: args => {
      const userId = args.userId as string
      const field  = args.field  as string
      const value  = args.value  as string
      const LABELS: Record<string, string> = {
        localJobTitle: '役職名', band: 'バンド', payGrade: '給与等級',
        officialPositionCode: '役職コード', transferReason: '異動事由',
      }
      const ALLOWED = new Set(Object.keys(LABELS))
      if (!ALLOWED.has(field)) return { ok: false, error: `フィールド "${field}" は編集できません` }
      const rows    = aiTools.getPersonRows(userId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      if (!primary) return { ok: false, error: 'ユーザーが見つかりません' }
      const name    = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
      const changes = { [field]: value || undefined } as AfterValues
      const label   = `${name} ${LABELS[field]}: ${value || '（削除）'}`
      const result  = appService.executeOperation(new DirectEditOperation(primary.rowId, changes, label))
      return result.ok
        ? { applied: true, name, field: LABELS[field], value }
        : { ok: false, error: !result.ok && result.errors?.[0]?.message }
    },
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
    buildProposal: args => {
      const rowIds = args.rowIds as number[]
      const field  = args.field  as string
      const value  = args.value  as string
      const { allocationList, afterOrganizations } = appService.getSnapshot()
      const persons: PersonDiff[] = rowIds.flatMap(rowId => {
        const row = allocationList.find(r => r.rowId === rowId)
        if (!row) return []
        const org    = afterOrganizations.find(o => o.externalCode === row.departmentCode || o.id === row.departmentCode)
        const before = String(row[field as keyof typeof row] ?? '')
        return [{
          userId:  row.userId ?? '',
          name:    ([row.lastName, row.firstName].filter(Boolean).join(' ') || row.positionCode) ?? '',
          orgName: org?.name ?? row.departmentCode ?? '',
          rowId,
          before: { position: before || '（未設定）' },
          after:  { position: value  || '（クリア）' },
        }] satisfies PersonDiff[]
      })
      const label = `${field} を ${value || '（クリア）'} に一括設定（${persons.length}行）`
      return { widget: { type: 'diff-preview', persons, label } as ChatWidget }
    },
    executeOnApprove: args => {
      const rowIds = args.rowIds as number[]
      const field  = args.field  as string
      const value  = args.value  as string
      const BLOCKED = new Set(['userId', 'employeeNumber', 'rowId', 'positionCode', 'prevPositionCode'])
      if (BLOCKED.has(field)) return { ok: false, error: `フィールド "${field}" は一括変更できません` }
      let applied = 0, failed = 0
      for (const rowId of rowIds) {
        const changes = { [field]: value || undefined } as AfterValues
        const result  = appService.executeOperation(new DirectEditOperation(rowId, changes, `${field}: ${value || '（クリア）'}`))
        result.ok ? applied++ : failed++
      }
      return { applied: true, appliedCount: applied, failedCount: failed }
    },
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
    buildProposal: args => {
      const userIds       = args.userIds as string[]
      const targetOrgCode = args.targetOrgCode as string
      const { afterOrganizations } = appService.getSnapshot()
      const targetOrg = afterOrganizations.find(
        o => o.externalCode === targetOrgCode || o.id === targetOrgCode
      )
      const persons: PersonDiff[] = userIds.flatMap(userId => {
        const rows    = aiTools.getPersonRows(userId)
        const primary = rows.find(r => !r.concurrentType) ?? rows[0]
        if (!primary) return []
        const currentOrg = afterOrganizations.find(
          o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode
        )
        return [{
          userId,
          name:    [primary.lastName, primary.firstName].filter(Boolean).join(' '),
          orgName: currentOrg?.name ?? primary.departmentCode ?? '',
          rowId:   primary.rowId,
          before:  { orgName: currentOrg?.name ?? primary.departmentCode ?? '' },
          after:   { orgName: targetOrg?.name ?? targetOrgCode },
        }]
      })
      const widget: ChatWidget = { type: 'diff-preview', persons, label: '異動の確認' }
      return { widget }
    },
    executeOnApprove: args => {
      const userIds       = args.userIds as string[]
      const targetOrgCode = args.targetOrgCode as string
      const { afterOrganizations } = appService.getSnapshot()
      const targetOrg = afterOrganizations.find(
        o => o.externalCode === targetOrgCode || o.id === targetOrgCode
      )
      if (!targetOrg) return { ok: false, error: '移動先組織が見つかりません' }

      let applied = 0
      const errors: string[] = []
      for (const userId of userIds) {
        const rows    = aiTools.getPersonRows(userId)
        const primary = rows.find(r => !r.concurrentType) ?? rows[0]
        if (!primary) continue
        const result = appService.executeOperation(
          new TransferPersonOperation(primary.rowId, targetOrg.id, false)
        )
        if (result.ok) applied++
        else errors.push(result.errors?.[0]?.message ?? 'エラー')
      }

      if (applied === 0) return { ok: false, error: errors[0] ?? '対象行が見つかりません' }
      return { applied, targetOrgName: targetOrg.name, errors: errors.length ? errors : undefined }
    },
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
    buildProposal: args => {
      const userIds = args.userIds as string[]
      const { afterOrganizations } = appService.getSnapshot()
      const persons: PersonDiff[] = userIds.flatMap(userId => {
        const rows    = aiTools.getPersonRows(userId)
        const primary = rows.find(r => !r.concurrentType) ?? rows[0]
        if (!primary) return []
        const org = afterOrganizations.find(
          o => (o.externalCode ?? o.id) === primary.departmentCode
        )
        return [{
          userId,
          name:    [primary.lastName, primary.firstName].filter(Boolean).join(' '),
          orgName: org?.name ?? primary.departmentCode,
          rowId:   primary.rowId,
          before:  { grade: primary.prevPayGrade, position: primary.prevOfficialPositionCode },
          after:   { note: '昇格' },
        }]
      })
      const widget: ChatWidget = { type: 'diff-preview', persons, label: '昇格の確認' }
      return { widget }
    },
    executeOnApprove: args => {
      const userIds = args.userIds as string[]
      let applied = 0
      for (const userId of userIds) {
        const rows    = aiTools.getPersonRows(userId)
        const primary = rows.find(r => !r.concurrentType) ?? rows[0]
        if (!primary) continue
        const name   = [primary.lastName, primary.firstName].filter(Boolean).join(' ')
        const result = appService.executeOperation(
          new DirectEditOperation(primary.rowId, { promotionSign: '昇格' }, `${name} 昇格`)
        )
        if (result.ok) applied++
      }
      return { applied, total: userIds.length }
    },
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
    buildProposal: args => {
      const orgCode       = args.orgCode as string
      const localJobTitle = args.localJobTitle as string
      const { afterOrganizations } = appService.getSnapshot()
      const org = afterOrganizations.find(o => o.externalCode === orgCode || o.id === orgCode)
      const person: PersonDiff = {
        userId: '', name: `（空席）${localJobTitle}`, rowId: -1,
        orgName: org?.name ?? orgCode,
        before: { position: '（なし）' },
        after:  { position: localJobTitle },
      }
      const widget: ChatWidget = { type: 'diff-preview', persons: [person], label: '空席ポジション作成の確認' }
      return { widget }
    },
    executeOnApprove: args => {
      const orgCode       = args.orgCode as string
      const localJobTitle = args.localJobTitle as string
      const result = appService.executeOperation(
        new CreateVacantPositionOperation(orgCode, localJobTitle)
      )
      if (!result.ok) return { ok: false, error: result.errors?.[0]?.message }
      const snap     = appService.getSnapshot()
      const newRow   = [...snap.allocationList].reverse().find(r => !r.userId && r.departmentCode === orgCode)
      return { applied: true, localJobTitle, orgCode, newPositionRowId: newRow?.rowId }
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
    buildProposal: args => {
      const vacantRowId = args.vacantRowId as number
      const userId      = args.userId as string
      const { allocationList, afterOrganizations } = appService.getSnapshot()
      const vacantRow = allocationList.find(r => r.rowId === vacantRowId)
      const personRows = aiTools.getPersonRows(userId)
      const primary    = personRows.find(r => !r.concurrentType) ?? personRows[0]
      const org = afterOrganizations.find(o => o.externalCode === vacantRow?.departmentCode || o.id === vacantRow?.departmentCode)
      const person: PersonDiff = {
        userId, rowId: vacantRowId,
        name:    primary ? [primary.lastName, primary.firstName].filter(Boolean).join(' ') : userId,
        orgName: org?.name ?? vacantRow?.departmentCode ?? '',
        before:  { position: '未配属' },
        after:   { position: vacantRow?.localJobTitle ?? '（役職名なし）' },
      }
      const widget: ChatWidget = { type: 'diff-preview', persons: [person], label: '配属の確認' }
      return { widget }
    },
    executeOnApprove: args => {
      const vacantRowId = args.vacantRowId as number
      const userId      = args.userId as string
      const result = appService.executeOperation(
        new AssignPersonToPositionOperation(vacantRowId, userId)
      )
      return result.ok
        ? { applied: true, vacantRowId, userId }
        : { ok: false, error: !result.ok && result.errors?.[0]?.message }
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
    buildProposal: args => {
      const userId      = args.userId as string
      const newJobTitle = args.newJobTitle as string
      const rows    = aiTools.getPersonRows(userId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      const { afterOrganizations } = appService.getSnapshot()
      const org = afterOrganizations.find(o => o.externalCode === primary?.departmentCode || o.id === primary?.departmentCode)
      const person: PersonDiff = {
        userId, rowId: primary?.rowId ?? -1,
        name:    primary ? [primary.lastName, primary.firstName].filter(Boolean).join(' ') : userId,
        orgName: org?.name ?? primary?.departmentCode ?? '',
        before:  { position: primary?.localJobTitle ?? primary?.officialPositionCode ?? '（未設定）' },
        after:   { position: newJobTitle },
      }
      return { widget: { type: 'diff-preview', persons: [person], label: '役職変更の確認' } as ChatWidget }
    },
    executeOnApprove: args => {
      const userId      = args.userId as string
      const newJobTitle = args.newJobTitle as string
      const rows    = aiTools.getPersonRows(userId)
      const primary = rows.find(r => !r.concurrentType) ?? rows[0]
      if (!primary) return { ok: false, error: '対象行が見つかりません' }

      const { afterOrganizations } = appService.getSnapshot()
      const targetOrg = afterOrganizations.find(
        o => o.externalCode === primary.departmentCode || o.id === primary.departmentCode
      )
      if (!targetOrg) return { ok: false, error: '所属組織が見つかりません' }

      const result = appService.executeOperation(
        new TransferPersonOperation(primary.rowId, targetOrg.id, true, { localJobTitle: newJobTitle })
      )
      return result.ok
        ? { applied: true, newJobTitle, orgName: targetOrg.name }
        : { ok: false, error: result.errors?.[0]?.message }
    },
  },
  // ── Confirm: propose_set_manager_position ────────────────────────────────
  {
    kind: 'confirm',
    definition: {
      type: 'function',
      function: {
        name:        'propose_set_manager_position',
        description: '上司ポジションコードをユーザーに提案し確認を得てから設定する。managerName も在席者の姓名から自動入力する。実行前に findPersons / getPersonRows で rowId と managerPositionCode（相手のポジションコード）を確認すること。',
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
    buildProposal: args => {
      const rowId               = args.rowId as number
      const managerPositionCode = args.managerPositionCode as string
      const { allocationList, afterOrganizations } = appService.getSnapshot()
      const targetRow = allocationList.find(r => r.rowId === rowId)
      const mgrRow    = allocationList.find(r => r.positionCode === managerPositionCode)
      const mgrName   = mgrRow
        ? [mgrRow.lastName, mgrRow.firstName].filter(Boolean).join(', ')
        : managerPositionCode
      const org = afterOrganizations.find(
        o => o.externalCode === targetRow?.departmentCode || o.id === targetRow?.departmentCode
      )
      const person: PersonDiff = {
        userId:  targetRow?.userId ?? '',
        rowId,
        name:    targetRow ? [targetRow.lastName, targetRow.firstName].filter(Boolean).join(' ') : String(rowId),
        orgName: org?.name ?? targetRow?.departmentCode ?? '',
        before:  { position: targetRow?.managerPositionCode ?? '（未設定）' },
        after:   { position: managerPositionCode, orgName: mgrName },
      }
      return { widget: { type: 'diff-preview', persons: [person], label: '上司ポジション設定の確認' } as ChatWidget }
    },
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
    buildProposal: () => {
      const { allocationList, afterOrganizations } = appService.getSnapshot()
      const updated = reDeriveManagerNamesForList(allocationList)
      const persons: PersonDiff[] = allocationList
        .map((r, i) => ({ r, u: updated[i] }))
        .filter(({ r, u }) => r !== u)
        .map(({ r, u }) => ({
          userId:  r.userId ?? '',
          name:    ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.positionCode) ?? '',
          orgName: afterOrganizations.find(o => o.externalCode === r.departmentCode)?.name ?? r.departmentCode ?? '',
          rowId:   r.rowId,
          before:  { position: (r.managerName ?? '') || '（未設定）' },
          after:   { position: (u.managerName ?? '') || '（未設定）' },
        }))
      const label = persons.length > 0
        ? `上司姓名 一括再導出（${persons.length}行が対象）`
        : '変更対象の行はありません'
      return { widget: { type: 'diff-preview', persons, label } as ChatWidget }
    },
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
    buildProposal: args => {
      const assignments = args.assignments as Array<{ rowId: number; newPositionCode: string }>
      const positions   = aiTools.getUnassignedPositions()
      const { afterOrganizations } = appService.getSnapshot()
      const persons: PersonDiff[] = assignments.flatMap(({ rowId, newPositionCode }) => {
        const pos = positions.find(p => p.rowId === rowId)
        if (!pos) return []
        const org = afterOrganizations.find(o => (o.externalCode ?? o.id) === pos.departmentCode)
        return [{
          userId:  '',
          name:    pos.localJobTitle || `（rowId: ${rowId}）`,
          orgName: org?.name ?? pos.orgName,
          rowId,
          before:  { position: pos.positionCode },
          after:   { position: newPositionCode },
        }] satisfies PersonDiff[]
      })
      const label = `ポジションコード割当（${persons.length}件）`
      return { widget: { type: 'diff-preview', persons, label } as ChatWidget }
    },
    executeOnApprove: args => {
      const assignments = args.assignments as Array<{ rowId: number; newPositionCode: string }>
      const result = appService.executeOperation(new AssignPositionCodesOperation(assignments))
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
    buildProposal: () => {
      const { allocationList, afterOrganizations, codeLists } = appService.getSnapshot()
      const updated = reDeriveOrgSubFieldsForList(allocationList, codeLists)
      const persons: PersonDiff[] = allocationList
        .map((r, i) => ({ r, u: updated[i] }))
        .filter(({ r, u }) => r !== u)
        .map(({ r, u }) => ({
          userId:  r.userId ?? '',
          name:    ([r.lastName, r.firstName].filter(Boolean).join(' ') || r.positionCode) ?? '',
          orgName: afterOrganizations.find(o => o.externalCode === r.departmentCode)?.name ?? r.departmentCode ?? '',
          rowId:   r.rowId,
          before:  { orgName: r.businessUnit ?? r.departmentCode ?? '' },
          after:   { orgName: (u.businessUnit ?? u.departmentCode ?? '') },
        }))
      const label = persons.length > 0
        ? `組織サブフィールド 一括再導出（${persons.length}行が対象）`
        : '変更対象の行はありません'
      return { widget: { type: 'diff-preview', persons, label } as ChatWidget }
    },
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
