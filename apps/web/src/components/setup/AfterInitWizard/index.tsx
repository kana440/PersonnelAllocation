import React, { useState, useMemo } from 'react'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization }  from '@personnel/domain/schemas'
import {
  buildOrgMappingGroups,
} from '../../../application/setup/afterInit'
import { OrgGroupRow } from './OrgGroupRow'
import type { OrgMappingGroup } from '../../../application/setup/afterInit'

// ── セクションヘッダー ───────────────────────────────────────────────────────

function SectionHeader({ sectionKey }: { sectionKey: string }) {
  if (sectionKey === '__new__') {
    return (
      <div className="text-[10px] font-semibold text-gray-500 pt-3 pb-1 border-b border-gray-200">
        新入社員等（旧組織なし）
      </div>
    )
  }
  if (sectionKey === '__root__') {
    return (
      <div className="text-[10px] font-semibold text-gray-600 pt-3 pb-1 border-b border-gray-200">
        （最上位）
      </div>
    )
  }
  const parts = sectionKey.split(' > ')
  return (
    <div className="flex items-center gap-0.5 pt-3 pb-1 border-b border-gray-200">
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-gray-300 text-[10px]">›</span>}
          <span className={
            i === parts.length - 1
              ? 'text-[10px] font-semibold text-gray-700'
              : 'text-[10px] text-gray-400'
          }>{p}</span>
        </React.Fragment>
      ))}
      <span className="ml-1 text-[10px] text-gray-400">配下</span>
    </div>
  )
}

// ── AfterInitWizard ─────────────────────────────────────────────────────────

interface Props {
  /** マッピング対象行（呼び出し元でフィルタ済み） */
  rowsToGroup:         AllocationRow[]
  afterOrganizations:  Organization[]
  beforeOrganizations: Organization[]
  onConfirm:           (groups: OrgMappingGroup[]) => void
  onCancel?:           () => void
  /** ボタン直前に差し込む任意のノート（SETUP 専用の "コピーされる項目" 等） */
  footerNote?:         React.ReactNode
}

export function AfterInitWizard({
  rowsToGroup,
  afterOrganizations,
  beforeOrganizations,
  onConfirm,
  onCancel,
  footerNote,
}: Props) {
  const initialGroups = useMemo(
    () => buildOrgMappingGroups(rowsToGroup, afterOrganizations, beforeOrganizations),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [groups, setGroups] = useState<OrgMappingGroup[]>(initialGroups)

  const rowCount        = rowsToGroup.length
  const totalOrgCount   = groups.filter(g => g.prevCode !== null).length
  const selectedCount   = groups.filter(g => g.prevCode !== null && !!g.newOrgCode).length
  const unselectedCount = totalOrgCount - selectedCount

  const handleOrgChange = (prevCode: string | null, newOrgCode: string | null) => {
    setGroups(prev => prev.map(g => g.prevCode === prevCode ? { ...g, newOrgCode } : g))
  }

  const handleSetAllLater = () => {
    setGroups(prev => prev.map(g =>
      g.prevCode !== null ? { ...g, newOrgCode: null, autoMatched: false, matchConfidence: 'none' as const } : g
    ))
  }

  const handleRestoreProposals = () => setGroups(initialGroups)

  const initialNewOrgCodeByPrevCode = useMemo(
    () => new Map(initialGroups.map(g => [g.prevCode, g.newOrgCode])),
    [initialGroups],
  )

  // ソート済みの groups をセクションに分割（prevOrgPath が同じものをまとめる）
  const sections = useMemo(() => {
    const result: Array<{ key: string; groups: OrgMappingGroup[] }> = []
    for (const g of groups) {
      const key = g.prevCode === null ? '__new__'
        : g.prevOrgPath ? g.prevOrgPath
        : '__root__'
      const last = result[result.length - 1]
      if (last && last.key === key) {
        last.groups.push(g)
      } else {
        result.push({ key, groups: [g] })
      }
    }
    return result
  }, [groups])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-800">旧組織 → 新組織 マッピング</h2>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-semibold text-orange-600">{rowCount} 行</span>
          を対象に旧組織を新組織に対応づけます。
        </p>
      </div>

      {/* カウント + 一括操作 */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-600">
          設定済{' '}
          <span className={`font-semibold ${unselectedCount > 0 ? 'text-orange-500' : 'text-green-600'}`}>
            {selectedCount}
          </span>
          {' / '}{totalOrgCount} 組織
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleRestoreProposals}
            className="px-2 py-0.5 text-[11px] rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap"
          >
            提案を全件適用
          </button>
          <button
            onClick={handleSetAllLater}
            className="px-2 py-0.5 text-[11px] rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            すべて後から
          </button>
        </div>
      </div>

      {/* セクション一覧 */}
      <div className="max-h-[480px] overflow-y-auto pr-1 space-y-0">
        {sections.map(({ key, groups: sectionGroups }) => (
          <div key={key}>
            <SectionHeader sectionKey={key} />
            <div className="space-y-1.5 mt-1.5 mb-2">
              {sectionGroups.map(g => (
                <OrgGroupRow
                  key={g.prevCode ?? '__new__'}
                  group={g}
                  allOrgs={afterOrganizations}
                  initialNewOrgCode={initialNewOrgCodeByPrevCode.get(g.prevCode) ?? null}
                  onChange={handleOrgChange}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {footerNote}

      <button
        onClick={() => onConfirm(groups)}
        className="w-full py-3 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
      >
        マッピングを適用 →
      </button>

      {onCancel && (
        <button
          onClick={onCancel}
          className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          キャンセル
        </button>
      )}

      {unselectedCount > 0 && (
        <p className="text-center text-xs text-gray-400">
          「後で設定」の行は「未割当」セクションから組織を割り当てられます。
        </p>
      )}
    </div>
  )
}
