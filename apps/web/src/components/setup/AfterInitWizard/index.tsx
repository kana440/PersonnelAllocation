import { useState, useMemo } from 'react'
import type { ImportedWorkbookResult } from '../../../infrastructure/excel/types'
import {
  buildOrgMappingGroups,
  applyAfterInit,
  isUninitializedRow,
} from '../../../application/setup/afterInit'
import { OrgGroupRow } from './OrgGroupRow'
import type { OrgMappingGroup } from '../../../application/setup/afterInit'

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

  const unmatchedCount = groups.filter(g => g.prevCode !== null && !g.newOrgCode).length

  const handleOrgChange = (prevCode: string | null, newOrgCode: string | null) => {
    setGroups(prev => prev.map(g => g.prevCode === prevCode ? { ...g, newOrgCode } : g))
  }

  const handleSubmit = () => {
    const newList = applyAfterInit(allocationList, groups)
    onComplete({ ...result, allocationList: newList })
  }

  const autoMatchedCount = groups.filter(g => g.autoMatched).length
  const manualCount      = groups.filter(g => g.prevCode !== null && !g.autoMatched).length

  return (
    <div className="space-y-5">
      {/* タイトル */}
      <div>
        <h2 className="text-base font-bold text-gray-800">旧情報からの初期設定</h2>
        <p className="mt-1 text-sm text-gray-600">
          <span className="font-semibold text-orange-600">{uninitCount} 行</span>
          のポジション・職務情報が未入力です。旧データをコピーして初期化します。
        </p>
      </div>

      {/* サマリーバッジ */}
      <div className="flex gap-2 flex-wrap text-xs">
        <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
          ✓ 自動マッチ {autoMatchedCount} 組織
        </span>
        {manualCount > 0 && (
          <span className="px-2 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
            ⚠ 要選択 {manualCount} 組織
          </span>
        )}
        {unmatchedCount > 0 && (
          <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
            {unmatchedCount} 組織は「後で設定」
          </span>
        )}
      </div>

      {/* グループ一覧 */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {groups.map(g => (
          <OrgGroupRow
            key={g.prevCode ?? '__new__'}
            group={g}
            allOrgs={afterOrganizations}
            onChange={handleOrgChange}
          />
        ))}
      </div>

      {/* コピーされる項目の注記 */}
      <div className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
        コピーされる項目：ポジション / 組織 / 職位 / 等級 / 雇用形態 / 職種 / 勤務地 など全 after 項目
        <br />
        <span className="text-gray-500">異動事由は空欄のまま（変更なし = 変更種別に出ない）</span>
      </div>

      {/* ボタン */}
      <button
        onClick={handleSubmit}
        className="w-full py-3 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
      >
        旧情報をコピーして開始 →
      </button>

      {unmatchedCount > 0 && (
        <p className="text-center text-xs text-gray-400">
          「後で設定」の行は開始後に「未設定」セクションから組織を割り当てられます。
        </p>
      )}
    </div>
  )
}
