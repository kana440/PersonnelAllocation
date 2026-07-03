import { useState, useMemo } from 'react'
import { useStore } from '../../store/useStore'
import { appService } from '../../application/HRApplicationService'
import { DirectEditOperation } from '@personnel/domain/commands/handlers/directEdit'

interface Props {
  onClose: () => void
}

interface RemapEntry {
  oldJobFamily: string
  oldJobType:   string
  count:        number
  newFamilyCode:  string
  newFamilyLabel: string
  newTypeLabel:   string
}

export function JobTypeRemapDialog({ onClose }: Props) {
  const { allocationList, masters } = useStore()

  const validFamilyLabels = useMemo(() => new Set(masters.jobFamilies.map(f => f.label)), [masters])
  const validTypeLabels   = useMemo(() => new Set(masters.jobTypes.map(t => t.label)),   [masters])

  // ── 不正値のユニーク一覧を集計 ────────────────────────────────────────────
  const invalidGroups = useMemo(() => {
    const map = new Map<string, { oldJobFamily: string; oldJobType: string; count: number }>()
    for (const row of allocationList) {
      const fam = (row.jobFamily as string | undefined) ?? ''
      const typ = (row.jobType  as string | undefined) ?? ''
      const famInvalid = fam !== '' && !validFamilyLabels.has(fam)
      const typInvalid = typ !== '' && !validTypeLabels.has(typ)
      if (!famInvalid && !typInvalid) continue
      const key = `${fam}|||${typ}`
      const entry = map.get(key)
      if (entry) { entry.count++ } else { map.set(key, { oldJobFamily: fam, oldJobType: typ, count: 1 }) }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [allocationList, validFamilyLabels, validTypeLabels])

  // ── マッピング状態 ────────────────────────────────────────────────────────
  const initialMappings = useMemo<RemapEntry[]>(
    () => invalidGroups.map(g => {
      const suggestedFamily = masters.jobFamilies.find(f => f.label === g.oldJobFamily)
      return {
        ...g,
        newFamilyCode:  suggestedFamily?.code ?? '',
        newFamilyLabel: suggestedFamily?.label ?? '',
        newTypeLabel:   '',
      }
    }),
    [invalidGroups, masters.jobFamilies],
  )
  const [mappings, setMappings] = useState<RemapEntry[]>(initialMappings)

  const updateMapping = (idx: number, patch: Partial<RemapEntry>) =>
    setMappings(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m))

  const readyCount   = mappings.filter(m => m.newTypeLabel !== '').length
  const readyRowCount = mappings
    .filter(m => m.newTypeLabel !== '')
    .reduce((s, m) => s + m.count, 0)

  // ── ジョブファミリー選択時にタイプをリセット ──────────────────────────────
  const handleFamilyChange = (idx: number, familyCode: string) => {
    const family = masters.jobFamilies.find(f => f.code === familyCode)
    updateMapping(idx, {
      newFamilyCode:  familyCode,
      newFamilyLabel: family?.label ?? '',
      newTypeLabel:   '',
    })
  }

  // ── 実行 ─────────────────────────────────────────────────────────────────
  const [done, setDone] = useState<number | null>(null)

  const handleExecute = () => {
    const readyMappings = mappings.filter(m => m.newTypeLabel !== '')
    let updated = 0
    for (const m of readyMappings) {
      const targets = allocationList.filter(r => {
        const fam = (r.jobFamily as string | undefined) ?? ''
        const typ = (r.jobType  as string | undefined) ?? ''
        return fam === m.oldJobFamily && typ === m.oldJobType
      })
      for (const row of targets) {
        const result = appService.executeOperation(
          new DirectEditOperation(
            row.rowId,
            { jobFamily: m.newFamilyLabel, jobType: m.newTypeLabel },
            'ジョブタイプ変換',
          ),
        )
        if (result.ok) updated++
      }
    }
    setDone(updated)
  }

  if (done !== null) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
          <h2 className="text-base font-bold text-gray-800">変換完了</h2>
          <p className="text-sm text-gray-600">{done}行を変換しました。</p>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            閉じる
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full mx-4 flex flex-col" style={{ maxWidth: 820, maxHeight: '85vh' }}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-800">ジョブタイプ一括変換</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              マスタに存在しない旧値を新しい値にマッピングして一括変換します
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-4">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {invalidGroups.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-gray-400">
              エラーのあるジョブタイプ・ジョブファミリーはありません
            </div>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-y-1">
              <thead>
                <tr className="text-gray-500 text-left">
                  <th className="px-2 py-1 font-medium">旧ジョブファミリー</th>
                  <th className="px-2 py-1 font-medium">旧ジョブタイプ</th>
                  <th className="px-2 py-1 font-medium w-12 text-center">件数</th>
                  <th className="px-2 py-1 font-medium">新ジョブファミリー</th>
                  <th className="px-2 py-1 font-medium">新ジョブタイプ</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, idx) => {
                  const typesInFamily = masters.jobTypes.filter(t => t.jobFamilyCode === m.newFamilyCode)
                  const famInvalid = m.oldJobFamily !== '' && !validFamilyLabels.has(m.oldJobFamily)
                  const typInvalid = m.oldJobType  !== '' && !validTypeLabels.has(m.oldJobType)
                  return (
                    <tr key={idx} className="bg-gray-50 rounded">
                      <td className="px-2 py-1.5 rounded-l">
                        <span className={`font-mono ${famInvalid ? 'text-red-600' : 'text-gray-700'}`}>
                          {m.oldJobFamily || '（空）'}
                          {famInvalid && <span className="ml-1 text-red-400">✕</span>}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`font-mono ${typInvalid ? 'text-red-600' : 'text-gray-700'}`}>
                          {m.oldJobType || '（空）'}
                          {typInvalid && <span className="ml-1 text-red-400">✕</span>}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center text-blue-600 font-semibold">{m.count}</td>
                      <td className="px-2 py-1.5">
                        <select
                          value={m.newFamilyCode}
                          onChange={e => handleFamilyChange(idx, e.target.value)}
                          className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                        >
                          <option value="">（選択）</option>
                          {masters.jobFamilies.map(f => (
                            <option key={f.code} value={f.code}>{f.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 rounded-r">
                        <select
                          value={m.newTypeLabel}
                          onChange={e => updateMapping(idx, { newTypeLabel: e.target.value })}
                          disabled={!m.newFamilyCode}
                          className="w-full border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                        >
                          <option value="">（ファミリー選択後）</option>
                          {typesInFamily.map(t => (
                            <option key={t.code} value={t.label}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            キャンセル
          </button>
          <button
            onClick={handleExecute}
            disabled={readyCount === 0}
            className="px-6 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {readyCount === 0
              ? 'マッピングを設定してください'
              : `${readyCount}種類のマッピングを変換（${readyRowCount}行）`}
          </button>
        </div>

      </div>
    </div>
  )
}
