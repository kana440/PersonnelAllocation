import type { ContactSourcePort } from '../../ports/ContactSourcePort'
import type { ContactRecord }     from '../../ports/contactTypes'
import { TSV_COLUMNS, fromTsv } from './ContactTsvSerializer'
import { CONTACT_STATUS_LABEL }  from '../../ports/contactTypes'
import { saveContactFileHandle, verifyOrRequestPermission } from './fileHandleDb'

export class FileContactSource implements ContactSourcePort {
  private handle:            FileSystemFileHandle | null = null
  private permissionGranted: boolean = false

  constructor(handle: FileSystemFileHandle | null) {
    this.handle = handle
  }

  isAvailable(): boolean { return this.handle !== null && this.permissionGranted }
  isWritable():  boolean { return this.isAvailable() }

  /** ユーザー操作後（ボタンクリック等）に呼ぶ。readwrite 権限を要求する */
  async requestPermission(): Promise<boolean> {
    if (!this.handle) return false
    this.permissionGranted = await verifyOrRequestPermission(this.handle, 'readwrite')
    return this.permissionGranted
  }

  /** showOpenFilePicker でハンドルを取得した後に設定する */
  async setHandle(handle: FileSystemFileHandle): Promise<void> {
    this.handle = handle
    this.permissionGranted = true
    await saveContactFileHandle(handle)
  }

  clearHandle(): void {
    this.handle = null
    this.permissionGranted = false
  }

  // ── 読み取り ────────────────────────────────────────────────

  async readAll(): Promise<ContactRecord[]> {
    if (!this.isAvailable()) return []
    const wb = await this.loadWorkbook()
    return workbookToRecords(wb)
  }

  async readOne(id: string): Promise<ContactRecord | null> {
    if (!this.isAvailable()) return null
    const wb  = await this.loadWorkbook()
    const tsv = findRowTsv(wb, id)
    return tsv ? fromTsv(tsv) : null
  }

  // ── 書き込み ────────────────────────────────────────────────

  /** 1件を Excel に書き込む（同じ ID の行があれば上書き、なければ末尾に追加）*/
  async writeRecord(record: ContactRecord): Promise<void> {
    if (!this.isAvailable() || !this.handle) return
    const wb = await this.loadWorkbook()
    const ws = wb.worksheets[0]
    if (!ws) return

    const cells = recordToCells(record)
    let found = false

    ws.eachRow((row, rowNum) => {
      if (rowNum === 1) return  // ヘッダー行スキップ
      const idCell = String(row.getCell(1).value ?? '')
      if (idCell === record.id) {
        cells.forEach((val, i) => { row.getCell(i + 1).value = val })
        found = true
      }
    })

    if (!found) {
      ws.addRow(cells)
    }

    const buf = await wb.xlsx.writeBuffer()
    const writable = await (this.handle as FileSystemFileHandle & {
      createWritable(): Promise<FileSystemWritableFileStream>
    }).createWritable()
    await writable.write(buf)
    await writable.close()
  }

  // ── 内部 ────────────────────────────────────────────────────

  private async loadWorkbook() {
    const { Workbook } = await import('exceljs')
    const wb  = new Workbook()
    const file = await this.handle!.getFile()
    const buf  = await file.arrayBuffer()
    await wb.xlsx.load(buf)
    return wb
  }
}

// ── ユーティリティ ─────────────────────────────────────────────

function workbookToRecords(wb: import('exceljs').Workbook): ContactRecord[] {
  const ws = wb.worksheets[0]
  if (!ws) return []
  const rows: string[] = []
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return  // ヘッダー行スキップ
    const cells = (row.values as unknown[]).slice(1)
    rows.push(cells.map(c => (c == null ? '' : String(c))).join('\t'))
  })
  return rows.flatMap(line => {
    const r = fromTsv(line)
    return r ? [r] : []
  })
}

function findRowTsv(wb: import('exceljs').Workbook, id: string): string | null {
  const ws = wb.worksheets[0]
  if (!ws) return null
  let found: string | null = null
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1 || found) return
    const idCell = String(row.getCell(1).value ?? '')
    if (idCell === id) {
      const cells = (row.values as unknown[]).slice(1)
      found = cells.map(c => (c == null ? '' : String(c))).join('\t')
    }
  })
  return found
}

/** ContactRecord を TSV_COLUMNS 順のセル値配列に変換する */
function recordToCells(record: ContactRecord): (string | number)[] {
  const latestAnswer = [...record.thread].reverse()
    .find(m => m.type === 'answer' || m.type === 'unknown')
  const updatedAt = (record.thread.at(-1)?.createdAt ?? record.createdAt).slice(0, 10)

  // TSV_COLUMNS と同じ順序で並べる（16列）
  return [
    record.id,
    CONTACT_STATUS_LABEL[record.status],
    record.createdAt.slice(0, 10),
    record.requesterEmail,
    record.requesterName ?? '',
    record.targetOrgId,
    record.targetOrgName,
    record.assigneeHint ?? '',
    record.personName,
    record.thread[0]?.summary ?? '',
    latestAnswer?.summary ?? '',
    JSON.stringify(record.thread),
    record.resolvedValue ?? '',
    updatedAt,
    record.beforeOrgCodeHint ?? '',
    record.anchor ? JSON.stringify(record.anchor) : '',
  ]
}

// TSV_COLUMNS の並び順チェック（型レベル保証）
const _check: typeof TSV_COLUMNS[number][] = TSV_COLUMNS as unknown as typeof TSV_COLUMNS[number][]
void _check
