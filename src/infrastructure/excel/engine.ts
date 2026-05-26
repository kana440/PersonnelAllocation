// ── エンジン設定 ───────────────────────────────────────────────────────────────
//
// インポート: ExcelJS（書式・スタイル・VBA 情報を正確に解析）
// エクスポート: xlsx（ExcelJS の writeBuffer は 1 分超かかるため xlsx に切替）
//
// xlsx エクスポートは cellStyles: true + bookVBA: true で元ファイルの書式・マクロ
// を保持する。ExcelJS と同等の書式再現性は持たないが、速度が 10〜100 倍速い。

export { importFromFile, importFromUrl, importWorkbook } from './exceljs/importer'
export { exportToXlsx, buildExportBuffer }              from './xlsx/exporter'

// ── エンジン非依存の共有エクスポート ─────────────────────────────────────────
export { SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER, SHEET_COMPANY } from './sheetNames'
export type { ImportedWorkbookResult, ProgressCallback }         from './types'
