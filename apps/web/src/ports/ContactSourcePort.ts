import type { ContactRecord } from './contactTypes'

export interface ContactSourcePort {
  /** ファイルハンドルがあり読み取り可能か */
  isAvailable(): boolean
  /** ファイルハンドルへの書き込み権限があるか */
  isWritable(): boolean
  /** Excel から全件読み込んで返す */
  readAll(): Promise<ContactRecord[]>
  /** 指定IDの1件を読み込む（送信前の競合チェック用）*/
  readOne(id: string): Promise<ContactRecord | null>
  /** 1件を Excel に書き込む（行が存在すれば上書き、なければ末尾に追加）*/
  writeRecord(record: ContactRecord): Promise<void>
}
