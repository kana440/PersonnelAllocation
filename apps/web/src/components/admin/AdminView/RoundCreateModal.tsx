import { useState, useEffect, useRef } from 'react'
import { adminApi, type ApiRound, type CreateRoundBody } from '../../../infrastructure/api/adminApi'
import { importFromFile } from '../../../infrastructure/excel/exceljs/importer'
import type { AllocationRow } from '@personnel/domain/allocationRow'
import type { Organization } from '@personnel/domain/schemas'
import type { AllCodeLists } from '@personnel/domain/masters/aggregate'

interface ImportedData {
  rows:               AllocationRow[]
  beforeOrganizations: Organization[]
  afterOrganizations:  Organization[]
  codeLists:           AllCodeLists
  excelBase64:         string
  filename:            string
}

interface Props {
  onCreated: () => void
  onCancel:  () => void
}

export function RoundCreateModal({ onCreated, onCancel }: Props) {
  const [prevRounds,    setPrevRounds]    = useState<ApiRound[]>([])
  const [label,         setLabel]         = useState('')
  const [companyId,     setCompanyId]     = useState('company-demo')
  const [basedOn,       setBasedOn]       = useState('')
  const [importedData,  setImportedData]  = useState<ImportedData | null>(null)
  const [importing,     setImporting]     = useState(false)
  const [importMsg,     setImportMsg]     = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    adminApi.rounds.list()
      .then(r => setPrevRounds(r.filter(rd => rd.status === 'merged')))
      .catch(() => {})
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportMsg(null); setError(null)
    try {
      const result = await importFromFile(file, msg => setImportMsg(msg))

      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const excelBase64 = btoa(binary)

      setImportedData({
        rows:                result.allocationList,
        beforeOrganizations: result.beforeOrganizations,
        afterOrganizations:  result.afterOrganizations,
        codeLists:           result.codeLists,
        excelBase64,
        filename:            file.name,
      })
      setImportMsg(`${result.allocationList.length.toLocaleString()} 行を読み込みました（組織: ${result.afterOrganizations.length} 件）`)
    } catch (e) {
      setError(`Excel の読み込みに失敗しました: ${String(e)}`)
      setImportedData(null)
    } finally {
      setImporting(false)
    }
  }

  const handleClear = () => {
    setImportedData(null)
    setImportMsg(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSave = async () => {
    if (!label.trim())     { setError('申請回名を入力してください'); return }
    if (!companyId.trim()) { setError('会社 ID を入力してください'); return }
    if (!importedData)     { setError('Excel ファイルをアップロードしてください'); return }
    setSaving(true); setError(null)
    try {
      const body: CreateRoundBody = {
        label:     label.trim(),
        kind:      'annual',
        companyId: companyId.trim(),
        ...(basedOn ? { basedOnRoundId: basedOn } : {}),
        ...(importedData ? {
          rows:                importedData.rows,
          beforeOrganizations: importedData.beforeOrganizations,
          afterOrganizations:  importedData.afterOrganizations,
          codeLists:           importedData.codeLists,
          excelBase64:         importedData.excelBase64,
          excelFilename:       importedData.filename,
        } : {}),
      }
      await adminApi.rounds.create(body)
      onCreated()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const dataNote = importedData
    ? `Excel の ${importedData.rows.length.toLocaleString()} 行をそのまま使います`
    : basedOn
      ? `前回申請回のデータを引き継ぎます`
      : ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gray-800 text-white px-5 py-3">
          <h2 className="text-sm font-bold">新規申請回を作成</h2>
        </div>
        <div className="p-5 space-y-5">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">{error}</div>}

          {/* ラウンド名 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              申請回名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleSave()}
              autoFocus
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="例: 2026年1月度人員異動"
            />
          </div>

          {/* 会社 ID */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              会社 ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="例: company-demo"
            />
          </div>

          {/* Excel アップロード */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700">
              Excel（初期データ） <span className="text-red-500">*</span>
            </label>
            <div
              className={`border-2 border-dashed rounded px-4 py-4 text-center cursor-pointer transition-colors ${
                importing
                  ? 'border-blue-300 bg-blue-50'
                  : importedData
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
              onClick={() => !importedData && fileRef.current?.click()}
            >
              {importing ? (
                <span className="text-xs text-blue-600">{importMsg ?? '読み込み中…'}</span>
              ) : importedData ? (
                <div>
                  <div className="text-xs text-green-700 font-medium">{importMsg}</div>
                  <button
                    onClick={e => { e.stopPropagation(); handleClear() }}
                    className="mt-1 text-xs text-gray-400 hover:text-red-500 underline"
                  >
                    クリアして選び直す
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-400">
                  Excel（.xlsx）をクリックして選択
                </span>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx"
                onChange={e => void handleFileChange(e)}
                className="hidden"
              />
            </div>

            {/* 前回申請回引き継ぎ — Excel なし・確定済み申請回があるときのみ表示 */}
            {!importedData && prevRounds.length > 0 && (
              <div className="mt-2 space-y-1">
                <label className="text-xs text-gray-500">前回申請回からデータを引き継ぐ（任意）</label>
                <select
                  value={basedOn}
                  onChange={e => setBasedOn(e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400 text-gray-700"
                >
                  <option value="">引き継がない（新規）</option>
                  {prevRounds.map((r, i) => (
                    <option key={r.id} value={r.id}>
                      {r.label}{i === 0 ? '（最新）' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {dataNote && (
              <p className="text-xs text-gray-400 mt-1">{dataNote}</p>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || importing || !label.trim() || !importedData}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '作成中…' : '作成'}
          </button>
        </div>
      </div>
    </div>
  )
}
