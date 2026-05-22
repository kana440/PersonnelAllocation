// ── エクスポートエンジン切り替え ──────────────────────────────────────────────
//
// 2行ずつセットで切り替える（読み込み・書き込みは同じエンジンを使う）。
//
// ExcelJS 版: 書式・スタイルを保持。xlsm の VBA マクロは失われる。
// xlsx 版:    cellStyles + bookVBA で書式・スタイル・VBA マクロの保持を試みる。

export { importFromFile, importFromUrl, importWorkbook } from './exceljs/importer'
export { exportToXlsx, buildExportBuffer }              from './exceljs/exporter'

// export { importFromFile, importFromUrl, importWorkbook } from './xlsx/importer'
// export { exportToXlsx, buildExportBuffer }              from './xlsx/exporter'

// ── エンジン非依存の共有エクスポート ─────────────────────────────────────────
export { SHEET_ALLOCATION, SHEET_CODE_LISTS, SHEET_ORG_MASTER } from './sheetNames'
export type { ImportedWorkbookResult, ProgressCallback }         from './types'
