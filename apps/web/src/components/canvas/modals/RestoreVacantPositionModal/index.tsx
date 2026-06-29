import { useState, useMemo }  from 'react'
import { useStore }            from '../../../../store/useStore'
import { appService }          from '../../../../application/HRApplicationService'
import { normalizeSearch }     from '../../../../utils/normalizeSearch'
import { ModalShell }          from '../../../common/ModalShell'
import { OrgPickerModal }      from '../../../common/OrgPickerModal'
import {
  findRestorablePositions,
  RestoreVacantPositionOperation,
} from '@personnel/domain/commands/handlers/restoreVacantPosition'
import type { RestorablePosition } from '@personnel/domain/commands/handlers/restoreVacantPosition'
import type { Organization } from '@personnel/domain/schemas'

interface Props {
  onClose: () => void
}

export function RestoreVacantPositionModal({ onClose }: Props) {
  const { allocationList, afterOrganizations } = useStore()

  const [query,        setQuery]        = useState('')
  const [orgPickerFor, setOrgPickerFor] = useState<RestorablePosition | null>(null)
  // positionCode → 選択済み追加先 orgId
  const [targetOrgIds, setTargetOrgIds] = useState<Map<string, string>>(new Map())
  // 追加済みのポジションコード（操作後にリストから外す）
  const [added, setAdded] = useState<Set<string>>(new Set())

  const orgByCode = useMemo(
    () => new Map(afterOrganizations.filter(o => o.externalCode).map(o => [o.externalCode!, o])),
    [afterOrganizations],
  )
  const orgById = useMemo(
    () => new Map(afterOrganizations.map(o => [o.id, o])),
    [afterOrganizations],
  )

  const candidates = useMemo(
    () => findRestorablePositions(allocationList).filter(c => !added.has(c.positionCode)),
    [allocationList, added],
  )

  const filtered = useMemo(() => {
    const q = normalizeSearch(query.trim())
    if (!q) return candidates
    return candidates.filter(c =>
      normalizeSearch(c.positionCode).includes(q) ||
      normalizeSearch(c.prevLocalJobTitle).includes(q) ||
      normalizeSearch(c.prevOfficialPositionCode).includes(q) ||
      normalizeSearch(c.prevDepartmentCode).includes(q) ||
      normalizeSearch(c.prevPersonName).includes(q),
    )
  }, [candidates, query])

  const getTargetOrg = (c: RestorablePosition): Organization | null => {
    const overrideId = targetOrgIds.get(c.positionCode)
    if (overrideId) return orgById.get(overrideId) ?? null
    return orgByCode.get(c.prevDepartmentCode) ?? null
  }

  const handleAdd = (c: RestorablePosition) => {
    const targetOrg = getTargetOrg(c)
    if (!targetOrg) {
      setOrgPickerFor(c)
      return
    }
    const code = targetOrg.externalCode ?? targetOrg.id
    const result = appService.executeOperation(
      new RestoreVacantPositionOperation(c, code),
    )
    if (result.ok) {
      setAdded(prev => new Set(prev).add(c.positionCode))
    }
  }

  const handleOrgPick = (orgId: string) => {
    if (!orgPickerFor) return
    setTargetOrgIds(prev => new Map(prev).set(orgPickerFor.positionCode, orgId))
    setOrgPickerFor(null)
  }

  const isSameOrg = (c: RestorablePosition): boolean =>
    orgByCode.has(c.prevDepartmentCode) && !targetOrgIds.has(c.positionCode)

  return (
    <>
      <ModalShell onClose={onClose} maxWidth="max-w-2xl">
        <div className="flex flex-col" style={{ height: '70vh' }}>

          {/* ヘッダー */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200">
            <p className="text-sm font-semibold text-gray-800">空きポジションを追加</p>
            <p className="text-xs text-gray-400 mt-0.5">
              旧にあって新に存在しないポジション（{candidates.length}件）を任意の組織に復元します
            </p>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="ポジションコード・タイトル・組織・担当者で絞り込み"
              className="mt-2 w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>

          {/* 候補リスト */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-1">
                <div className="text-2xl">✓</div>
                <div className="text-xs">
                  {candidates.length === 0
                    ? '復元可能なポジションはありません'
                    : '該当なし'}
                </div>
              </div>
            ) : (
              filtered.map(c => {
                const targetOrg = getTargetOrg(c)
                const same      = isSameOrg(c)

                return (
                  <div
                    key={c.positionCode}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50"
                  >
                    {/* 情報列 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-gray-800 truncate">
                          {c.prevLocalJobTitle || c.prevOfficialPositionCode || c.positionCode}
                        </span>
                        {c.prevBand && (
                          <span className="px-1 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-100 flex-shrink-0">
                            {c.prevBand}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                        <span className="font-mono">{c.positionCode}</span>
                        {c.prevPersonName && (
                          <span className="ml-2 text-gray-500">元: {c.prevPersonName}</span>
                        )}
                      </div>

                      {/* 追加先組織 */}
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <span className="text-[10px] text-gray-400">旧組織:</span>
                        <span className="text-[10px] text-gray-500 font-mono">{c.prevDepartmentCode}</span>
                        <span className="text-[10px] text-gray-300">→</span>
                        {targetOrg ? (
                          <>
                            <span className={`text-[10px] font-medium ${same ? 'text-green-700' : 'text-blue-700'}`}>
                              {targetOrg.name}
                            </span>
                            {same && (
                              <span className="text-[10px] text-green-500">(同組織)</span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-amber-600 font-medium">組織を選択してください</span>
                        )}
                        <button
                          onClick={() => setOrgPickerFor(c)}
                          className="text-[10px] text-gray-400 hover:text-blue-600 underline ml-0.5"
                        >
                          {targetOrg ? '変更' : '選択'}
                        </button>
                      </div>
                    </div>

                    {/* 追加ボタン */}
                    <button
                      onClick={() => handleAdd(c)}
                      className="flex-shrink-0 text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    >
                      追加
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* フッター */}
          <div className="flex-shrink-0 px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[10px] text-gray-400">{filtered.length}/{candidates.length} 件表示</span>
            <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">
              閉じる
            </button>
          </div>
        </div>
      </ModalShell>

      {/* 組織選択モーダル */}
      {orgPickerFor && (
        <OrgPickerModal
          open={true}
          title="追加先の組織を選択"
          confirmLabel="この組織に追加"
          onSelect={handleOrgPick}
          onClose={() => setOrgPickerFor(null)}
        />
      )}
    </>
  )
}
