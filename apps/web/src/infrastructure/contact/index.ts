import { ContactService }     from '../../application/ContactService'
import { LocalIdentityStore } from './LocalIdentityStore'
import { LocalContactStore }  from './LocalContactStore'
import { NullContactSource }  from './NullContactSource'
import { FileContactSource }  from './FileContactSource'
import { loadContactFileHandle, clearContactFileHandle } from './fileHandleDb'

export { toHeaderTsv, toRequestTsv, toFullTsv, fromTsv, fromSpreadsheet }
  from './ContactTsvSerializer'
export { saveContactFileHandle, clearContactFileHandle, verifyOrRequestPermission }
  from './fileHandleDb'
export type { ContactSourcePort } from '../../ports/ContactSourcePort'

// シングルトンのインフラ実装
const identity = new LocalIdentityStore()
const store    = new LocalContactStore()

export const fileSource = new FileContactSource(null)

// 起動時に IndexedDB 保存済みのファイルハンドルを確認して fileSource に設定する
export async function initContactSource(): Promise<boolean> {
  const handle = await loadContactFileHandle()
  if (!handle) return false
  // ハンドルを設定するが、readwrite 権限要求はユーザー操作時まで遅延
  // (fileSource.requestPermission() はボタンクリック後に呼ぶ)
  fileSource['handle' as keyof FileContactSource] = handle as never
  return true
}

export async function clearContactFile(): Promise<void> {
  await clearContactFileHandle()
  fileSource.clearHandle()
}

// ContactService のファクトリ
export function createContactService(mode: 'file' | null): ContactService {
  const source = mode === 'file' ? fileSource : new NullContactSource()
  return new ContactService(identity, store, source)
}

// デフォルト（source は null — 起動時は NullContactSource）
export const contactService = createContactService(null)

// source を切り替えるヘルパー（設定変更時に contactStore から呼ぶ）
export function rebuildContactService(mode: 'file' | null): ContactService {
  return createContactService(mode)
}
