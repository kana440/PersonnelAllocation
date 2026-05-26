import { useState } from 'react'
import { appService } from '../../../application/HRApplicationService'
import type { Person } from '../../../domain/schemas'
import type { AllocationRow } from '../../../domain/allocationRow'

interface BulkProps {
  selectedPersonIds: Set<string>
  persons:           Person[]
  allocationList:    AllocationRow[]
  onDone:            () => void
  onCancel:          () => void
}

function getPrimaryRows(personIds: Set<string>, persons: Person[], allocationList: AllocationRow[]): AllocationRow[] {
  const rows: AllocationRow[] = []
  for (const personId of personIds) {
    const person = persons.find(p => p.id === personId)
    if (!person?.sfPersonId) continue
    const row = allocationList.find(r => r.userId === person.sfPersonId && !r.concurrentType)
             ?? allocationList.find(r => r.userId === person.sfPersonId)
    if (row) rows.push(row)
  }
  return rows
}

function ModalShell({ title, count, onCancel, children }: {
  title:    string
  count:    number
  onCancel: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <span className="text-xs text-gray-500">{count}名対象</span>
        </div>
        {children}
        <button onClick={onCancel} className="w-full text-xs text-gray-500 hover:text-gray-700 transition-colors">
          キャンセル
        </button>
      </div>
    </div>
  )
}

export function BulkTransferReasonModal({ selectedPersonIds, persons, allocationList, onDone, onCancel }: BulkProps) {
  const { codeLists } = appService.getSnapshot()
  const [value, setValue] = useState('')

  const handleApply = () => {
    const rows = getPrimaryRows(selectedPersonIds, persons, allocationList)
    for (const row of rows) appService.saveRow(row.rowId, { transferReason: value })
    onDone()
  }

  return (
    <ModalShell title="異動事由（一括）" count={selectedPersonIds.size} onCancel={onCancel}>
      <div className="space-y-1.5">
        <label className="text-xs text-gray-500">異動事由を選択してください</label>
        <select
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-400"
        >
          <option value="">（クリア）</option>
          {codeLists.transferReasons.map(opt => (
            <option key={opt.code} value={opt.code}>{opt.label || opt.code}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleApply}
        className="w-full py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        {selectedPersonIds.size}名に適用
      </button>
    </ModalShell>
  )
}

export function BulkManagerModal({ selectedPersonIds, persons, allocationList, onDone, onCancel }: BulkProps) {
  const [search,          setSearch]          = useState('')
  const [selectedPosCode, setSelectedPosCode] = useState('')
  const [selectedName,    setSelectedName]    = useState('')

  const candidates = allocationList.filter(r => r.positionCode && r.userId)
  const q = search.trim()
  const filtered = q
    ? candidates.filter(r => {
        const name = `${r.lastName ?? ''}${r.firstName ?? ''}`
        return name.includes(q) || (r.positionCode ?? '').includes(q)
      })
    : candidates.slice(0, 30)

  const handleApply = () => {
    const rows = getPrimaryRows(selectedPersonIds, persons, allocationList)
    for (const row of rows) {
      appService.saveRow(row.rowId, { managerPositionCode: selectedPosCode, managerName: selectedName })
    }
    onDone()
  }

  return (
    <ModalShell title="上司ポジション変更（一括）" count={selectedPersonIds.size} onCancel={onCancel}>
      <div className="space-y-2">
        <label className="text-xs text-gray-500">名前または管理コードで検索</label>
        <input
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="名前で検索…"
          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
        {selectedPosCode && (
          <div className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 font-medium">
            選択中: {selectedName}（{selectedPosCode}）
          </div>
        )}
        <div className="border border-gray-200 rounded-lg max-h-36 overflow-y-auto">
          {filtered.map(r => {
            const name = [r.lastName, r.firstName].filter(Boolean).join(' ')
            return (
              <button
                key={r.rowId}
                onClick={() => {
                  setSelectedPosCode(r.positionCode ?? '')
                  setSelectedName([r.lastName, r.firstName].filter(Boolean).join(', '))
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex gap-2 items-center border-b border-gray-100 last:border-0 ${
                  r.positionCode === selectedPosCode ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-gray-700'
                }`}
              >
                <span className="flex-1 truncate">{name}</span>
                <span className="flex-shrink-0 text-[10px] text-gray-400 tabular-nums">{r.positionCode}</span>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-4">該当なし</div>
          )}
        </div>
      </div>
      <button
        onClick={handleApply}
        disabled={!selectedPosCode}
        className="w-full py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {selectedPersonIds.size}名に適用
      </button>
    </ModalShell>
  )
}

export function BulkSecondmentModal({ selectedPersonIds, persons, allocationList, onDone, onCancel }: BulkProps) {
  const { codeLists } = appService.getSnapshot()
  const [toCompany, setToCompany] = useState('')

  const handleApply = () => {
    const rows = getPrimaryRows(selectedPersonIds, persons, allocationList)
    for (const row of rows) appService.saveRow(row.rowId, { secondmentToCompany: toCompany })
    onDone()
  }

  return (
    <ModalShell title="出向先会社（一括）" count={selectedPersonIds.size} onCancel={onCancel}>
      <div className="space-y-1.5">
        <label className="text-xs text-gray-500">出向先会社（クリアで解除）</label>
        <select
          value={toCompany}
          onChange={e => setToCompany(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-blue-400"
        >
          <option value="">（クリア）</option>
          {codeLists.companies.map(c => (
            <option key={c.code} value={c.code}>{c.label || c.code}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleApply}
        className="w-full py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        {selectedPersonIds.size}名に適用
      </button>
    </ModalShell>
  )
}
