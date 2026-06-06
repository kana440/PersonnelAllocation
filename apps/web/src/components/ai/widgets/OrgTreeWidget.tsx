import type { OrgTreeNode } from '../../../application/aiTypes'
import { OrgTree } from '../../shared/OrgTree'

interface Props {
  orgName: string
  tree: OrgTreeNode
}

export function OrgTreeWidget({ orgName, tree }: Props) {
  return (
    <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-100">
        {orgName} の組織ツリー
      </div>
      <div className="px-1 py-1 max-h-80 overflow-y-auto">
        <OrgTree node={tree} defaultExpanded={true} />
      </div>
    </div>
  )
}
