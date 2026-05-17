import { useState, useRef } from 'react'
import { useStore } from '../store/useStore'

const EMP_TYPES = ['正社員', '契約社員', 'パート・アルバイト', '派遣社員', '嘱託']

export function SearchPersonPanel() {
  const {
    persons, companies,
    afterOrganizations, afterAffiliations, afterPositions,
    beforeAffiliations, beforePositions,
    operations, confirmedNoChangeKeys,
    focusedOrgId, selectedPersonId, selectPerson,
    bands, positionTitles, effectiveDate, addOperation, addNewHire,
  } = useStore()

  // 配置先として選べる組織（未設定・level99 を除く）
  const selectableOrgs = afterOrganizations.filter(o => o.level < 99 && !o.id.startsWith('unassigned_'))

  // ── 人物追加フォーム ─────────────────────────────────────────
  const [addPersonOpen, setAddPersonOpen]   = useState(false)
  const [addPersonName, setAddPersonName]   = useState('')
  const [addPersonEmp,  setAddPersonEmp]    = useState('')
  const [addPersonOrg,  setAddPersonOrg]    = useState('')
  const addPersonNameRef = useRef<HTMLInputElement>(null)

  const handleAddPerson = () => {
    const name = addPersonName.trim()
    if (!name) return
    const org = selectableOrgs.find(o => o.id === addPersonOrg)
    addNewHire({
      name,
      employeeNumber: addPersonEmp.trim() || undefined,
      orgId:          org?.id,
      companyId:      org?.companyId,
    })
    setAddPersonName(''); setAddPersonEmp(''); setAddPersonOrg(''); setAddPersonOpen(false)
  }

  // ── フォーム状態 ─────────────────────────────────────────────
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const [createTitle,    setCreateTitle]    = useState('')
  const [createBand,     setCreateBand]     = useState('')

  const [fillPositionId, setFillPositionId] = useState<string | null>(null)
  const [fillPersonId,   setFillPersonId]   = useState('')
  const [fillEmpType,    setFillEmpType]    = useState('正社員')

  // ── 組織 & ポジション ────────────────────────────────────────
  const focusedOrg = focusedOrgId
    ? afterOrganizations.find(o => o.id === focusedOrgId)
    : null

  const positionsInOrg = focusedOrgId
    ? afterPositions.filter(p => p.orgId === focusedOrgId)
    : []

  const getOccupant = (posId: string) => {
    const aff = afterAffiliations.find(a => a.positionId === posId && a.status === 'active')
    return { aff, person: aff ? persons.find(p => p.id === aff.personId) : undefined }
  }

  // ── ハンドラー ───────────────────────────────────────────────
  const handleCreatePosition = () => {
    if (!focusedOrg) return
    const title = createTitle || '担当'
    const band  = createBand  || (bands[3]?.id ?? 'B4')
    addOperation({
      kind: 'CreateVacantPosition',
      label: `空席ポジション作成：${title}（${focusedOrg.name}）`,
      params: { orgId: focusedOrg.id, companyId: focusedOrg.companyId, title, band },
      effectiveDate,
    })
    setCreateFormOpen(false)
    setCreateTitle('')
    setCreateBand('')
  }

  const handleFillPosition = () => {
    if (!fillPositionId || !fillPersonId) return
    const pos    = afterPositions.find(p => p.id === fillPositionId)
    const person = persons.find(p => p.id === fillPersonId)
    if (!pos || !person) return
    addOperation({
      kind: 'FillVacantPosition',
      label: `ポジション割り当て：${person.name}（${pos.title || '担当'} / ${pos.band}）`,
      params: { positionId: fillPositionId, personId: fillPersonId, employmentType: fillEmpType },
      effectiveDate,
    })
    setFillPositionId(null)
    setFillPersonId('')
    selectPerson(fillPersonId)
  }

  const openCreateForm = () => {
    setCreateFormOpen(o => !o)
    setFillPositionId(null)
  }

  const openFillForm = (posId: string) => {
    setFillPositionId(id => id === posId ? null : posId)
    setCreateFormOpen(false)
    setFillPersonId('')
  }

  // ── 未確認サマリー ───────────────────────────────────────────
  const isConfirmedOrChanged = (personId: string, companyId: string) => {
    const hasOp = operations.some(o =>
      o.params.personId === personId && (
        (o.kind === 'MoveToOrg'             && o.params.companyId === companyId) ||
        (o.kind === 'Promote'               && o.params.companyId === companyId) ||
        (o.kind === 'RecallFromSecondment'  && o.params.companyId === companyId) ||
        o.kind === 'SendOnSecondment'
      )
    )
    return hasOp || confirmedNoChangeKeys.has(`${personId}_${companyId}`)
  }

  const unconfirmedPersonIds = [...new Set(
    beforeAffiliations
      .filter(a => {
        if (a.status !== 'active') return false
        const pos = beforePositions.find(p => p.id === a.positionId)
        if (!pos) return false
        return !isConfirmedOrChanged(a.personId, pos.companyId)
      })
      .map(a => a.personId)
  )]

  // ── レンダリング ─────────────────────────────────────────────
  return (
    <div className="flex-shrink-0 w-56 border-r border-gray-200 flex flex-col bg-gray-50 overflow-hidden">
        {focusedOrg ? (
          <>
            {/* Org header */}
            <div className="px-3 py-2 border-b border-gray-200 bg-white flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-blue-700 truncate">{focusedOrg.name}</div>
                <div className="text-xs text-gray-400">
                  {companies.find(c => c.id === focusedOrg.companyId)?.name ?? ''} &bull; {positionsInOrg.length} ポジション
                </div>
              </div>
              <button
                onClick={openCreateForm}
                className={`flex-shrink-0 ml-2 text-xs px-2 py-0.5 rounded border transition-colors ${
                  createFormOpen
                    ? 'border-blue-400 bg-blue-50 text-blue-600'
                    : 'border-dashed border-gray-400 text-gray-600 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                ＋ 作成
              </button>
            </div>

            {/* CreateVacantPosition inline form */}
            {createFormOpen && (
              <div className="border-b border-blue-100 bg-blue-50 p-2 flex-shrink-0 space-y-1.5">
                <div className="text-xs font-medium text-blue-700">空席ポジション作成</div>
                <div className="flex gap-1">
                  <select
                    value={createTitle}
                    onChange={e => setCreateTitle(e.target.value)}
                    className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-blue-400"
                  >
                    <option value="">職位名を選択</option>
                    {positionTitles.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select
                    value={createBand}
                    onChange={e => setCreateBand(e.target.value)}
                    className="w-16 border border-gray-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-blue-400"
                  >
                    <option value="">Bnd</option>
                    {bands.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={handleCreatePosition}
                    className="flex-1 bg-blue-600 text-white text-xs py-1 rounded hover:bg-blue-700"
                  >
                    作成
                  </button>
                  <button
                    onClick={() => setCreateFormOpen(false)}
                    className="px-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded bg-white"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            {/* Position list */}
            <div className="flex-1 overflow-y-auto min-h-0 p-1">
              {positionsInOrg.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-6 leading-relaxed">
                  ポジションなし<br />
                  <span className="text-gray-300">「＋ 作成」でポジションを追加</span>
                </div>
              ) : (
                positionsInOrg.map(pos => {
                  const { aff, person } = getOccupant(pos.id)
                  const isVacant     = !person
                  const isConcurrent = aff?.type === 'concurrent'
                  const isSelected   = !isVacant && selectedPersonId === person!.id
                  const isFilling    = fillPositionId === pos.id

                  return (
                    <div key={pos.id}>
                      <button
                        onClick={() => isVacant ? openFillForm(pos.id) : person && selectPerson(person.id)}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                          isFilling    ? 'bg-green-50 ring-1 ring-green-300' :
                          isSelected   ? 'bg-yellow-50 ring-1 ring-yellow-300' :
                          isVacant     ? 'hover:bg-green-50' :
                                         'hover:bg-blue-50'
                        }`}
                      >
                        <span className={`flex-shrink-0 leading-none ${
                          isFilling    ? 'text-green-500' :
                          isVacant     ? 'text-gray-300' :
                          isConcurrent ? 'text-purple-500' : 'text-blue-500'
                        }`}>
                          {isVacant ? '○' : '●'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className={`truncate font-medium ${
                            isVacant ? 'italic text-gray-400' : 'text-gray-700'
                          }`}>
                            {person ? person.name : '空席'}
                          </div>
                          {pos.title && (
                            <div className="text-gray-400 truncate">{pos.title}</div>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className={`font-medium ${isVacant ? 'text-gray-400' : 'text-gray-600'}`}>
                            {pos.band}
                          </div>
                          {isConcurrent && <div className="text-purple-500">兼</div>}
                          {isVacant     && <div className="text-green-600">空席</div>}
                        </div>
                      </button>

                      {/* FillVacantPosition inline form */}
                      {isFilling && (
                        <div className="mx-1 mb-1 rounded border border-green-200 bg-green-50 p-2 space-y-1.5">
                          <div className="text-xs font-medium text-green-700">
                            担当者を割り当て：{pos.title || '(無題)'} / {pos.band}
                          </div>
                          <select
                            value={fillPersonId}
                            onChange={e => setFillPersonId(e.target.value)}
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-green-400"
                          >
                            <option value="">人物を選択…</option>
                            {persons.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <select
                            value={fillEmpType}
                            onChange={e => setFillEmpType(e.target.value)}
                            className="w-full border border-gray-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:border-green-400"
                          >
                            {EMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <div className="flex gap-1">
                            <button
                              onClick={handleFillPosition}
                              disabled={!fillPersonId}
                              className="flex-1 bg-green-600 text-white text-xs py-1 rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              割り当て
                            </button>
                            <button
                              onClick={() => setFillPositionId(null)}
                              className="px-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded bg-white"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>
        ) : (
          /* Summary when no org focused */
          <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2">

            {/* ── 人物追加 ── */}
            <div className="rounded border border-gray-200 bg-white p-2.5 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">人物追加</span>
                <button
                  onClick={() => { setAddPersonOpen(o => !o); setTimeout(() => addPersonNameRef.current?.focus(), 50) }}
                  className="text-xs px-2 py-0.5 rounded border border-dashed border-blue-400 text-blue-600 hover:bg-blue-50"
                >
                  ＋ 追加
                </button>
              </div>
              {addPersonOpen && (
                <div className="space-y-1.5 pt-1 border-t border-gray-100">
                  <input
                    ref={addPersonNameRef}
                    value={addPersonName}
                    onChange={e => setAddPersonName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddPerson()}
                    placeholder="氏名（必須）"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                  />
                  <input
                    value={addPersonEmp}
                    onChange={e => setAddPersonEmp(e.target.value)}
                    placeholder="社員番号（任意・SF登録後に付番）"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400"
                  />
                  <select
                    value={addPersonOrg}
                    onChange={e => setAddPersonOrg(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:border-blue-400"
                  >
                    <option value="">配属先組織（任意）</option>
                    {selectableOrgs.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <p className="text-gray-400 leading-relaxed">
                    組織を選ぶと発令一覧に行が追加されます。
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={handleAddPerson}
                      disabled={!addPersonName.trim()}
                      className="flex-1 bg-blue-600 text-white text-xs py-1 rounded hover:bg-blue-700 disabled:opacity-40"
                    >
                      追加
                    </button>
                    <button
                      onClick={() => { setAddPersonOpen(false); setAddPersonName(''); setAddPersonEmp(''); setAddPersonOrg('') }}
                      className="px-2 text-xs text-gray-500 border border-gray-300 rounded bg-white hover:text-gray-700"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded border border-gray-200 bg-white p-2.5 text-xs space-y-1.5">
              <div className="text-gray-500 font-medium">発令サマリー</div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">操作件数</span>
                <span className="font-semibold text-gray-800">{operations.length} 件</span>
              </div>
              {unconfirmedPersonIds.length > 0 && (
                <div className="flex items-center justify-between text-amber-600">
                  <span>⚠ 未確認</span>
                  <span className="font-semibold">{unconfirmedPersonIds.length} 名</span>
                </div>
              )}
              {unconfirmedPersonIds.length === 0 && operations.length > 0 && (
                <div className="text-green-600">✓ 全員確認済み</div>
              )}
            </div>

            {unconfirmedPersonIds.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                <div className="text-amber-700 font-medium mb-1">未確認の人物</div>
                {unconfirmedPersonIds.slice(0, 6).map(pid => {
                  const person = persons.find(p => p.id === pid)
                  return person ? (
                    <button
                      key={pid}
                      onClick={() => selectPerson(pid)}
                      className="block w-full text-left py-0.5 text-amber-800 hover:text-blue-600 truncate"
                    >
                      {person.name}
                    </button>
                  ) : null
                })}
                {unconfirmedPersonIds.length > 6 && (
                  <div className="text-amber-600 mt-1">他 {unconfirmedPersonIds.length - 6} 名…</div>
                )}
              </div>
            )}

            <div className="text-xs text-gray-400 text-center py-2 leading-relaxed">
              左のツリーで組織を選択すると<br />ポジション一覧が表示されます
            </div>
          </div>
        )}
    </div>
  )
}
