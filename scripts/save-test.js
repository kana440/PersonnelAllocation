#!/usr/bin/env node
// AI が生成したテストコードをファイルに保存する（macOS/Windows/Linux 共通）
//
// 使い方:
//   node scripts/save-test.js ai-output.txt
//   npm run test:save ai-output.txt
//
// AI の出力先頭行が // FILE: tests/foo/bar.test.ts のとき、
// そのパスにファイルを作成する。
// 既存ファイルがある場合は上書き確認を求める。

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import { execSync } from 'child_process'
import { createInterface } from 'readline'

const [,, inputFile] = process.argv

// ── 入力を取得 ───────────────────────────────────────────────────────────────

let input
if (inputFile) {
  if (!existsSync(inputFile)) {
    console.error(`Error: file not found: ${inputFile}`)
    process.exit(1)
  }
  input = readFileSync(inputFile, 'utf8')
} else {
  // stdin から読む（パイプ対応）
  try {
    input = readFileSync('/dev/stdin', 'utf8')
  } catch {
    console.error('Usage: node scripts/save-test.js <ai-output-file>')
    console.error('       または stdin からパイプで渡してください。')
    process.exit(1)
  }
}

// ── // FILE: <path> を先頭行から抽出 ─────────────────────────────────────────

const firstLine = input.split('\n')[0].trim()
if (!firstLine.startsWith('// FILE:')) {
  console.error("Error: 先頭行に '// FILE: <path>' がありません。")
  console.error(`先頭行: ${firstLine}`)
  console.error('')
  console.error('AI の出力先頭行が以下の形式になっているか確認してください:')
  console.error('  // FILE: tests/derivation/myFile.test.ts')
  process.exit(1)
}

const outputPath = firstLine.replace('// FILE:', '').trim()

// ── 既存ファイルの確認 ────────────────────────────────────────────────────────

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

async function main() {
  if (existsSync(outputPath)) {
    console.log(`⚠  既存ファイルがあります: ${outputPath}`)
    const answer = await confirm('上書きしますか？ [y/N] ')
    if (answer !== 'y') {
      console.log('中止しました。')
      process.exit(0)
    }
  }

  // ── 保存 ─────────────────────────────────────────────────────────────────

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, input, 'utf8')
  console.log(`✓  保存しました: ${outputPath}`)

  // ── 型チェック ────────────────────────────────────────────────────────────

  console.log('\n型チェック中...')
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' })
    console.log('✓  型チェック OK')
  } catch (e) {
    const output = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')
    const errors = output.split('\n').filter(l => l.includes('error')).slice(0, 10)
    console.log('⚠  型エラーがあります:')
    errors.forEach(l => console.log(' ', l))
  }

  // ── テスト実行 ────────────────────────────────────────────────────────────

  console.log('\nテスト実行中...')
  try {
    const result = execSync(
      `npx vitest run "${outputPath}" --reporter=verbose`,
      { stdio: 'pipe', encoding: 'utf8' }
    )
    // 末尾 20 行だけ表示
    const lines = result.split('\n')
    lines.slice(-20).forEach(l => console.log(l))
  } catch (e) {
    const output = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')
    const lines = output.split('\n')
    lines.slice(-30).forEach(l => console.log(l))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
