// 要件定義用: アプリ内の3つの参照モーダル（操作一覧・問題種別一覧・変更パターン一覧）の
// 定義データを Excel に書き出す。UI コンポーネント（OperationReferenceModal 等）はこれらの
// 配列をそのまま表示しているだけなので、ここでも同じ配列を単純にシートへ転記する。
// 表示プリセット（full/standard/beginner）は displayPreferenceStore.ts のロジックをそのまま使う
// （別々に再実装すると基準がズレるため、単一ソースから生成する）。
//
// 実行: npm run export:docs --workspace=apps/web
import ExcelJS from 'exceljs'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  ALL_EDIT_OPERATIONS,
  type EditOperation,
  type OperationEntryPoint,
  type OperationRole,
} from '@personnel/domain/commands/defs'
import { ALL_EDIT_PATTERNS, EDIT_PATTERN_META } from '@personnel/domain/patterns/defs'
import { ISSUE_TYPE_METAS } from '@personnel/domain/rules/validate/issueTypeMeta'
import { patternsForPreset, issueIdsForPreset } from '../src/store/displayPreferenceStore'

// URL.pathname はパーセントエンコードされたままなので、日本語等を含むパスや
// Windows のドライブレター（/C:/... 形式）を正しく扱うために fileURLToPath() を使う。
const OUTPUT_PATH = fileURLToPath(new URL('../exports/reference-docs.xlsx', import.meta.url))

const OPERATION_GROUP_LABEL: Record<string, string> = {
  jobClassification:     '職務情報',
  position:               'ポジション',
  person:                 '人操作',
  secondmentMain:         '出向（本務）',
  secondmentConcurrent:   '出向（兼務）',
}

const ISSUE_GROUP_LABEL: Record<string, string> = {
  required:      '必須項目（A系）',
  format:        '書式（B系）',
  consistency:   'マスタ整合性（C/D系）',
  conditional:   '条件付き制約（C4/F系）',
  interRow:      '行間バリデーション（E/G系）',
  warning:       'ワーニング（W系）',
}

const PATTERN_GROUP_LABEL: Record<string, string> = {
  jobClassification: '職務情報系',
  position:           'ポジション系',
  person:             '人操作系',
  legacy:             '旧分類',
}

const ENTRY_POINT_LABEL: Record<OperationEntryPoint, string> = {
  personMenu:   '人カードのメニュー',
  dragIntent:   'ドラッグ&ドロップ',
  orgAddButton: '組織パネルの追加ボタン',
  summaryPanel: '変更サマリーパネル',
}

function entryPointsLabel(op: EditOperation): string {
  return (op.entryPoints ?? []).map(e => ENTRY_POINT_LABEL[e] ?? e).join(' / ')
}

// operationRole の構造からロック条件を日本語で説明する（手書きの説明文を持たないため機械的に生成）
function lockConditionLabel(role: OperationRole | undefined): string {
  if (!role) return '（なし・通常操作。他のロックが有効な行では実行不可）'
  switch (role.kind) {
    case 'lock':
      return 'ロック: 設定すると同じ操作の再編集以外、他の全操作が不可（取消操作でのみ解除）'
    case 'softLock':
      return `ソフトロック: 設定すると他のロック/ソフトロック操作は不可、通常操作は可。所有フィールド: ${role.ownedFields.join('、')}`
    case 'lockCancel':
      return `取消操作: 対象操作「${role.of}」がセッション内で有効な行のみ実行可`
    case 'normal':
      return '（明示的に通常操作として宣言。他のロックが有効な行では実行不可）'
  }
}

function autoFitColumns(sheet: ExcelJS.Worksheet): void {
  sheet.columns.forEach(col => {
    let max = 10
    col.eachCell?.({ includeEmpty: false }, cell => {
      max = Math.max(max, String(cell.value ?? '').length)
    })
    col.width = Math.min(max + 2, 80)
  })
}

async function main() {
  const wb = new ExcelJS.Workbook()

  // ── 1. 操作一覧 ──────────────────────────────────────────────────────────
  const opSheet = wb.addWorksheet('操作一覧')
  opSheet.columns = [
    { header: 'ID',         key: 'id' },
    { header: '操作名',      key: 'label' },
    { header: 'グループ',    key: 'group' },
    { header: '入口',        key: 'entryPoints' },
    { header: '有効条件',    key: 'availabilityNote' },
    { header: 'ロック条件',  key: 'lockCondition' },
    { header: '説明',        key: 'description' },
  ]
  for (const op of ALL_EDIT_OPERATIONS) {
    opSheet.addRow({
      id:               op.id,
      label:            op.label,
      group:            OPERATION_GROUP_LABEL[op.group] ?? op.group,
      entryPoints:      entryPointsLabel(op),
      availabilityNote: op.availabilityNote ?? '',
      lockCondition:    lockConditionLabel(op.operationRole),
      description:      op.description ?? '',
    })
  }
  opSheet.getRow(1).font = { bold: true }
  autoFitColumns(opSheet)

  // ── 2. 問題種別一覧（エラー一覧）───────────────────────────────────────────
  const issueSheet = wb.addWorksheet('問題種別一覧')
  issueSheet.columns = [
    { header: 'ID',      key: 'id' },
    { header: 'チップ',   key: 'chipLabel' },
    { header: 'レベル',   key: 'level' },
    { header: 'グループ', key: 'group' },
    { header: '発生条件', key: 'description' },
  ]
  for (const issue of ISSUE_TYPE_METAS) {
    issueSheet.addRow({
      id:          issue.id,
      chipLabel:   issue.chipLabel,
      level:       issue.level,
      group:       ISSUE_GROUP_LABEL[issue.group] ?? issue.group,
      description: issue.description,
    })
  }
  issueSheet.getRow(1).font = { bold: true }
  autoFitColumns(issueSheet)

  // ── 3. 変更パターン一覧（変更種別一覧）─────────────────────────────────────
  const patternSheet = wb.addWorksheet('変更パターン一覧')
  patternSheet.columns = [
    { header: 'ID',          key: 'id' },
    { header: 'フルラベル',   key: 'label' },
    { header: 'チップ',       key: 'chipLabel' },
    { header: 'グループ',     key: 'group' },
    { header: '判定ロジック', key: 'description' },
  ]
  for (const [id, meta] of Object.entries(EDIT_PATTERN_META)) {
    patternSheet.addRow({
      id,
      label:       meta.label,
      chipLabel:   meta.chipLabel,
      group:       PATTERN_GROUP_LABEL[meta.group] ?? meta.group,
      description: meta.description ?? '',
    })
  }
  patternSheet.getRow(1).font = { bold: true }
  autoFitColumns(patternSheet)

  // ── 4. プリセット ────────────────────────────────────────────────────────
  // 表示プリセット（フル/標準/初心者）ごとに、変更パターン・問題種別が表示されるかを一覧化する。
  // 「カスタム」は初期状態は「標準」と同じで、そこからユーザーが個別に ON/OFF するプリセットのため一覧化しない。
  const presetSheet = wb.addWorksheet('プリセット')
  presetSheet.getColumn(1).width = 4
  presetSheet.getColumn(2).width = 24
  presetSheet.getColumn(3).width = 50
  presetSheet.getColumn(4).width = 10
  presetSheet.getColumn(5).width = 10
  presetSheet.getColumn(6).width = 10

  const fullPatterns     = patternsForPreset('full')
  const standardPatterns = patternsForPreset('standard')
  const beginnerPatterns = patternsForPreset('beginner')
  const fullIssues       = issueIdsForPreset('full')
  const standardIssues   = issueIdsForPreset('standard')
  const beginnerIssues   = issueIdsForPreset('beginner')

  presetSheet.addRow(['■ 変更パターン一覧のプリセット別表示'])
  presetSheet.getRow(presetSheet.rowCount).font = { bold: true }
  const patternHeaderRow = presetSheet.addRow(['', 'ID', 'フルラベル', 'フル', '標準', '初心者'])
  patternHeaderRow.font = { bold: true }
  for (const id of ALL_EDIT_PATTERNS) {
    const meta = EDIT_PATTERN_META[id]
    presetSheet.addRow([
      '', id, meta.label,
      fullPatterns.has(id)     ? '○' : '',
      standardPatterns.has(id) ? '○' : '',
      beginnerPatterns.has(id) ? '○' : '',
    ])
  }

  presetSheet.addRow([])
  presetSheet.addRow(['■ 問題種別一覧のプリセット別表示'])
  presetSheet.getRow(presetSheet.rowCount).font = { bold: true }
  const issueHeaderRow = presetSheet.addRow(['', 'ID', 'チップ', 'フル', '標準', '初心者'])
  issueHeaderRow.font = { bold: true }
  for (const issue of ISSUE_TYPE_METAS) {
    presetSheet.addRow([
      '', issue.id, issue.chipLabel,
      fullIssues.has(issue.id)     ? '○' : '',
      standardIssues.has(issue.id) ? '○' : '',
      beginnerIssues.has(issue.id) ? '○' : '',
    ])
  }

  presetSheet.addRow([])
  presetSheet.addRow(['※ 「カスタム」プリセットは初期状態が「標準」と同じで、そこからユーザーが個別に ON/OFF するため一覧化していません。'])

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  await wb.xlsx.writeFile(OUTPUT_PATH)
  console.log(`書き出し完了: ${OUTPUT_PATH}`)
  console.log(`  操作一覧: ${ALL_EDIT_OPERATIONS.length}件`)
  console.log(`  問題種別一覧: ${ISSUE_TYPE_METAS.length}件`)
  console.log(`  変更パターン一覧: ${Object.keys(EDIT_PATTERN_META).length}件`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
