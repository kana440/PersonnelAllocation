import { useState, useMemo, useEffect, useRef } from 'react'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'

export interface PersonPickerResult {
  userId:          string
  lastName:        string | undefined
  firstName:       string | undefined
  groupEmployeeId: string | undefined
  employeeNumber:  string | undefined
  employmentType:  string | undefined
  departmentCode:  string | undefined
  positionCode:    string | undefined
}

interface Props {
  /** フォームの departmentCode（デフォルト絞り込みの基点） */
  defaultOrgCode?:    string
  allocationList:     AllocationRow[]
  afterOrganizations: Organization[]
  /** 選択不可にするユーザーIDセット（自身・配下など階層上の制約） */
  excludeUserIds?:    ReadonlySet<string>
  onSelect:           (p: PersonPickerResult) => void
  onClose:            () => void
}

export function PersonPickerDialog({ defaultOrgCode, allocationList, afterOrganizations, excludeUserIds, onSelect, onClose }: Props) {
  const [query,          setQuery]          = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [crossOrg,       setCrossOrg]       = useState(!defaultOrgCode)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(value.trim()), 150)
  }

  // ひらがな→カタカナ統一 + スペース除去で正規化（かな検索・スペースなし入力に対応）
  const norm = (s: string) =>
    s.replace(/\s+/g, '').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).toLowerCase()

  const orgByCode = useMemo(
    () => new Map(afterOrganizations.flatMap(o => o.externalCode ? [[o.externalCode, o]] : [])),
    [afterOrganizations]
  )
  const orgById = useMemo(
    () => new Map(afterOrganizations.map(o => [o.id, o])),
    [afterOrganizations]
  )

  function orgPathOf(code: string | undefined): string {
    if (!code) return ''
    const org = orgByCode.get(code)
    if (!org) return code
    const parts: string[] = [org.name ?? code]
    let cur: Organization = org
    for (let i = 0; i < 5; i++) {
      if (!cur.parentId) break
      const parent = orgById.get(cur.parentId)
      if (!parent) break
      parts.unshift(parent.name ?? parent.id)
      cur = parent
    }
    // 5階層超は末尾3段のみ表示
    return parts.length > 4
      ? ['…', ...parts.slice(-3)].join(' / ')
      : parts.join(' / ')
  }

  const scopedOrgCodes = useMemo(() => {
    if (!defaultOrgCode) return null
    const org = orgByCode.get(defaultOrgCode)
    if (!org) return null
    const codes = new Set<string>([defaultOrgCode])
    if (org.externalCode) codes.add(org.externalCode)
    if (org.parentId) {
      const parent = orgById.get(org.parentId)
      if (parent?.externalCode) codes.add(parent.externalCode)
    }
    return codes
  }, [defaultOrgCode, orgByCode, orgById])

  // null = "入力してください" 状態（全組織 + クエリなし時 → 1万行のレンダリングを抑制）
  const results = useMemo(() => {
    if (crossOrg && !debouncedQuery) return null

    let rows = allocationList.filter(r => r.userId && r.concurrentType !== '兼務')

    if (!crossOrg && scopedOrgCodes) {
      rows = rows.filter(r => r.departmentCode && scopedOrgCodes.has(r.departmentCode))
    }

    if (debouncedQuery) {
      // スペース・カンマ・読点で分割してOR検索（空トークンは除去）
      const tokens = debouncedQuery.split(/[\s,、]+/).map(norm).filter(Boolean)
      rows = rows.filter(r => {
        const targets = [
          norm([r.lastName, r.firstName].filter(Boolean).join(' ')),
          norm([r.lastName, r.firstName].filter(Boolean).join('')),
          norm(r.lastName          ?? ''),
          norm(r.firstName         ?? ''),
          norm([r.lastNameKana, r.firstNameKana].filter(Boolean).join('')),
          norm(r.lastNameKana      ?? ''),
          norm(r.firstNameKana     ?? ''),
          r.groupEmployeeId?.toLowerCase() ?? '',
          r.employeeNumber?.toLowerCase()  ?? '',
          r.positionCode?.toLowerCase()    ?? '',
        ]
        return tokens.some(token => targets.some(target => target.includes(token)))
      })
    }

    return rows.slice(0, 50)
  }, [allocationList, debouncedQuery, crossOrg, scopedOrgCodes])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-[520px] max-h-[600px] flex flex-col"
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <span className="text-sm font-semibold text-gray-700">人物を検索</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>

        <div className="px-4 py-2.5 border-b border-gray-100 space-y-2 flex-shrink-0">
          <input
            type="text"
            autoFocus
            placeholder="氏名・ふりがな・社員番号で検索（スペース・カンマでOR）"
            value={query}
            onChange={e => handleQueryChange(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400"
          />
          {defaultOrgCode && (
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={crossOrg}
                onChange={e => setCrossOrg(e.target.checked)}
                className="w-3.5 h-3.5 accent-blue-500"
              />
              <span>
                全組織を検索（横断検索）
                {!crossOrg && scopedOrgCodes && (
                  <span className="ml-1 text-gray-400">— 現在: {orgPathOf(defaultOrgCode)}</span>
                )}
              </span>
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {results === null ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-400">
              氏名・社員番号・ポジションIDで検索してください
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-400">
              該当する人物が見つかりません
            </div>
          ) : (
            <ul>
              {results.map(row => {
                const name       = [row.lastName, row.firstName].filter(Boolean).join(' ') || '（氏名なし）'
                const orgPath    = orgPathOf(row.departmentCode)
                const isExcluded = row.userId ? (excludeUserIds?.has(row.userId) ?? false) : false
                return (
                  <li key={row.rowId}>
                    <button
                      disabled={isExcluded}
                      onClick={() => onSelect({
                        userId:          row.userId!,
                        lastName:        row.lastName        as string | undefined,
                        firstName:       row.firstName       as string | undefined,
                        groupEmployeeId: row.groupEmployeeId as string | undefined,
                        employeeNumber:  row.employeeNumber  as string | undefined,
                        employmentType:  row.employmentType  as string | undefined,
                        departmentCode:  row.departmentCode  as string | undefined,
                        positionCode:    row.positionCode    as string | undefined,
                      })}
                      className={`w-full text-left px-4 py-2.5 border-b border-gray-50 transition-colors ${
                        isExcluded ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{name}</span>
                        <span className="text-[11px] text-gray-400 font-mono flex-shrink-0">
                          {row.groupEmployeeId ?? row.employeeNumber ?? ''}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate">{orgPath}</div>
                      {isExcluded && (
                        <div className="text-[10px] text-orange-400">選択不可（階層上の制約）</div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {results !== null && results.length >= 50 && (
          <div className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100 flex-shrink-0 text-center">
            先頭50件を表示 — 検索語句を追加して絞り込んでください
          </div>
        )}
      </div>
    </div>
  )
}
