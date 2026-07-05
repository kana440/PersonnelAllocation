import { useState } from 'react'
import { useStore } from '../../store/useStore'
import { toAllocationRows } from '../../infrastructure/allocationListMapper'
import { buildExportBuffer, removeOverlay } from '../../infrastructure/excel/engine'
import { workspaceStore } from '../../infrastructure/workspace'

interface Props {
  onCleared: () => void   // セッションクリア後に呼ぶ（sessionReady = false など）
  onCancel:  () => void
}

export function ClearSessionDialog({ onCleared, onCancel }: Props) {
  const store = useStore()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const allOrgs = [...store.organizations, ...store.afterOrganizations.filter(o => !store.organizations.find(b => b.id === o.id))]
  const rows = toAllocationRows(store.allocationList, allOrgs)

  const handleClearWithoutSave = () => {
    workspaceStore.delete('autosave').catch(console.error)
    store.reset()
    onCleared()
  }

  const handleSaveAndClear = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const { buffer, fileName } = await buildExportBuffer(rows, store.effectiveDate)
      const ext      = fileName.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
      const mimeType = ext === 'xlsm'
        ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

      if ('showSaveFilePicker' in window) {
        // File System Access API: ユーザーが保存先を選択→保存できたらクリア
        const handle = await (window as Window & typeof globalThis & {
          showSaveFilePicker: (opts: object) => Promise<FileSystemFileHandle>
        }).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: 'Excel ファイル',
            accept: { [mimeType]: [`.${ext}`] },
          }],
        })
        const writable = await handle.createWritable()
        await writable.write(buffer)
        await writable.close()
      } else {
        // フォールバック: 通常のブラウザダウンロード
        const blob = new Blob([buffer], { type: mimeType })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }

      await workspaceStore.delete('autosave')
      store.reset()
      onCleared()
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // ユーザーがファイルピッカーをキャンセル → クリアしない（何もしない）
      } else {
        setSaveError(String(e))
      }
    } finally {
      setSaving(false)
      removeOverlay()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-gray-800">セッションをクリア</h2>
          <p className="mt-1 text-sm text-gray-600">
            現在のデータ（{rows.length} 行）が消去されます。
          </p>
        </div>

        {saveError && (
          <div className="text-xs text-red-600 bg-red-50 rounded px-3 py-2">
            保存エラー: {saveError}
          </div>
        )}

        <div className="space-y-2">
          {/* 保存してクリア */}
          <button
            onClick={handleSaveAndClear}
            disabled={saving || rows.length === 0}
            className="w-full py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '保存中…' : '📤 保存してクリア'}
          </button>
          <p className="text-xs text-gray-400 text-center -mt-1">
            保存先を選択 → 保存できたらセッションをクリア
          </p>

          {/* 保存せずクリア */}
          <button
            onClick={handleClearWithoutSave}
            className="w-full py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            保存せずにクリア
          </button>

          {/* キャンセル */}
          <button
            onClick={onCancel}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  )
}
