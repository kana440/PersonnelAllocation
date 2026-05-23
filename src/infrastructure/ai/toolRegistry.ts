// Tool registry — exposes aiTools functions as OpenAI function-calling definitions.
//
// Only read-only tools are registered here; write operations (promote, transfer…)
// are confirmed through the existing widget confirmation flow in AIView, so they
// are intentionally excluded from the agentic loop.
//
// To add a new tool: append an entry to TOOL_ENTRIES.

import { aiTools } from '../../application/aiTools'
import { appService } from '../../application/HRApplicationService'
import type { ToolDefinition, ToolCall } from '../../ports'

export interface ToolResult {
  toolCallId: string
  content:    string   // JSON string passed back as a tool message
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOL_DEFS: ToolDefinition[] = [
  {
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
  {
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
  {
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
  {
    type: 'function',
    function: {
      name:        'listChangedRows',
      description: '今のセッションで変更された行を一覧する。変更内容（等級・役職・組織の前後）も含む。',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
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
]

// ── Tool executor ─────────────────────────────────────────────────────────────

function executeTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'findPersons':
      return aiTools.findPersons(args as { name?: string; userId?: string; orgCode?: string })

    case 'findOrgs':
      return aiTools.findOrgs(args as { name?: string; code?: string })

    case 'getPersonDetail': {
      const userId = args.userId as string
      const rows   = aiTools.getPersonRows(userId)
      return rows.map(r => ({
        rowId:              r.rowId,
        name:               [r.lastName, r.firstName].filter(Boolean).join(' '),
        departmentCode:     r.departmentCode,
        grade:              r.prevPayGrade,
        position:           r.prevOfficialPositionCode,
        concurrentType:     r.prevConcurrentType,
        managerPositionCode: r.managerPositionCode,
        positionCode:       r.positionCode,
      }))
    }

    case 'listChangedRows': {
      const { allocationList, afterOrganizations } = appService.getSnapshot()
      return allocationList
        .filter(r => r.operationGroupId)
        .map(r => {
          const orgName = afterOrganizations.find(
            o => (o.externalCode ?? o.id) === r.departmentCode
          )?.name ?? r.departmentCode
          return {
            rowId:  r.rowId,
            userId: r.userId,
            name:   [r.lastName, r.firstName].filter(Boolean).join(' '),
            orgName,
            grade: r.prevPayGrade !== r.payGrade
              ? { before: r.prevPayGrade, after: r.payGrade }
              : null,
            position: r.prevOfficialPositionCode !== r.officialPositionCode
              ? { before: r.prevOfficialPositionCode, after: r.officialPositionCode }
              : null,
          }
        })
    }

    case 'getOrgMembers':
      return aiTools.findPersons({ orgCode: args.orgCode as string })

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export const toolRegistry = {
  definitions: TOOL_DEFS,

  execute(call: ToolCall): ToolResult {
    let result: unknown
    try {
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>
      result = executeTool(call.function.name, args)
    } catch (e) {
      result = { error: String(e) }
    }
    return {
      toolCallId: call.id,
      content:    JSON.stringify(result),
    }
  },
}
