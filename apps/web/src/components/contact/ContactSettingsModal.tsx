import { useState } from 'react'
import { ModalShell }        from '../common/ModalShell'
import { useSettingsStore }  from '../../store/settingsStore'
import { fileSource, clearContactFile, saveContactFileHandle } from '../../infrastructure/contact'
import { downloadContactTemplate } from '../../infrastructure/contact/createTemplateXlsx'
import { useContactStore }   from '../../store/contactStore'

interface Props { onClose: () => void }

export function ContactSettingsModal({ onClose }: Props) {
  const { myEmail, myDisplayName, contactSourceMode, hasContactFileHandle,
          saveIdentity, setContactSourceMode, setHasContactFileHandle } = useSettingsStore()
  const load = useContactStore(s => s.load)

  const [email,       setEmail]       = useState(myEmail ?? '')
  const [displayName, setDisplayName] = useState(myDisplayName ?? '')
  const [pickStatus,  setPickStatus]  = useState<'idle' | 'picking' | 'ok' | 'error'>('idle')
  const [pickName,    setPickName]    = useState<string | null>(null)

  const handleSaveIdentity = () => {
    if (!email.trim()) return
    saveIdentity(email.trim(), displayName.trim() || undefined)
  }

  const handlePickFile = async () => {
    setPickStatus('picking')
    try {
      const [handle] = await (window as unknown as {
        showOpenFilePicker: (opts: object) => Promise<FileSystemFileHandle[]>
      }).showOpenFilePicker({
        types: [{ description: 'Excel', accept: {
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        }}],
        multiple: false,
        // readwrite 権限を最初から要求する
        mode: 'readwrite',
      })
      await fileSource.setHandle(handle)
      await saveContactFileHandle(handle)
      setHasContactFileHandle(true)
      setPickName(handle.name)
      setContactSourceMode('file')
      setPickStatus('ok')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setPickStatus('error')
      else setPickStatus('idle')
    }
  }

  const handleClearFile = async () => {
    await clearContactFile()
    setContactSourceMode(null)
    setHasContactFileHandle(false)
    setPickName(null)
    setPickStatus('idle')
  }

  const handleSync = async () => {
    if (contactSourceMode === 'file') {
      const ok = await fileSource.requestPermission()
      if (!ok) { alert('ファイルへのアクセスが拒否されました'); return }
    }
    await load()
    onClose()
  }

  const isIdentitySet  = !!email.trim()
  const isSourceSet    = contactSourceMode !== null
  const canUseContacts = isIdentitySet && isSourceSet

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-md">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-800">連絡票の設定</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>

        {/* アイデンティティ */}
        <Section title="自分の情報">
          <label className={labelCls}>メールアドレス <Required /></label>
          <input value={email} onChange={e => setEmail(e.target.value)} className={inputCls}
            placeholder="yamada@example.com" type="email" />
          <label className={`${labelCls} mt-2`}>表示名（任意）</label>
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} className={inputCls}
            placeholder="山田 太郎" />
          <button
            onClick={handleSaveIdentity} disabled={!email.trim()}
            className="mt-2 px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
          >
            保存
          </button>
        </Section>

        {/* ファイルソース */}
        <Section title="連絡票ファイル（Box・マウントドライブ）">
          <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
            Box や共有ドライブ上の <code className="bg-gray-100 px-1 rounded">.xlsx</code> を指定します。
            読み書き両方に使います（Chrome / Edge のみ対応）。
          </p>

          {/* 初期化ダウンロード */}
          <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-2.5 mb-3">
            <div className="text-[11px] font-semibold text-gray-700 mb-1">
              連絡票ファイルをまだ用意していない場合
            </div>
            <p className="text-[10px] text-gray-500 mb-2 leading-relaxed">
              ヘッダー行だけ入った空の .xlsx を生成します。<br />
              ダウンロードして Box や共有ドライブに置いてください。
            </p>
            <DownloadTemplateButton />
          </div>

          {/* ファイル選択 */}
          <div className={`rounded border p-2.5 ${contactSourceMode === 'file' ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-gray-700">ファイルを指定</span>
              {contactSourceMode === 'file' && <span className="text-[9px] text-blue-600 font-bold">使用中</span>}
            </div>
            {pickName && contactSourceMode === 'file' && (
              <div className="text-[10px] text-gray-500 mb-1.5 truncate">📄 {pickName}</div>
            )}
            <div className="flex gap-1.5 items-center">
              <button onClick={handlePickFile}
                className="text-[11px] px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50">
                {pickStatus === 'picking' ? '選択中…'
                  : hasContactFileHandle && contactSourceMode === 'file' ? '変更'
                  : 'ファイルを選択'}
              </button>
              {pickStatus === 'ok'    && <span className="text-[10px] text-green-600">✓ 設定済み（読み書き）</span>}
              {pickStatus === 'error' && <span className="text-[10px] text-red-500">エラー（読み書き権限が必要です）</span>}
            </div>
          </div>

          {isSourceSet && (
            <button onClick={handleClearFile}
              className="mt-2 text-[10px] text-red-400 hover:text-red-600">
              ファイル設定を解除
            </button>
          )}
        </Section>

        {/* ステータス */}
        <div className={`mt-1 rounded px-3 py-2 text-[11px] ${canUseContacts ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {canUseContacts
            ? '✓ 連絡票機能が有効です（読み書き）'
            : `連絡票機能を使うには${!isIdentitySet ? 'メールアドレスの設定' : 'ファイルの設定'}が必要です`}
        </div>

        {isSourceSet && (
          <button onClick={handleSync}
            className="mt-3 w-full py-1.5 text-xs font-semibold text-blue-600 border border-blue-300 rounded hover:bg-blue-50">
            ↻ ファイルを読み込んで閉じる
          </button>
        )}
      </div>
    </ModalShell>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{title}</div>
      {children}
    </div>
  )
}

function Required() { return <span className="text-red-500 ml-0.5">*</span> }

function DownloadTemplateButton() {
  const [status, setStatus] = useState<'idle' | 'generating' | 'done'>('idle')
  const handle = async () => {
    setStatus('generating')
    try {
      await downloadContactTemplate()
      setStatus('done')
      setTimeout(() => setStatus('idle'), 3000)
    } catch { setStatus('idle') }
  }
  return (
    <button onClick={handle} disabled={status === 'generating'}
      className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold
        bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors">
      {status === 'generating' ? '生成中…' : status === 'done' ? '✓ ダウンロード完了' : '⬇ 連絡票テンプレートをダウンロード'}
    </button>
  )
}

const labelCls = 'block text-[11px] font-semibold text-gray-600 mb-0.5'
const inputCls = 'w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-400'
