import type { FieldDef } from '../domain/csvImport/types'
import type { PositionImport } from '../domain/csvImport/position/schema'
import { POSITION_IMPORT_FIELDS } from '../domain/csvImport/position/labels'
import { toPositionImport, type PositionImportInput } from '../domain/csvImport/position/resolver'

// ── Generic CSV utilities ─────────────────────────────────────────

function toCsvCell(value: unknown): string {
  if (value == null) return ''
  const str = typeof value === 'boolean' ? String(value) : String(value)
  return str.includes(',') || str.includes('"') || str.includes('\n')
    ? `"${str.replace(/"/g, '""')}"`
    : str
}

// Resolves a dot-notation key (e.g. "company.externalCode") against a nested object.
function resolveKey(obj: Record<string, unknown>, key: string): unknown {
  const dot = key.indexOf('.')
  if (dot === -1) return obj[key]
  const parent = key.slice(0, dot)
  const child  = key.slice(dot + 1)
  return (obj[parent] as Record<string, unknown> | undefined)?.[child]
}

function buildCsvContent(fields: FieldDef[], dataRows: unknown[][]): string {
  const header1 = fields.map(f => toCsvCell(f.header ?? f.key))
  const header2 = fields.map(f => toCsvCell(f.en))
  const header3 = fields.map(f => toCsvCell(f.ja))
  const lines = [
    header1.join(','),
    header2.join(','),
    header3.join(','),
    ...dataRows.map(row => row.map(toCsvCell).join(',')),
  ]
  return '﻿' + lines.join('\r\n') // UTF-8 BOM for Excel
}

function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Position import ───────────────────────────────────────────────

function positionToFlatRow(imported: Partial<PositionImport>): unknown[] {
  return POSITION_IMPORT_FIELDS.map(({ key }) =>
    resolveKey(imported as Record<string, unknown>, key)
  )
}

export function exportPositionImportCsv(
  inputs: PositionImportInput[],
  filename = 'position_import.csv',
): void {
  const rows    = inputs.map(input => positionToFlatRow(toPositionImport(input)))
  const content = buildCsvContent(POSITION_IMPORT_FIELDS, rows)
  downloadCsv(content, filename)
}
