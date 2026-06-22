// toolRegistry/renderTools.ts — render ツール群（ウィジェット表示）
//
// オーナー: AI 開発者
// 変更方針: AI がチャット内にウィジェットを表示するツールを追加するときはこのファイルを編集する。
// render ツールは summary（LLMへのテキスト返却）と widget（UI表示）の両方を返す。

import type { ChatWidget, PersonInfo } from '../../../application/aiTypes'
import { aiTools }                     from '../../../application/aiTools'
import type { RenderEntry }            from './types'

export const RENDER_TOOLS: RenderEntry[] = [

  // ── getOrgTree ─────────────────────────────────────────────────────────────
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

  // ── show_org_members ───────────────────────────────────────────────────────
  {
    kind: 'render',
    definition: {
      type: 'function',
      function: {
        name:        'show_org_members',
        description: 'メンバー一覧をチャット内ウィジェットで視覚表示する。orgCode（直属メンバーのみ）か subtreeOrgCode（配下組織も含む）のどちらかを指定する。「この組織のメンバーを見せて」「配下全員を確認したい」のような表示リクエストに使う。',
        parameters: {
          type: 'object',
          properties: {
            orgCode:        { type: 'string', description: '組織コード（直属メンバーのみ）' },
            subtreeOrgCode: { type: 'string', description: '組織コード（配下組織も含む）。findOrgs で取得した orgCode を渡す。' },
          },
        },
      },
    },
    execute: args => {
      const orgCode        = args.orgCode        as string | undefined
      const subtreeOrgCode = args.subtreeOrgCode as string | undefined
      const targetCode     = subtreeOrgCode ?? orgCode ?? ''

      const org     = aiTools.findOrgs({ code: targetCode })[0]
      const persons = subtreeOrgCode
        ? aiTools.findPersons({ subtreeOrgCode })
        : aiTools.findPersons({ filter: { departmentCode: orgCode ?? '' } })

      const members: PersonInfo[] = persons.map(p => ({
        userId:  p.userId,
        name:    p.name,
        orgName: p.positions[0]?.orgName,
        rowIds:  p.positions.map(pos => pos.rowId),
      }))
      const widget: ChatWidget = {
        type:    'org-members',
        orgName: org?.orgName ?? targetCode,
        members,
      }
      return { summary: { memberCount: members.length }, widget }
    },
  },
]
