# AI によるテスト自動生成ガイド

Claude Code が使えない環境（Web UI・API 経由）でも、スクリプトを使って  
「仕様 → コンテキスト生成 → AI に投げる → 保存」を定型化できる。

---

## 前提：テスト種別と保存先

| ソースファイルの場所 | テスト種別 | 保存先 | 使うインフラ |
|---|---|---|---|
| `domain/derivation/` | pure | `tests/derivation/` | `fixtures.ts` のみ |
| `domain/choices/` | pure | `tests/choices/` | `fixtures.ts` のみ |
| `domain/patterns/` | pure | `tests/patterns/` | `fixtures.ts` のみ |
| `domain/validation/` | validation | `tests/validation/` | `fixtures.ts` + `runner.ts` |
| `domain/commands/handlers/` | operation | `tests/operations/` | `fixtures.ts` + `operationRunner.ts` |
| `domain/commands/defs/` | operation | `tests/operations/` | `fixtures.ts` + `operationRunner.ts` |

スクリプトがファイルパスからこれを**自動判定**するので、手動で選ぶ必要はない。

---

## ワークフロー

### Step 1: コンテキストファイルを生成

```bash
# ソースファイルのみ（macOS / Windows / Linux 共通）
npm run test:context src/domain/derivation/myFile.ts > ai-input.md

# 仕様ファイルも一緒に渡す場合
npm run test:context src/domain/validation/validateRequired.ts specs/G2-domain/02-validation-rules.md > ai-input.md
```

生成される `ai-input.md` には以下が含まれる:
- 出力形式の指示（先頭行 `// FILE: <保存先パス>` を強制）
- テスト対象のソースコード
- 仕様ファイル（指定した場合）
- テストインフラ（fixtures・runner・operationRunner）
- 参考テスト例（既存テストから自動選択）
- テスト規約

### Step 2: AI に投げる

`ai-input.md` を Claude Web（claude.ai）や他の AI にアップロードして  
「このファイルの内容に従ってください」と送るだけ。

追加の指示例:
```
このファイルに従って Vitest テストを生成してください。
エッジケース（null・空・境界値）を重点的にカバーしてください。
```

### Step 3: AI の出力を保存

AI の出力をファイルに保存してから:

```bash
npm run test:save ai-output.txt
```

または macOS でクリップボードからパイプ:

```bash
pbpaste | npm run test:save
```

スクリプトが自動で以下を実行する:
1. 先頭行 `// FILE: <パス>` からファイルの保存先を決定
2. 既存ファイルがあれば上書き確認
3. ファイルを保存
4. `npx tsc --noEmit` で型チェック
5. `vitest run` でテスト実行

---

## AI への出力形式の指定

スクリプトが AI に渡すプロンプトには以下が含まれる:

```
## 出力形式（必ず守ること）

// FILE: tests/derivation/myFile.test.ts
// (ここにテストコードのみ。説明文は不要)

先頭行に `// FILE: <パス>` を必ず入れてください。
テストコードのみ出力し、説明文・マークダウンは不要です。
```

これにより:
- **保存先が自明** になり、マージ判断が不要
- **コードのみ出力** されるので、そのままファイルに保存できる
- **インフラのインポートパスが正確** になる（インフラコードを渡しているため）

---

## 具体例

### 純粋関数のテスト生成

```bash
npm run test:context src/domain/choices/orgTree.ts > ai-input.md
# → tests/choices/orgTree.test.ts に保存される想定のコンテキストを生成
```

### バリデーションのテスト生成（仕様付き）

```bash
npm run test:context src/domain/validation/validateRequired.ts specs/G2-domain/02-validation-rules.md > ai-input.md
# → runner.ts の runScenarios / strict() を使うテストを生成
```

### 操作のテスト生成

```bash
npm run test:context src/domain/commands/handlers/secondmentOps.ts > ai-input.md
# → operationRunner.ts の runOperationScenarios を使うテストを生成
```

---

## スクリプト詳細

| スクリプト | ファイル | 説明 |
|---|---|---|
| `npm run test:context <src> [spec]` | `scripts/test-context.js` | コンテキストを stdout に出力 |
| `npm run test:save <output-file>` | `scripts/save-test.js` | AI 出力をパスに保存・型チェック・テスト実行 |

どちらも **Node.js スクリプト**なので macOS・Windows・Linux で動作する。

---

## よくある失敗と対処

**`// FILE:` が先頭行にない**

AI が説明文を先に出力した場合。`ai-output.txt` をテキストエディタで開き、  
`// FILE: tests/...` の行から始まるようにコードブロックだけを切り出してから保存する。

**型エラーが出る**

インポートパスが古い場合が多い。`save-test.js` が型エラー箇所を表示するので、  
エディタで修正してから `npm test` を再実行する。

**テストが失敗する**

AI が実装の挙動を誤解している場合。実際の動作をコメントで補足して  
「このケースは〇〇という結果になります」と再プロンプトする。
