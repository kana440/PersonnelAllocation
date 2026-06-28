import React, { useState, useMemo } from 'react'
import type { ImportedWorkbookResult } from '../../../infrastructure/excel/types'
import {
  buildOrgMappingGroups,
  applyAfterInit,
  isUninitializedRow,
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
  result:      ImportedWorkbookResult
  onComplete:  (modifiedResult: ImportedWorkbookResult) => void
}

export function AfterInitWizard({ result, onComplete }: Props) {
  const { allocationList, afterOrganizations, beforeOrganizations, masters } = result

  const initialGroups = useMemo(
    () => buildOrgMappingGroups(allocationList, afterOrganizations, beforeOrganizations, masters),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [groups, setGroups] = useState<OrgMappingGroup[]>(initialGroups)

  const uninitCount = useMemo(
    () => allocationList.filter(r => isUninitializedRow(r, masters)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

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

  const handleSubmit = () => {
    const newList = applyAfterInit(allocationList, groups)
    onComplete({ ...result, allocationList: newList })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-bold text-gray-800">旧情報からの初期設定</h2>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-semibold text-orange-600">{uninitCount} 行</span>
          のポジション・職務情報が未入力です。旧データをコピーして初期化します。
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

      {/* コピーされる項目の注記 */}
      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
        コピーされる項目：ポジション / 組織 / 職位 / 等級 / 雇用形態 / 職種 / 勤務地 など全 after 項目
        <br />
        <span className="text-gray-500">異動事由は空欄のまま（変更なし = 変更種別に出ない）</span>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full py-3 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
      >
        旧情報をコピーして開始 →
      </button>

      {unselectedCount > 0 && (
        <p className="text-center text-xs text-gray-400">
          「後で設定」の行は開始後に「未設定」セクションから組織を割り当てられます。
        </p>
      )}
    </div>
  )
}
