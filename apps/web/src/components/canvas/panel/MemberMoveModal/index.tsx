import { useState, useMemo, useCallback } from 'react'
import { createPortal }           from 'react-dom'
import { useStore }               from '../../../../store/useStore'
import { appService }             from '../../../../application/HRApplicationService'
import { MoveRowsToOrgOperation } from '@personnel/domain/commands/handlers/moveRowsToOrg'
import { buildCandidates }        from './helpers'
import type { CandidateEntry }    from './helpers'
// ひらがな→カタカナ + スペース除去 + NFKC 正規化（スペースなし入力・かな検索に対応）
const norm = (s: string) =>
  s.normalize('NFKC').replace(/\s+/g, '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).toLowerCase()

interface Props {
  orgCode: string
  orgName: string
  onClose: () => void
}

export function MemberMoveModal({ orgCode, orgName, onClose }: Props) {
  const { allocationList, afterOrganizations, beforeOrganizations } = useStore()

  const [query,       setQuery]       = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [error,       setError]       = useState<string | null>(null)

  const candidates = useMemo(
    () => buildCandidates(allocationList, afterOrganizations, beforeOrganizations, orgCode),
    [allocationList, afterOrganizations, beforeOrganizations, orgCode],
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return candidates
    // スペース・カンマ（半角・全角）・読点で分割してOR検索
    const tokens = q.split(/[\s,，、]+/).map(norm).filter(Boolean)
    return candidates.filter(c => {
      const row = c.row
      const targets = [
        norm(c.name),
        norm([row.lastName, row.firstName].filter(Boolean).join('')),
        norm(row.lastName        ?? ''),
        norm(row.firstName       ?? ''),
        norm([row.lastNameKana, row.firstNameKana].filter(Boolean).join('')),
        norm(row.lastNameKana    ?? ''),
        norm(row.firstNameKana   ?? ''),
        norm(c.currentPath),
        norm(c.beforePath),
        norm(c.positionCode),
      ]
      return tokens.some(token => targets.some(target => target.includes(token)))
    })
  }, [candidates, query])

  const toggle = useCallback((rowId: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId)
      return next
    })
  }, [])

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(c => c.row.rowId)))
    }
  }

  const handleConfirm = () => {
    if (selectedIds.size === 0) return
    const targetOrg = afterOrganizations.find(o => o.externalCode === orgCode)
    if (!targetOrg) { setError('異動先組織が見つかりません'); return }
    const result = appService.executeOperation(
      new MoveRowsToOrgOperation([...selectedIds], targetOrg.id, `${orgName} へ異動`)
    )
    if (!result.ok) {
      setError((result.errors as Array<{ message: string }>).map(e => e.message).join('\n'))
      return
    }
    onClose()
  }

  const allChecked = filtered.length > 0 && filtered.every(c => selectedIds.has(c.row.rowId))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose} onMouseDown={e => { if (e.target === e.currentTarget) e.stopPropagation() }}>
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col"
        style={{ width: 860, maxHeight: '80vh' }}
        data-window="member-move-modal"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        {/* ── ヘッダー ──────────────────────────────────────────── */}
        <div className="px-5 py-3 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <div className="font-semibold text-sm text-gray-800">メンバーをこの組織に異動</div>
            <div className="text-[11px] text-gray-500 mt-0.5">異動先: {orgName}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-base">✕</button>
        </div>

        {/* ── 検索バー ──────────────────────────────────────────── */}
        <div className="px-5 py-2.5 border-b flex-shrink-0 flex items-center gap-2">
          <input
            type="text"
            placeholder="氏名・ふりがな・組織名・ポジション番号で検索（スペース・カンマでOR）..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded px-2.5 py-1 outline-none focus:border-blue-400"
            autoFocus
          />
          <span className="text-[11px] text-gray-400 flex-shrink-0">
            {candidates.length}名中 {filtered.length}名表示
          </span>
        </div>

        {/* ── 候補リスト ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="border-b border-gray-200">
                <th className="w-8 px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="cursor-pointer"
                  />
                </th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 w-28">氏名</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">所属（現在 / 旧）</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 w-16">バンド</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600 w-28">役職</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-gray-400">候補が見つかりません</td></tr>
              )}
              {filtered.map((c: CandidateEntry) => (
                <CandidateRow
                  key={c.row.rowId}
                  entry={c}
                  selected={selectedIds.has(c.row.rowId)}
                  onToggle={() => toggle(c.row.rowId)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* ── エラー ────────────────────────────────────────────── */}
        {error && (
          <div className="px-5 py-2 bg-red-50 border-t border-red-100 flex-shrink-0">
            <p className="text-xs text-red-500 whitespace-pre-wrap">{error}</p>
          </div>
        )}

        {/* ── フッター ──────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t flex items-center justify-between flex-shrink-0">
          <span className="text-xs text-gray-500">
            {selectedIds.size > 0 ? `${selectedIds.size}名選択中` : '名前をクリックして選択'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
            >キャンセル</button>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >{selectedIds.size > 0 ? `${selectedIds.size}名を異動` : '異動'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

interface RowProps { entry: CandidateEntry; selected: boolean; onToggle: () => void }

function CandidateRow({ entry, selected, onToggle }: RowProps) {
  return (
    <tr
      className={`border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors ${selected ? 'bg-blue-50' : ''}`}
      onClick={onToggle}
    >
      <td className="w-8 px-2 py-1.5 text-center" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} className="cursor-pointer" />
      </td>
      <td className="px-2 py-2 font-medium text-gray-800 whitespace-nowrap w-28">{entry.name}</td>
      <td className="px-2 py-2 max-w-[420px]">
        <div className="text-[11px] text-gray-700 leading-snug">
          {entry.currentPath || <span className="text-gray-300">—</span>}
        </div>
        {entry.beforePath && entry.beforePath !== entry.currentPath && (
          <div className="text-[9px] text-gray-400 leading-snug mt-0.5">
            旧: {entry.beforePath}
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-gray-500 whitespace-nowrap w-16">{entry.band}</td>
      <td className="px-2 py-2 text-gray-500 truncate max-w-[110px] w-28" title={entry.posTitle}>
        {entry.posTitle || <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}
