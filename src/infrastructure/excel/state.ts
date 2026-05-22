// 元ファイルをバイト列で保持（エクスポート時の round-trip 用）
let _lastBuffer: ArrayBuffer | null = null
let _lastFileName: string | null = null

export function setLastWorkbook(buffer: ArrayBuffer, fileName: string): void {
  _lastBuffer  = buffer
  _lastFileName = fileName
}

export function getLastBuffer(): ArrayBuffer | null { return _lastBuffer }
export function getLastFileName(): string | null { return _lastFileName }
