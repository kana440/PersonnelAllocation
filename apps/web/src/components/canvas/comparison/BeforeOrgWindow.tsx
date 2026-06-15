import { useMemo, useState } from 'react'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization, Person } from '@personnel/domain/schemas'
import { useOrgView } from '../OrgViewContext'
import { useStore } from '../../../store/useStore'
import { useCanvasLayoutStore } from '../../../store/canvasLayoutStore'

const DRAG_TYPE = 'org-mapping'

export interface OrgMappingDragData {
  dragType: 'org-mapping'
  beforeOrgId: string
}

export function parseOrgMappingDrag(e: React.DragEvent | DragEvent): OrgMappingDragData | null {
  try {
    const raw = e.dataTransfer?.getData('application/json')
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data?.dragType !== DRAG_TYPE) return null
    return data as OrgMappingDragData
  } catch {
    return null
  }
}

interface Props {
  beforeOrg:     Organization
  allBeforeOrgs: Organization[]
  allocationList: AllocationRow[]
  depth?:        number
}

export function BeforeOrgWindow({ beforeOrg, allBeforeOrgs, allocationList, depth = 0 }: Props) {
  const [open, setOpen] = useState(true)
  const { organizations: afterOrgs } = useOrgView()
  const persons = useStore(s => s.persons) as Person[]
  const { comparisonOrgMapping, setComparisonOrgMap: _unused, clearComparisonOrgMap } = useCanvasLayoutStore()
  void _unused

  const children = allBeforeOrgs.filter(o => o.parentId === beforeOrg.id)

  const mappedAfterOrgId = comparisonOrgMapping[beforeOrg.id]
  const mappedAfterOrg   = mappedAfterOrgId ? afterOrgs.find(o => o.id === mappedAfterOrgId) : null

  // 直属メンバー（このorgにいた人）
  const members = useMemo(() => {
    const code = beforeOrg.externalCode ?? ''
    if (!code) return []
    return allocationList
      .filter(r => r.userId && r.prevDepartmentCode === code)
      .map(r => {
        const person    = persons.find((p: Person) => p.sfPersonId === r.userId)
        const curOrg    = afterOrgs.find(o => o.externalCode === r.departmentCode)
        const stayed    = r.departmentCode === beforeOrg.externalCode
        // マッピング先の新組織と同じ組織に移動した → 実質「同じ組織」
        const toMapped  = !stayed && !!mappedAfterOrg && r.departmentCode === mappedAfterOrg.externalCode
        return {
          name: person?.name ?? r.userId ?? '?',
          curOrgName: curOrg?.name,
          stayed,
          toMapped,
          rowId: r.rowId,
        }
      })
  }, [allocationList, beforeOrg, persons, afterOrgs, mappedAfterOrg])

  // ヘッダー色: depth が深いほど少し明るくする
  const headerBg = depth === 0 ? '#5c5248'
    : depth === 1               ? '#6e6360'
    :                             '#7d7270'

  const totalCount = members.length + children.reduce((acc, c) =>
    acc + allocationList.filter(r => r.userId && r.prevDepartmentCode === c.externalCode).length, 0)

  return (
    <div
      className="flex flex-col border border-gray-300 rounded overflow-hidden bg-white"
      style={{ marginLeft: depth * 12 }}
      draggable
      onDragStart={e => {
        e.stopPropagation()  // 親ウィンドウのドラッグを妨げない
        const data: OrgMappingDragData = { dragType: 'org-mapping', beforeOrgId: beforeOrg.id }
        e.dataTransfer.setData('application/json', JSON.stringify(data))
        e.dataTransfer.effectAllowed = 'link'
      }}
    >
      {/* ── タイトルバー ─────────────────────────── */}
      <div
        className="flex items-center gap-1 px-2 select-none"
        style={{ background: headerBg, height: 26 }}
      >
        <span className="text-[9px] text-stone-300 font-bold flex-shrink-0">旧</span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setOpen(o => !o)}
          className="text-white text-[9px] flex-shrink-0 w-4 text-center"
        >{open ? '▼' : '▶'}</button>
        <span className="flex-1 text-[11px] font-semibold text-white truncate min-w-0">
          {beforeOrg.name}
        </span>
        <span className="text-[9px] text-stone-300 flex-shrink-0">{totalCount}名</span>
      </div>

      {/* ── マッピングバー ───────────────────────── */}
      <div className="flex items-center gap-1 px-2 py-0.5 bg-stone-100 border-b border-stone-200 min-h-[18px]">
        {mappedAfterOrg ? (
          <>
            <span className="text-[9px] text-stone-500 flex-shrink-0">→</span>
            <span className="flex-1 text-[10px] font-medium text-blue-700 truncate">{mappedAfterOrg.name}</span>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => clearComparisonOrgMap(beforeOrg.id)}
              className="text-[9px] text-stone-400 hover:text-red-500 flex-shrink-0"
              title="マッピングを解除"
            >✕</button>
          </>
        ) : (
          <span className="text-[9px] text-amber-600 italic">→ 新組織へドロップしてマッピング</span>
        )}
      </div>

      {/* ── ボディ（直属メンバー + 子組織） ─────── */}
      {open && (
        <div className="p-1 flex flex-col gap-1">
          {/* 直属メンバー */}
          {members.length > 0 && (
            <div className="flex flex-col">
              {members.map(m => (
                <MemberRow
                  key={m.rowId}
                  name={m.name}
                  curOrgName={m.curOrgName}
                  stayed={m.stayed}
                  toMapped={m.toMapped}
                />
              ))}
            </div>
          )}

          {/* 子組織（再帰） */}
          {children.map(child => (
            <BeforeOrgWindow
              key={child.id}
              beforeOrg={child}
              allBeforeOrgs={allBeforeOrgs}
              allocationList={allocationList}
              depth={depth + 1}
            />
          ))}

          {members.length === 0 && children.length === 0 && (
            <p className="text-[10px] text-gray-400 text-center py-1">メンバーなし</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── メンバー行 ────────────────────────────────────────────────────
interface MemberRowProps {
  name:       string
  curOrgName: string | undefined
  stayed:     boolean   // 元の組織コードのまま
  toMapped:   boolean   // マッピング先の新組織に移動（実質同一）
}

function MemberRow({ name, curOrgName, stayed, toMapped }: MemberRowProps) {
  // 色の意味:
  //   stayed   → 濃いグレー "在"（コードが変わっていない）
  //   toMapped → 薄いグレー "→ 組織名"（マッピング先に移動 = 実質同一）
  //   その他   → オレンジ "→ 組織名"（異なる組織に移動）
  const badgeStyle = stayed
    ? 'bg-gray-200 text-gray-600'
    : toMapped
      ? 'bg-gray-100 text-gray-500'
      : 'bg-orange-100 text-orange-600'

  const badge = stayed ? '在' : '→'

  return (
    <div className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-gray-50">
      <span className={`flex-shrink-0 text-[8px] font-bold px-0.5 rounded ${badgeStyle}`}>{badge}</span>
      <span className="text-[10px] text-gray-700 truncate flex-1">{name}</span>
      {!stayed && curOrgName && (
        <span className={`text-[9px] truncate flex-shrink-0 max-w-[70px] ${toMapped ? 'text-gray-400' : 'text-orange-500'}`}>
          {curOrgName}
        </span>
      )}
    </div>
  )
}
