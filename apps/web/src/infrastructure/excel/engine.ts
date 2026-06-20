// ── エンジン設定 ───────────────────────────────────────────────────────────────
//
// インポート: ExcelJS（書式・スタイル・VBA 情報を正確に解析）
// エクスポート: JSZip による外科的 XML 書き換え（元ファイルの書式・マクロを保持）
//              元ファイルなし時は ExcelJS で新規ワークブック生成

export { importFromFile, importFromUrl, importWorkbook } from './exceljs/importer'
export { exportToXlsx, buildExportBuffer }              from './zip/exporter'

// ── エンジン非依存の共有エクスポート ─────────────────────────────────────────
export { SHEET_ALLOCATION, SHEET_MASTERS, SHEET_ORG_MASTER, SHEET_ORG_MASTER_OLD, SHEET_COMPANY } from './sheetNames'
export type { ImportedWorkbookResult, ProgressCallback }         from './types'
