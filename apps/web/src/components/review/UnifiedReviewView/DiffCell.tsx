interface Props { after: string; before: string }

export function DiffCell({ after, before }: Props) {
  const changed = after !== before
  if (!changed) {
    return (
      <td className="px-2 py-1.5 text-xs border-b border-gray-100 whitespace-nowrap">
        {after ? <span className="text-gray-600">{after}</span> : <span className="text-gray-300">—</span>}
      </td>
    )
  }
  return (
    <td className="px-2 py-1.5 text-xs border-b border-gray-100 whitespace-nowrap">
      <div className="flex flex-col gap-0.5">
        <span className="text-blue-600 font-medium">{after || '—'}</span>
        <span className="text-gray-400 line-through text-[10px]">{before || '—'}</span>
      </div>
    </td>
  )
}
