#!/usr/bin/env node
// 実装レビュー用コンテキストを stdout に出力する
//
// 使い方:
//   node scripts/review-context.js validation            → バリデーション全実装 + G2仕様書
//   node scripts/review-context.js derivation            → 自動導出全実装
//   node scripts/review-context.js fieldConstraints      → FIELD_CONSTRAINTS + G2仕様書
//   node scripts/review-context.js validation derivation → 複数テーマを同時出力
//
// 出力をファイルに保存して外部AI（Claude Web等）に渡す:
//   node scripts/review-context.js validation > ai-review-input.md
//   npm run review:context validation > ai-review-input.md
//
// AIへの依頼内容:
//   仕様書と実装コードを照合して、不整合・未実装・修正が必要な箇所を指摘させる。
//   修正コードは // FILE: <path> 形式で出力させ、save-test.js で一括保存できる。

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, relative } from 'path'

const ROOT       = new URL('../../..', import.meta.url).pathname        // repo root
const DOMAIN_SRC = join(ROOT, 'packages/domain/src')
const SPEC_DIR   = join(ROOT, 'specs')

// ── テーマ定義 ────────────────────────────────────────────────────────────────

const THEMES = {
  validation: {
    label:       'バリデーション実装レビュー',
    implDirs:    [join(DOMAIN_SRC, 'validation')],
    implFiles:   [join(DOMAIN_SRC, 'fieldConstraints.ts')],
    specFiles:   [
      join(SPEC_DIR, 'G2-domain/02-validation-rules.md'),
      join(SPEC_DIR, 'G1-fields/01-field-definitions.md'),
    ],
    reviewFocus: `
## レビュー依頼

以下の観点で実装を仕様書と照合してください:

1. **未実装ルール**: 仕様書にあるが実装がないバリデーション
2. **誤実装**: 仕様と異なる条件・フィールド・メッセージ
3. **FIELD_CONSTRAINTS の不整合**: constraint / suggestion の分類が仕様と違う
4. **修正コード**: 問題があれば修正後のコードを以下の形式で出力してください

\`\`\`
// FILE: packages/domain/src/validation/xxxx.ts
// (修正後のファイル全体)
\`\`\`

先頭行は必ず \`// FILE: <リポジトリルートからの相対パス>\` にしてください。
複数ファイルを修正する場合はそれぞれ \`// FILE:\` セクションを分けて出力してください。`,
  },

  derivation: {
    label:       '自動導出実装レビュー',
    implDirs:    [join(DOMAIN_SRC, 'derivation')],
    implFiles:   [],
    specFiles:   [
      join(SPEC_DIR, 'G2-domain/01-business-rules.md'),
      join(SPEC_DIR, 'G1-fields/01-field-definitions.md'),
    ],
    reviewFocus: `
## レビュー依頼

以下の観点で実装を仕様書と照合してください:

1. **未実装の自動導出**: 仕様書に記載があるが実装がないもの
2. **導出ロジックの誤り**: 仕様と異なる計算・条件
3. **修正コード**: 問題があれば修正後のコードを以下の形式で出力してください

\`\`\`
// FILE: packages/domain/src/derivation/xxxx.ts
// (修正後のファイル全体)
\`\`\``,
  },

  fieldConstraints: {
    label:       'FIELD_CONSTRAINTS レビュー',
    implDirs:    [],
    implFiles:   [
      join(DOMAIN_SRC, 'fieldConstraints.ts'),
      join(DOMAIN_SRC, 'choices/index.ts'),
    ],
    specFiles:   [
      join(SPEC_DIR, 'G2-domain/02-validation-rules.md'),
      join(SPEC_DIR, 'G1-fields/01-field-definitions.md'),
    ],
    reviewFocus: `
## レビュー依頼

FIELD_CONSTRAINTS と仕様書を照合してください:

1. **constraint / suggestion の分類**: 仕様でエラーと定義されているのに suggestion になっていないか
2. **条件漏れ**: when 条件が仕様の条件と一致しているか
3. **選択肢の漏れ**: source が仕様のコードリストを正しく参照しているか
4. **修正コード**: 問題があれば修正後のコードを以下の形式で出力してください

\`\`\`
// FILE: packages/domain/src/fieldConstraints.ts
// (修正後のファイル全体)
\`\`\``,
  },
}

// ── 引数パース ─────────────────────────────────────────────────────────────────

const themeNames = process.argv.slice(2).filter(a => !a.startsWith('--'))
const extraSpecs = process.argv.slice(2).filter(a => a.startsWith('--spec=')).map(a => a.replace('--spec=', ''))

if (themeNames.length === 0) {
  console.error('Usage: node scripts/review-context.js <theme...> [--spec=<path>]')
  console.error('')
  console.error('テーマ:')
  Object.entries(THEMES).forEach(([k, v]) => console.error(`  ${k.padEnd(20)} ${v.label}`))
  console.error('')
  console.error('例:')
  console.error('  node scripts/review-context.js validation')
  console.error('  node scripts/review-context.js validation derivation')
  console.error('  node scripts/review-context.js validation --spec=../../specs/G2-domain/01-business-rules.md')
  process.exit(1)
}

const invalidThemes = themeNames.filter(n => !THEMES[n])
if (invalidThemes.length > 0) {
  console.error(`Error: 不明なテーマ: ${invalidThemes.join(', ')}`)
  console.error(`使えるテーマ: ${Object.keys(THEMES).join(', ')}`)
  process.exit(1)
}

// ── ファイル収集 ───────────────────────────────────────────────────────────────

function collectFiles(theme) {
  const files = []
  for (const dir of theme.implDirs) {
    if (!existsSync(dir)) continue
    readdirSync(dir)
      .filter(f => f.endsWith('.ts'))
      .sort()
      .forEach(f => files.push(join(dir, f)))
  }
  for (const f of theme.implFiles) {
    if (existsSync(f)) files.push(f)
  }
  return files
}

// ── ドキュメント生成 ──────────────────────────────────────────────────────────

const lines = []
const section = (title) => lines.push(`## ${title}`, '')
const code    = (lang, content, filePath) => {
  const label = filePath ? relative(ROOT, filePath) : lang
  lines.push(`### \`${label}\``)
  lines.push(`\`\`\`${lang}`, content.trimEnd(), '```', '')
}

// タイトルとレビュー依頼
const labels = themeNames.map(n => THEMES[n].label).join(' + ')
lines.push(`# ${labels}`, '')

// 各テーマのレビュー依頼をまとめて出力
for (const name of themeNames) {
  lines.push(THEMES[name].reviewFocus.trim(), '')
}

// 仕様書（重複排除）
const specSet = new Set()
for (const name of themeNames) {
  for (const f of THEMES[name].specFiles) specSet.add(f)
}
for (const f of extraSpecs) {
  const abs = f.startsWith('/') ? f : join(process.cwd(), f)
  specSet.add(abs)
}

const specFiles = [...specSet].filter(existsSync)
if (specFiles.length > 0) {
  section('仕様書')
  for (const f of specFiles) {
    lines.push(`### \`${relative(ROOT, f)}\``)
    lines.push(readFileSync(f, 'utf8').trimEnd(), '')
  }
}

// 実装ファイル（テーマ別）
for (const name of themeNames) {
  const theme = THEMES[name]
  const implFiles = collectFiles(theme)
  if (implFiles.length === 0) continue
  section(`実装: ${theme.label}`)
  for (const f of implFiles) {
    code('typescript', readFileSync(f, 'utf8'), f)
  }
}

console.log(lines.join('\n'))
