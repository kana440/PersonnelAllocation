import { useState }       from 'react'
import { createPortal }   from 'react-dom'
import { useContactStore } from '../../../store/contactStore'
import { useStore }        from '../../../store/useStore'
import { OrgPickerModal }  from '../../common/OrgPickerModal'
import { REQUEST_TYPE_LABEL } from '../../../ports/contactTypes'
import type { RequestType } from '../../../ports/contactTypes'

const FIELD_BY_TYPE: Record<RequestType, string> = {
  employee_id:   'userId',
  position_code: 'positionCode',
  band_grade:    'band',
  other:         '',
}

export function ContactForm() {
  const { create, closeForm } = useContactStore()
  const afterOrganizations    = useStore(s => s.afterOrganizations)
  const beforeOrganizations   = useStore(s => s.beforeOrganizations)
  const allocationList        = useStore(s => s.allocationList)

  const [personName,          setPersonName]          = useState('')
  const [requestType,         setRequestType]         = useState<RequestType>('employee_id')
  const [requestSummary,      setRequestSummary]      = useState('')
  const [targetOrgId,         setTargetOrgId]         = useState('')
  const [targetOrgName,       setTargetOrgName]       = useState('')
  const [assigneeHint,        setAssigneeHint]        = useState('')
  const [beforeOrgCode,       setBeforeOrgCode]       = useState('')
  const [beforeOrgName,       setBeforeOrgName]       = useState('')
  const [orgPickerOpen,       setOrgPickerOpen]       = useState(false)
  const [beforeOrgPickerOpen, setBeforeOrgPickerOpen] = useState(false)
  const [submitting,          setSubmitting]          = useState(false)
  const [error,               setError]               = useState<string | null>(null)
  const [isDragOver,          setIsDragOver]          = useState(false)

  const handleOrgSelect = (orgId: string) => {
    const org = afterOrganizations.find(o => o.id === orgId)
    setTargetOrgId(org?.externalCode ?? orgId)
    setTargetOrgName(org?.name ?? orgId)
    setOrgPickerOpen(false)
  }

  const handleBeforeOrgSelect = (orgId: string) => {
    const org = beforeOrganizations.find(o => o.id === orgId)
    setBeforeOrgCode(org?.externalCode ?? '')
    setBeforeOrgName(org?.name ?? '')
    setBeforeOrgPickerOpen(false)
  }

  // ── キャンバスカードのドロップ ───────────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/json')) return
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const json = e.dataTransfer.getData('application/json')
    if (!json) return
    try {
      const data = JSON.parse(json) as { dragType?: string; rowId?: number }
      if (data.dragType !== 'person' || data.rowId == null) return
      const row = allocationList.find(r => r.rowId === data.rowId)
      if (!row) return

      const name = [row.lastName, row.firstName].filter(Boolean).join(' ')
      if (name) setPersonName(name)

      // 変更後組織（After）→ 宛先組織
      if (row.departmentCode) {
        const org = afterOrganizations.find(o => o.externalCode === row.departmentCode)
        if (org) { setTargetOrgId(org.externalCode ?? ''); setTargetOrgName(org.name) }
      }

      // 変更前組織（Before）→ Before組織ヒント
      if (row.prevDepartmentCode) {
        const org = beforeOrganizations.find(o => o.externalCode === row.prevDepartmentCode)
        if (org) { setBeforeOrgCode(org.externalCode ?? ''); setBeforeOrgName(org.name) }
      }
    } catch { /* ignore malformed JSON */ }
  }

  const handleSubmit = async () => {
    if (!personName.trim())     { setError('対象者名を入力してください'); return }
    if (!targetOrgId)           { setError('宛先組織を選択してください'); return }
    if (!requestSummary.trim()) { setError('依頼概要を入力してください'); return }
    setError(null)
    setSubmitting(true)
    try {
      await create({
        personName:        personName.trim(),
        anchorRowId:       -1,
        fieldKey:          FIELD_BY_TYPE[requestType] || 'other',
        requestType,
        requestSummary:    requestSummary.trim(),
        targetOrgId,
        targetOrgName,
        assigneeHint:      assigneeHint.trim() || undefined,
        beforeOrgCodeHint: beforeOrgCode || undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className={`flex-1 overflow-y-auto p-3 flex flex-col gap-3 relative transition-colors ${
        isDragOver ? 'bg-blue-50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-700">新規起票</span>
        <button onClick={closeForm} className="text-[10px] text-gray-400 hover:text-gray-600">キャンセル</button>
      </div>

      {/* ドラッグヒント */}
      {isDragOver ? (
        <div className="rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 px-3 py-4 text-center text-[11px] text-blue-600 font-semibold">
          ここにドロップして氏名・組織を入力
        </div>
      ) : (
        <div className="rounded border border-dashed border-gray-200 px-2 py-1.5 text-center text-[10px] text-gray-400">
          キャンバスのカードをここにドラッグして入力
        </div>
      )}

      {error && <div className="text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{error}</div>}

      {/* Before組織を最上部に配置 */}
      <Field label="対象者のBefore組織（任意）">
        <div className="flex gap-1.5 items-center">
          <div className={`flex-1 ${input} ${beforeOrgCode ? 'text-gray-800' : 'text-gray-400'}`}>
            {beforeOrgName || '現在の所属組織（受信者フィルタ用）'}
          </div>
          <button
            onClick={() => setBeforeOrgPickerOpen(true)}
            className="px-2 py-1 text-[11px] text-gray-500 border border-gray-300 rounded hover:bg-gray-50"
          >
            選択
          </button>
          {beforeOrgCode && (
            <button onClick={() => { setBeforeOrgCode(''); setBeforeOrgName('') }}
              className="text-[10px] text-gray-400 hover:text-red-500">✕</button>
          )}
        </div>
        {beforeOrgCode && (
          <div className="text-[10px] text-gray-400 mt-0.5">{beforeOrgCode}</div>
        )}
      </Field>

      <Field label="対象者名" required>
        <input
          value={personName} onChange={e => setPersonName(e.target.value)}
          className={input} placeholder="田中 太郎"
        />
      </Field>

      <Field label="依頼種別" required>
        <select
          value={requestType} onChange={e => setRequestType(e.target.value as RequestType)}
          className={input}
        >
          {(Object.entries(REQUEST_TYPE_LABEL) as [RequestType, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </Field>

      <Field label="宛先組織（変更後）" required>
        <div className="flex gap-1.5 items-center">
          <div className={`flex-1 ${input} ${targetOrgId ? 'text-gray-800 font-medium' : 'text-gray-400'}`}>
            {targetOrgName || '組織を選択…'}
          </div>
          <button
            onClick={() => setOrgPickerOpen(true)}
            className="px-2 py-1 text-[11px] text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
          >
            選択
          </button>
        </div>
        {targetOrgId && (
          <div className="text-[10px] text-gray-400 mt-0.5">{targetOrgId}</div>
        )}
      </Field>

      <Field label="担当者ヒント（任意）">
        <input
          value={assigneeHint} onChange={e => setAssigneeHint(e.target.value)}
          className={input} placeholder="田村さん"
        />
      </Field>

      <Field label="依頼概要" required>
        <textarea
          value={requestSummary} onChange={e => setRequestSummary(e.target.value)}
          className={`${input} resize-none h-16`}
          placeholder="田中太郎の社員IDを確認したい（4月から出向受入予定）"
        />
      </Field>

      <button
        onClick={handleSubmit} disabled={submitting}
        className="w-full py-2 text-xs font-semibold text-white bg-blue-600 rounded
          hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? '作成中…' : '起票する'}
      </button>

      {/* Portal で document.body に移動 — ContactPanel の CSS transform スタック外に出す */}
      {orgPickerOpen && createPortal(
        <OrgPickerModal
          open={orgPickerOpen}
          onClose={() => setOrgPickerOpen(false)}
          onSelect={handleOrgSelect}
          title="宛先組織を選択（変更後）"
          confirmLabel="選択"
          alreadyAddedIds={new Set()}
        />,
        document.body
      )}

      {beforeOrgPickerOpen && createPortal(
        <OrgPickerModal
          open={beforeOrgPickerOpen}
          onClose={() => setBeforeOrgPickerOpen(false)}
          onSelect={handleBeforeOrgSelect}
          title="Before組織を選択（対象者の現在の所属）"
          confirmLabel="選択"
          orgs={beforeOrganizations}
          alreadyAddedIds={new Set()}
        />,
        document.body
      )}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const input = 'w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400 bg-white'
