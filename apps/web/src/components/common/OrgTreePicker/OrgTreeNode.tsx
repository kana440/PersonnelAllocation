import type { Organization } from '@personnel/domain/schemas'

interface Props {
  org:               Organization
  depth:             number
  expanded:          Set<string>
  highlighted:       string | null
  alreadyAdded:      Set<string>
  childrenOf:        Map<string | null, Organization[]>
  totalCount:        Map<string, number>
  directCount:       Map<string, number>
  onToggle:          (id: string) => void
  onHighlight:       (id: string) => void
  countLabel:        (id: string) => string
}

export function OrgTreeNode({
  org, depth, expanded, highlighted, alreadyAdded,
  childrenOf, onToggle, onHighlight, countLabel,
}: Props) {
  const kids     = childrenOf.get(org.id) ?? []
  const isOpen   = expanded.has(org.id)
  const isHl     = org.id === highlighted
  const isAdded  = alreadyAdded.has(org.id)

  return (
    <div>
      <div
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={`flex items-center gap-1 pr-2 py-1 cursor-pointer transition-colors text-xs select-none
          ${isHl    ? 'bg-blue-100 text-blue-700'
          : isAdded ? 'text-gray-400 bg-gray-50'
          :           'hover:bg-gray-50 text-gray-700'}`}
        onClick={() => !isAdded && onHighlight(org.id)}
      >
        {kids.length > 0 ? (
          <button
            onClick={e => { e.stopPropagation(); onToggle(org.id) }}
            className="text-gray-400 hover:text-gray-600 w-3 text-[10px] flex-shrink-0"
          >{isOpen ? '▼' : '▶'}</button>
        ) : <span className="w-3 flex-shrink-0" />}
        <span className="flex-1 truncate">{org.name}</span>
        {org.externalCode && (
          <span className="text-gray-300 text-[10px] font-mono flex-shrink-0 mr-1">{org.externalCode}</span>
        )}
        <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">{countLabel(org.id)}</span>
        {isAdded && (
          <span className="ml-1.5 text-[10px] text-gray-400 bg-gray-200 rounded px-1 flex-shrink-0">追加済</span>
        )}
      </div>
      {isOpen && kids.map(c => (
        <OrgTreeNode key={c.id} org={c} depth={depth + 1}
          expanded={expanded} highlighted={highlighted} alreadyAdded={alreadyAdded}
          childrenOf={childrenOf} totalCount={new Map} directCount={new Map}
          onToggle={onToggle} onHighlight={onHighlight} countLabel={countLabel}
        />
      ))}
    </div>
  )
}
