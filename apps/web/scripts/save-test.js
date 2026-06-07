#!/usr/bin/env node
// AI が生成したコードをファイルに保存する（macOS/Windows/Linux 共通）
//
// 使い方:
//   node scripts/save-test.js ai-output.txt
//   cat ai-output.txt | node scripts/save-test.js
//   npm run test:save ai-output.txt
//
// AI 出力の形式:
//   // FILE: tests/foo/bar.test.ts
//   (ファイル内容)
//
//   // FILE: packages/domain/src/validation/xxx.ts
//   (ファイル内容)
//
// 複数の // FILE: セクションがある場合はすべて保存する。
// 既存ファイルは上書き確認あり。テストファイル (.test.ts) のみ vitest を実行。

import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'fs'
import { dirname, resolve } from 'path'
import { execSync } from 'child_process'
import { createInterface } from 'readline'

const [,, inputFile] = process.argv

// ── 入力を取得 ───────────────────────────────────────────────────────────────

let input
let inputFromStdin = false

if (inputFile) {
  if (!existsSync(inputFile)) {
    console.error(`Error: file not found: ${inputFile}`)
    process.exit(1)
  }
  input = readFileSync(inputFile, 'utf8')
} else {
  try {
    input = readFileSync('/dev/stdin', 'utf8')
    inputFromStdin = true
  } catch {
    console.error('Usage: node scripts/save-test.js <ai-output-file>')
    console.error('       または stdin からパイプで渡してください。')
    process.exit(1)
  }
}

// ── // FILE: セクションを複数抽出 ─────────────────────────────────────────────
//
// 形式: 行頭が "// FILE: <path>" → 次の "// FILE:" または末尾まで がそのファイルの内容

function parseSections(text) {
  const sections = []
  const lines = text.split('\n')
  let current = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('// FILE:')) {
      if (current) sections.push(current)
      const path = trimmed.replace('// FILE:', '').trim()
      current = { path, contentLines: [line] }  // 先頭行（// FILE: ...）も含める
    } else if (current) {
      current.contentLines.push(line)
    }
  }
  if (current) sections.push(current)
  return sections
}

const sections = parseSections(input)

if (sections.length === 0) {
  console.error("Error: '// FILE: <path>' 形式のセクションが見つかりません。")
  console.error('')
  console.error('AI の出力に以下の形式が含まれているか確認してください:')
  console.error('  // FILE: tests/derivation/myFile.test.ts')
  console.error('  (ここにファイル内容)')
  process.exit(1)
}

console.log(`${sections.length} ファイルを検出しました:`)
sections.forEach((s, i) => console.log(`  ${i + 1}. ${s.path}`))
console.log('')

// ── 既存ファイルの確認 ────────────────────────────────────────────────────────

async function confirm(message) {
  const inputStream = (inputFromStdin && process.platform !== 'win32')
    ? createReadStream('/dev/tty')
    : process.stdin
  const rl = createInterface({ input: inputStream, output: process.stdout })
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function main() {
  const toWrite = []

  for (const section of sections) {
    if (existsSync(section.path)) {
      console.log(`⚠  既存ファイルがあります: ${section.path}`)
      const answer = await confirm('上書きしますか？ [y/N] ')
      if (answer !== 'y') {
        console.log(`  スキップ: ${section.path}`)
        continue
      }
    }
    toWrite.push(section)
  }

  if (toWrite.length === 0) {
    console.log('保存するファイルがありませんでした。')
    process.exit(0)
  }

  // ── 保存 ─────────────────────────────────────────────────────────────────

  const savedPaths = []
  for (const section of toWrite) {
    mkdirSync(dirname(section.path), { recursive: true })
    writeFileSync(section.path, section.contentLines.join('\n'), 'utf8')
    console.log(`✓  保存しました: ${section.path}`)
    savedPaths.push(section.path)
  }

  // ── 型チェック ────────────────────────────────────────────────────────────

  console.log('\n型チェック中...')
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' })
    console.log('✓  型チェック OK')
  } catch (e) {
    const out = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')
    const errors = out.split('\n').filter(l => l.includes('error')).slice(0, 10)
    console.log('⚠  型エラーがあります:')
    errors.forEach(l => console.log(' ', l))
  }

  // ── テスト実行（.test.ts のみ）────────────────────────────────────────────

  const testPaths = savedPaths.filter(p => p.endsWith('.test.ts'))
  if (testPaths.length === 0) {
    console.log('\n（テストファイルなし — vitest はスキップ）')
    return
  }

  console.log('\nテスト実行中...')
  const pathArgs = testPaths.map(p => `"${p}"`).join(' ')
  try {
    const result = execSync(
      `npx vitest run ${pathArgs} --reporter=verbose`,
      { stdio: 'pipe', encoding: 'utf8' }
    )
    result.split('\n').slice(-20).forEach(l => console.log(l))
  } catch (e) {
    const out = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')
    out.split('\n').slice(-30).forEach(l => console.log(l))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
