// ZIP-level Excel エクスポーター（公開 API）
//
// Worker でバックグラウンド圧縮 → プログレスオーバーレイ表示 → showSaveFilePicker で保存

import ExcelJS from 'exceljs'
import { EXPORT_FIELDS, EXPORT_SHEET_NAME, exportFieldValue, buildZipBuffer } from './core'
import type { AllocationRow } from '../../allocationListMapper'
import { getLastBuffer, getLastFileName } from '../state'

// ── プログレスオーバーレイ（DOM 直接操作・React 非依存）────────────────────

const OVERLAY_ID  = 'excel-export-overlay'
const BAR_ID      = 'excel-export-bar'
const PCT_ID      = 'excel-export-pct'
const LABEL_ID    = 'excel-export-label'

const LABELS: Record<number, string> = {
  0:  'Excelを準備中...',
  5:  'ZIPを読み込み中...',
  10: '共有文字列を解析中...',
  15: 'シート構造を解析中...',
  20: 'データ行を生成中...',
  25: 'XMLを組み立て中...',
  30: '圧縮中...',
}

function upsertOverlay(pct: number): void {
  let overlay = document.getElementById(OVERLAY_ID)
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,.45)',
      'z-index:9999', 'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';')
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:28px 36px;min-width:260px;
                  box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:center">
        <p id="${LABEL_ID}" style="margin:0 0 16px;font-size:14px;font-weight:500;color:#111827">
          Excelを準備中...
        </p>
        <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
          <div id="${BAR_ID}"
               style="height:100%;background:#3b82f6;border-radius:3px;width:0%;transition:width .15s ease">
          </div>
        </div>
        <p id="${PCT_ID}" style="margin:10px 0 0;font-size:12px;color:#6b7280">0%</p>
      </div>`
    document.body.appendChild(overlay)
  }
  const label  = document.getElementById(LABEL_ID)
  const bar    = document.getElementById(BAR_ID)
  const pctEl  = document.getElementById(PCT_ID)
  const matched  = Object.entries(LABELS).filter(([k]) => pct >= Number(k))
  const labelText = matched.length > 0 ? matched[matched.length - 1][1] : 'Excelを準備中...'
  if (label)  label.textContent   = labelText
  if (bar)    bar.style.width     = `${pct}%`
  if (pctEl)  pctEl.textContent   = `${pct}%`
}

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove()
}

// ── Worker でバックグラウンド圧縮 ────────────────────────────────────────────

function buildZipBufferInWorker(
  origBuffer: ArrayBuffer,
  rows: AllocationRow[],
  onProgress: (pct: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./zipWorker.ts', import.meta.url), { type: 'module' })

    worker.onmessage = (e: MessageEvent) => {
      const data = e.data as
        | { type: 'progress'; value: number }
        | { type: 'done';     buffer: ArrayBuffer }
        | { type: 'error';    message: string }
      if (data.type === 'progress') {
        onProgress(data.value)
      } else if (data.type === 'done') {
        worker.terminate()
        resolve(data.buffer)
      } else {
        worker.terminate()
        reject(new Error(data.message))
      }
    }

    worker.onerror = err => { worker.terminate(); reject(err) }

    worker.postMessage({ origBuffer, rows })
  })
}

// ── C: 保存ダイアログ ────────────────────────────────────────────────────────

async function saveBuffer(buffer: ArrayBuffer, fileName: string, mimeType: string): Promise<void> {
  const ext = fileName.endsWith('.xlsm') ? 'xlsm' : 'xlsx'

  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'Excel ファイル', accept: { [mimeType]: [`.${ext}`] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(buffer)
      await writable.close()
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }

  // フォールバック: Downloads フォルダへ自動保存
  const blob = new Blob([buffer], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── 新規ワークブックの生成（元ファイルなし時のフォールバック）────────────────

async function buildFreshWorkbook(rows: AllocationRow[]): Promise<ArrayBuffer> {
  const META_KEYS = new Set(['no', 'userId', 'employeeNumber', 'lastName', 'firstName',
    'transferReason', 'memo', 'promotionSign', 'demotionReason', 'payGradeChangeSign'])
  const isAfterField = (key: string) =>
    !key.startsWith('prev') && key !== 'exclusionReason' && !META_KEYS.has(key)

  const metaCount  = EXPORT_FIELDS.filter(f => META_KEYS.has(f.key)).length
  const afterCount = EXPORT_FIELDS.filter(f => isAfterField(f.key)).length
  const prevCount  = EXPORT_FIELDS.filter(f => f.key.startsWith('prev')).length
  const auditCount = EXPORT_FIELDS.length - metaCount - afterCount - prevCount
  const fill       = (n: number) => Array(Math.max(0, n - 1)).fill('')

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(EXPORT_SHEET_NAME)

  ws.addRow(['', '本人情報 / 変更区分', ...fill(metaCount), 'After（発令後）', ...fill(afterCount),
    'Before（発令前）', ...fill(prevCount), ...(auditCount > 0 ? ['除外', ...fill(auditCount)] : [])])
  ws.addRow(['', ...EXPORT_FIELDS.map(f => f.header ?? f.key)])
  rows.forEach(row => ws.addRow([row.assignee ?? '', ...EXPORT_FIELDS.map(f => exportFieldValue(row, f.key) ?? '')]))

  ws.columns = [
    { width: 12 },
    ...EXPORT_FIELDS.map(f => ({
      width:
        f.key === 'no' ? 4 :
        ['userId', 'employeeNumber'].includes(f.key) ? 12 :
        ['lastName', 'firstName'].includes(f.key) ? 8 :
        ['memo', 'concurrentReason', 'prevConcurrentReason'].includes(f.key) ? 20 :
        14,
    })),
  ]

  return wb.xlsx.writeBuffer() as unknown as Promise<ArrayBuffer>
}

// ── 公開 API ─────────────────────────────────────────────────────────────────

export async function buildExportBuffer(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  const origBuffer   = getLastBuffer()
  const origFileName = getLastFileName()
  const baseName     = (origFileName ?? '発令一覧').replace(/\.[^.]+$/, '')
  const ext          = origFileName?.endsWith('.xlsm') ? 'xlsm' : 'xlsx'
  const scopeSuffix  = scopeName ? `_${scopeName.replace(/[/\\?*[\]:]/g, '_')}` : ''
  const fileName     = origBuffer
    ? `${baseName}${scopeSuffix}_${effectiveDate}.${ext}`
    : `発令一覧${scopeSuffix}_${effectiveDate}.xlsx`

  if (origBuffer) {
    // Worker が使えるか確認（SSR や古いブラウザでは直接実行）
    const canUseWorker = typeof Worker !== 'undefined'
    const buffer = canUseWorker
      ? await buildZipBufferInWorker(origBuffer, rows, pct => upsertOverlay(pct))
      : await buildZipBuffer(origBuffer, rows)
    return { buffer, fileName }
  }

  const buffer = await buildFreshWorkbook(rows)
  return { buffer, fileName }
}

export async function exportToXlsx(
  rows: AllocationRow[],
  effectiveDate: string,
  scopeName?: string,
): Promise<void> {
  upsertOverlay(0)
  try {
    const { buffer, fileName } = await buildExportBuffer(rows, effectiveDate, scopeName)
    upsertOverlay(100)
    const mimeType = fileName.endsWith('.xlsm')
      ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    await saveBuffer(buffer, fileName, mimeType)
  } finally {
    removeOverlay()
  }
}
