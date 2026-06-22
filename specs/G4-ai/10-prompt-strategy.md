# G4-10 AIプロンプト戦略

> 実装: `apps/web/src/application/chatSession.ts`（BASE_SYSTEM_PROMPT / buildSystemPrompt）  
> 実装: `apps/web/src/infrastructure/ai/fastPathTool.ts`（FAST_PATH_SYSTEM_SUFFIX）  
> 実装: `apps/web/src/components/ai/useChatHandlers.ts`（動的注入の組み立て）

---

## 全体構造：プロンプトのレイヤー

LLMに渡るシステムプロンプトは以下の順で積み重なる。

```
[1] BASE_SYSTEM_PROMPT          ← 全ターン共通。ツール使い方・業務ルール・禁止事項
[2] セッション状態               ← 変更件数・エラー件数（毎ターン再計算）
[3] スコープ組織                 ← 作業対象組織（設定時のみ）
[4] フォーカス組織               ← 組織図でフォーカス中の組織（選択時のみ）
[5] ピン留め参照情報             ← ユーザーがピン留めした行の rowId・userId・フィールド値
[6] 学習済みルール               ← Teach AI で登録したルール（feedbackStore）
[7] スキルヒント                 ← アクティブなスキルとトリガー条件
--- （Structured Path のみここまで）
[8] FAST_PATH_SYSTEM_SUFFIX    ← Fast Path のみ追加。navigate kindの説明・エスカレーション条件
```

---

## [1] BASE_SYSTEM_PROMPT — 変更してはいけない固定核

`chatSession.ts` の定数。全ターン・全パスで必ず先頭に入る。

### 含める内容の原則

| セクション | 内容 | 理由 |
|---|---|---|
| ツール利用ガイドライン | どのツールをいつ使うかのルーティング | LLMが正しいツールを選べるようにする |
| UIナビゲーションツール | `ui_*` の用途と使い分け | Fast Pathのみ公開のため見つけにくい |
| 業務ルール | ドメイン固有の制約（昇降格・positionCode等） | バリデーションより先にAIが知っておくべき制約 |
| 複数ステップ操作 | 特定フローの専用ツール | 汎用ツールで代替しがちな操作を正しく誘導 |
| 禁止事項 | やってはいけないこと | 誤操作のリスクが高い操作を明示 |
| 体制図インポートフロー | 変更指示テキストを受け取ったときの3フェーズ | LLMが独自手順を取るのを防ぐ |

### 含めてはいけないもの

- `allocationList` 全行（数百行になる。セッション状態の件数のみ注入する）
- バリデーション問題の全件（上位N件のみ。getValidationDiagnosis で取得させる）
- 組織一覧・マスタデータ（大きすぎる。ツール経由で取得させる）
- ツール定義の内容（重複。LLMはツール定義から読む）

### ツール利用ガイドラインの設計方針

「このリクエストにはどのツールを使うか」をルーティングする記述を含める。

```
findPersons vs ui_show_person の使い分け:
  「〇〇さんを見せて」           → ui_show_person（検索+フォーカスを1ステップ）
  「〇〇さんの情報を取得したい」  → findPersons（AIがデータを参照する目的）

propose_* のフィルタパラメータ:
  confirm系ツールはフィルタを自身で持つ。findPersons の事前呼び出し不要。
  findPersons は「情報を調べる」目的にのみ使う。
```

LLMはツール定義の `description` だけでは使い分けを判断しきれない。
**競合するツールが存在する場合は必ずシステムプロンプトに明示的なルーティング規則を書く**。

### UIナビゲーションツールを専用セクションにする理由

`ui_*` ツール（navigate kind）はFast Pathで公開されているが、ツール名から用途が伝わりにくい。
また `findPersons`（データ取得）と `ui_show_person`（画面表示）は似たような引数を持つため、
LLMが混同しやすい。専用セクションで用途と使い分けを明示する。

```
## UIナビゲーションツール（データ変更なし・Fast Pathで使用可）
- 「〇〇さんを見せて」→ ui_show_person
- 「フォームを開いて」→ ui_open_operation
- 「どのバンドを選べばいい？」→ ui_get_form_state（bandRecommendations.oneStep を確認）
- フィールドに値をセット → ui_suggest_form_field
```

---

## [2]–[5] 動的セクション — 毎ターン再計算される文脈注入

`useChatHandlers.ts` の `buildCurrentSystemPrompt()` が各ターンに組み立てる。

### セッション状態（[2]）

```typescript
// chatSession.ts buildSystemPrompt()
if (session.changedCount > 0 || session.errorCount > 0) {
  prompt += '\n## 現在のセッション状態\n'
  // 変更行数・エラー数・警告数
}
```

**設計意図**: LLMに現在の作業量とリスクを伝える。エラーがあれば getValidationDiagnosis を呼ぶ動機付けになる。
件数のみ（全件ではない）。getValidationDiagnosis で詳細を取得させる。

### スコープ・フォーカス組織（[3][4]）

```typescript
// スコープ（担当者モード: 自分の組織のみ操作対象）
if (scopeOrgName) {
  prompt += `作業対象組織: ${scopeOrgName}（コード: ${scopeOrgCode}）`
}
// フォーカス組織（「この組織を〇〇して」の参照先）
if (selectedOrgName) {
  prompt += `ユーザーが組織図でフォーカス中の組織: ${selectedOrgName}`
}
```

**設計意図**: 「この部門を全員異動させて」のような指示で、どの部門かを曖昧にしない。

### ピン留め参照情報（[5]）

```typescript
// 各行について: rowId, userId, orgCode, 変更種別, keyFields, validationIssues
for (const row of selectedRows) {
  prompt += `- ${row.name}（rowId: ${row.rowId}, userId: ${row.userId}） | ...`
}
```

**設計意図**: ユーザーがチャット画面に「ピン留め」した行のコンテキストをLLMに渡す。
「この人を異動させて」と言うだけで rowId が特定できるようにする。

**注意点**:
- ピン留めされていない行には適用しない（「全員の〇〇」のような全体操作でピン留め行を前提にしない）
- バリデーション問題があれば issues も含める（「このエラーを直して」に対応）
- `availableOps`（利用可能な操作一覧）も含めて、LLMが正しい操作を選べるようにする

### 学習済みルール（[6]）

```typescript
const learnedRules = feedbackStore.getAppliedRules()
  .filter(r => r.kind === 'learned_rule' && r.isActive)
  .map(r => `- ${r.newContent}`)
  .join('\n')
if (learnedRules) {
  prompt += `\n\n【学習済み業務ルール】\n${learnedRules}`
}
```

**設計意図**: Teach AI 機能でユーザーが登録した業務固有ルールを毎ターン注入する。
セッション間で永続する（feedbackStore → LocalStorage）。
ルールが無効化されたら自動的に注入されなくなる。

### スキルヒント（[7]）

```typescript
const skillHint = [
  '# 利用可能なスキル',
  '以下のスキルに該当するタスクが来た場合は、テキストで回答する前に必ずスキルツールを呼び出してください。',
  ...activeSkills.map(s => `- **${s.name}** (\`skill_${slug}\`): ${s.description}`)
]
```

**設計意図**: アクティブなスキルがある場合、通常ツールより優先してスキルを起動させる。
スキルが呼ばれると SKILL.md の instructions が返り、allowed-tools でツールが絞り込まれる。
Structured Path でのみ有効（Fast Pathではスキルツールは公開されない）。

---

## [8] FAST_PATH_SYSTEM_SUFFIX — Fast Path 専用の末尾追加

`fastPathTool.ts` の定数。`runFastPath()` のみで末尾に追加する。

### 目的

Fast Path では `execute` / `confirm` kind のツールは公開されない。
LLMが「変更操作が必要」と判断したときに適切に `request_structured_planning` を呼ぶよう誘導する。

また、Fast Path で使える `navigate` kind のツール（`ui_*`）をLLMが認識できるよう案内する。

### 設計方針

```
Fast Pathで実行可能:
- read/render: データ取得・表示
- navigate (ui_*): 画面フォーカス・フォーム操作

request_structured_planning を呼ぶべきケース:
- ドメインデータを変更・更新・削除する
- 複数の手順を順番に実行する必要がある
- 意図が曖昧で確認が必要
```

**なぜ BASE_SYSTEM_PROMPT に入れないか**:
Structured Path では `request_structured_planning` ツールが存在しないため、
「呼んでください」という指示が混乱を生む。パス別に分離している。

---

## ツール description との役割分担

システムプロンプトとツール `description` の両方でAIに情報を伝えられる。

| 情報の種類 | 書く場所 |
|---|---|
| ツールの単体の意味・引数の説明 | `description`（toolRegistry.ts） |
| 複数のツールの使い分け・優先順位 | システムプロンプト |
| 業務固有の制約（昇降格必須ルール等） | システムプロンプト |
| セッション固有の文脈（件数・スコープ） | buildSystemPrompt() の動的セクション |
| Fast Path のエスカレーション条件 | FAST_PATH_SYSTEM_SUFFIX |
| スキルの起動条件 | スキルヒント（[7]）|
| スキルが起動後の手順 | SKILL.md の instructions |

**ルール**: 競合する可能性のあるツール（同じような引数を持つ別のツール）が存在する場合、
description だけでは不十分。システムプロンプトに明示的なルーティング規則を書く。

---

## 昇格/降格フォームのバンド推奨候補の伝え方

Promotion/Demotion フォームでは UI が `BandStepFilter` を使って positionBand の選択肢を1段階変更に絞り込む。
AIはこの絞り込みを知らないと全バンドを提示してしまう。

### 解決策: 2段階で伝える

**1. ui_get_form_state の戻り値に bandRecommendations を付加**（toolRegistry.ts）

```json
{
  "open": true,
  "operationId": "Promotion",
  "bandRecommendations": {
    "current": "バンドB",
    "oneStep": ["バンドC"],
    "twoStep": ["バンドD"],
    "uiDefaultFilter": "oneStep",
    "note": "UIのデフォルト表示は1段階上（oneStep）。特段の理由がなければ oneStep から選ぶ。"
  }
}
```

**2. getFieldOptions の戻り値に recommendedOptions を付加**（toolRegistry.ts）

```json
{
  "options": ["バンドA", "バンドB", "バンドC", "バンドD", "バンドE"],
  "recommendedOptions": ["バンドC"],
  "currentBand": "バンドB",
  "note": "昇格フォームのUIデフォルトは1段階上。通常は recommendedOptions から選択する。"
}
```

**3. システムプロンプトでAIに呼ぶよう指示**（BASE_SYSTEM_PROMPT）

```
「どのバンドを選べばいい？」と聞かれたときは必ず ui_get_form_state を呼んで
bandRecommendations.oneStep を確認する。
```

3つ全てが揃うことで確実に伝わる。ツール戻り値だけでは足りない（LLMが呼ばないため）。

---

## プロンプトの変更手順

プロンプトを変更するときは以下を確認する。

1. **BASE_SYSTEM_PROMPT に追加する場合**
   - ツールの使い分けルール → 競合する別のツールとセットで記載する
   - 業務ルール → `specs/G4-ai/02-system-prompt-rules.md` にも転記する
   - トークン節約 → 列挙形式より「〇〇のときは△△を使う」の形にする

2. **ツール description を変更する場合**
   - 変更後に `feedbackStore.applyDescriptionOverrides()` で動的上書きが効くか確認する
   - 競合ツールがあればシステムプロンプト側のルーティングも一緒に見直す

3. **FAST_PATH_SYSTEM_SUFFIX を変更する場合**
   - Structured Path での動作に影響しないか確認する
   - Fast Pathで使えるツールが増えた/減った場合は更新する

4. **ピン留め情報（[5]）を変更する場合**
   - `aiTools.getRowContext()` の戻り値型を確認する
   - 「ピン留め行を前提にしない場合」の分岐条件も更新する
