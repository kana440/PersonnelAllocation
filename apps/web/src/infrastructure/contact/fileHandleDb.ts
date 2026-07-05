// FileSystemFileHandle を IndexedDB に保存して起動をまたいで再利用する。
// OPFS ではなく origin-level IndexedDB を使う（OPFS は異なるスコープ）。

const DB_NAME    = 'personnel-file-handles'
const DB_VERSION = 1
const STORE_NAME = 'handles'
const CONTACT_KEY = 'contactFile'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

export async function saveContactFileHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(handle, CONTACT_KEY)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

export async function loadContactFileHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(CONTACT_KEY)
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle | undefined) ?? null)
    req.onerror   = () => reject(req.error)
  })
}

export async function clearContactFileHandle(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(CONTACT_KEY)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

// TypeScript の DOM 型定義に queryPermission / requestPermission がないため拡張
interface FileSystemHandleWithPermission extends FileSystemFileHandle {
  queryPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

/** 保存済みハンドルへの readwrite 権限を確認し、必要なら再要求する */
export async function verifyOrRequestPermission(
  handle: FileSystemFileHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  const h    = handle as FileSystemHandleWithPermission
  const perm = await h.queryPermission({ mode })
  if (perm === 'granted') return true
  const req = await h.requestPermission({ mode })
  return req === 'granted'
}
