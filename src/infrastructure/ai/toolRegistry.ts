// Tool registry — classifies tools into three kinds and exposes them to AgentRunner.
//
// read    : 即時実行し結果をLLMに返す（副作用なし）
// render  : ウィジェットをUIに表示しつつ要約をLLMに返す（副作用：Widget表示）
// confirm : ユーザーの確認を待ってから操作を適用する（副作用：ドメイン変更）
//
// confirm ツールの実際の実行は AgentRunner の onConfirm コールバック経由で行われ、
// ユーザーが承認した場合のみ executeOnApprove が呼ばれる。

import type { ChatWidget, PersonInfo, PersonDiff } from '../../application/aiTypes'
import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import { DirectEditOperation } from '../../domain/operation/handlers/directEdit'
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
        description: '指定した userId の従業員の詳細情報（現在の等級・役職・組織・上長ポジションコード）を取得する。',
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
      const rows = aiTools.getPersonRows(args.userId as string)
      return rows.map(r => ({
        rowId:               r.rowId,
        name:                [r.lastName, r.firstName].filter(Boolean).join(' '),
        departmentCode:      r.departmentCode,
        grade:               r.prevPayGrade,
        position:            r.prevOfficialPositionCode,
        concurrentType:      r.prevConcurrentType,
        managerPositionCode: r.managerPositionCode,
        positionCode:        r.positionCode,
      }))
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
      const widget: ChatWidget = { type: 'diff-preview', persons }
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
