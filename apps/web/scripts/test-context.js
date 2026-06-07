#!/usr/bin/env node
// テスト生成用コンテキストドキュメントを stdout に出力する（macOS/Windows/Linux 共通）
//
// 使い方:
//   node scripts/test-context.js src/domain/derivation/myFile.ts
//   node scripts/test-context.js src/domain/derivation/myFile.ts specs/G2-domain/02-validation-rules.md
//
// 出力をファイルにリダイレクトして Claude Web 等にアップロードする:
//   node scripts/test-context.js src/domain/derivation/myFile.ts > ai-input.md
//   npm run test:context src/domain/derivation/myFile.ts > ai-input.md

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, basename, dirname, relative } from 'path'

const [,, sourceFile, specFile] = process.argv

if (!sourceFile) {
  console.error('Usage: node scripts/test-context.js <source-file> [spec-file]')
  process.exit(1)
}
if (!existsSync(sourceFile)) {
  console.error(`Error: file not found: ${sourceFile}`)
  process.exit(1)
}

// ── テスト種別を自動判定 ──────────────────────────────────────────────────────

const isCommands   = sourceFile.includes('commands/')
const isValidation = sourceFile.includes('validation/')

let kind = 'pure'
let infraFiles = ['tests/helpers/fixtures.ts']

if (isCommands) {
  kind = 'operation'
  infraFiles.push('tests/helpers/operationRunner.ts')
} else if (isValidation) {
  kind = 'validation'
  infraFiles.push('tests/helpers/runner.ts')
}

// ── 出力先パスを推定 ──────────────────────────────────────────────────────────

const stem = basename(sourceFile, '.ts')
let suggestedOutput

if (sourceFile.includes('commands/handlers/') || sourceFile.includes('commands/defs/')) {
  suggestedOutput = `tests/operations/${stem}.test.ts`
} else {
  // パス正規化: どのような形式で渡されても src/ 以下の相対パスに統一する
  //   src/application/aiTools/read.ts          → application/aiTools/read.ts
  //   ../../packages/domain/src/validation/x.ts → validation/x.ts
  //   src/domain/foo/bar.ts                     → foo/bar.ts  (旧形式・互換)
  const rel = sourceFile
    .replace(/^.*?packages\/domain\/src\//, '')
    .replace(/^src\/domain\//, '')
    .replace(/^src\//, '')
  const dir = dirname(rel)
  suggestedOutput = `tests/${dir}/${stem}.test.ts`
}

// ── 参考テスト例を選ぶ ───────────────────────────────────────────────────────

function findExampleTest(dirs) {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    const files = readdirSync(dir).filter(f => f.endsWith('.test.ts'))
    if (files.length > 0) return join(dir, files[0])
  }
  return null
}

const exampleDirs = kind === 'operation'
  ? ['tests/operations', 'tests/derivation']
  : kind === 'validation'
  ? ['tests/validation']
  : ['tests/derivation', 'tests/choices', 'tests/patterns']

const exampleTest = findExampleTest(exampleDirs)

// ── ドキュメント生成 ──────────────────────────────────────────────────────────

const lines = []

const section = (title) => lines.push(`## ${title}`, '')
const code = (lang, content) => { lines.push(`\`\`\`${lang}`, content.trimEnd(), '```', '') }
const text = (...parts) => lines.push(...parts, '')

text(
  '# Vitest テスト生成リクエスト',
  '',
  '## 出力形式（必ず守ること）',
  '',
  '```',
  `// FILE: ${suggestedOutput}`,
  '// (ここにテストコードのみ。説明文は不要)',
  '```',
  '',
  `先頭行に \`// FILE: <パス>\` を必ず入れてください。`,
  'テストコードのみ出力し、説明文・マークダウンは不要です。',
  '',
  `## テスト種別: ${kind}`,
)

// テスト対象ソース
section(`テスト対象: \`${sourceFile}\``)
code('typescript', readFileSync(sourceFile, 'utf8'))

// 仕様ファイル（あれば）
if (specFile && existsSync(specFile)) {
  section(`仕様: \`${specFile}\``)
  lines.push(readFileSync(specFile, 'utf8').trimEnd(), '')
}

// テストインフラ
section('テストインフラ')
for (const f of infraFiles) {
  if (existsSync(f)) {
    lines.push(`### \`${f}\``)
    code('typescript', readFileSync(f, 'utf8'))
  }
}

// 参考テスト例
if (exampleTest) {
  section(`参考テスト例: \`${exampleTest}\``)
  code('typescript', readFileSync(exampleTest, 'utf8'))
}

// テスト規約
text(
  '## テスト規約',
  '',
  `- 出力は \`${suggestedOutput}\` に保存するファイル内容のみ`,
  `- 先頭行は必ず \`// FILE: ${suggestedOutput}\``,
  '- インポートは上記インフラファイルの関数を使う',
  '- 純粋関数は `describe/test/expect` で直接テスト',
  '- OperationDef テストは `runOperationScenarios` を使う',
  '- バリデーションテストは `runScenarios` / `strict()` を使う',
  '- テストケースはエッジケース（null・空・境界値）を含めること',
  '- コメントは日本語で簡潔に',
)

console.log(lines.join('\n'))
