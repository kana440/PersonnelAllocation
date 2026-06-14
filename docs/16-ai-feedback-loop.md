# AI フィードバックループ設計

> 関連: `specs/G4-ai/07-step1-active-learning.md`（STEP1実装仕様）
>       `specs/G4-ai/05-feedback-loop.md`（STEP2実装仕様）
>       `docs/08-ai-architecture.md`（AI基本設計）

---

## 2つの異なるフェーズ

STEP1とSTEP2ではAIを使うユーザーが根本的に異なるため、「AIを賢くする仕組み」も別々に設計する。

| | STEP1 | STEP2 |
|---|---|---|
| ユーザー | HR専門家（1〜3名） | 部門担当者（不特定多数） |
| 専門知識 | 業務ルールの権威 | 業務はわかるが深い知識はない |
| 訂正の信頼性 | 1回の訂正 = ルール候補 | 複数人・複数回で統計的に確認 |
| 学習サイクル | 当日中 | 週〜月単位 |
| 目的 | 暗黙知の形式知化 | 統計的な問題パターン検出 |
| 実装順序 | **先に実装** | STEP2移行後に実装 |

---

## STEP1: 専門家主導の能動的ルール構築

### 設計思想

HR専門家はAIが知らない業務ルールを大量に持っている。  
AIを使いながら「これは違う」「こういう場合はこうする」と訂正していく行為が、
そのままルール構築のプロセスになる設計を目指す。

- 専門家の訂正は**それ自体が根拠**。統計的確信度は不要
- 訂正が起きた**その場で分類し**、適切な成果物を生成する
- 生成物を確認・適用すれば**次のメッセージから有効**になる
- データはlocalStorageに保存。サーバー不要。STEP1環境で完結

### 訂正の分類と生成物

専門家が訂正したとき、内容によって生成すべきものが変わる：

| 種別 | 例 | 生成物 | 即時適用 |
|---|---|---|---|
| ツール選択の誤り | 「findPersonsじゃなくsearchPersonsを使って」 | ツール説明文の改善案 | ✓ |
| 業務ルールの欠如 | 「出向中はbandを変えてはいけない」 | システムプロンプト追記テキスト | ✓ |
| ワークフローの欠如 | 「統廃合では①兼務解除→②全員転入→③上司設定の順でやる」 | SKILL.md草案 | ✓ |
| ツールのロジックバグ | 「出向者でprevDeptCodeがnullになる」 | Code Fix依頼（コード変更） | ✗ |
| 機能の欠如 | 「兼務を一括解除するツールがない」 | Code Fix依頼（新規ツール） | ✗ |

上3種は**localStorage上で即日適用可能**。下2種はコード変更が必要なので蓄積して後でまとめて実装する。

### 訂正の検出

2つのトリガーを用意する:

**A. 専門家が明示的にマーク**（主要）  
チャットUI上の「AIに教える」ボタンで直前の会話を訂正として送信する。  
明示的なのでノイズが少なく、専門家の意図が明確。

**B. AIが会話から自動検出**（補助）  
「それは違う」「実際には」「〜の場合は」などの表現からAIが訂正を検出し、  
「業務ルールとして記録しますか？」と提案する。

### 自動スキル生成

スキル（SKILL.md）は「名前のある多段ワークフロー」。以下のパターンで自動生成を提案する：

**パターンA: 専門家が手順を説明したとき**
```
専門家: 「部署統廃合のときはいつも①兼務解除 ②全員転入 ③上司設定の順でやる」
  ↓
AIが検出 → SKILL.md草案を生成・提示
  ↓
専門家が確認・調整 → localStorageに保存
  ↓
次の会話からスキルツールとして利用可能
```

**パターンB: 同じツール操作列が繰り返されたとき**
```
3回以上、同じtool呼び出し順序が記録された
  ↓
「このパターンをスキルとして登録しますか？」と提案
```

スキルはlocalStorageに保存されたJSONとして管理し、
既存のskillLoader（`infrastructure/ai/skillLoader.ts`）が静的SKILL.mdと同等に扱う。

### 学習サイクル（当日中に完結）

```
午前: 専門家がAIを使う
  → 誤りや不足を発見 → 訂正
  → 分類・生成物提示（数秒）
  → 確認・適用

午後: 続きを使う
  → 午前のルール・スキルが有効になっている
  → さらに精度が上がっていく

数日後: Code Fix蓄積分をClaudeCodeで一括実装
```

---

## STEP2: 統計的パターン検出（不特定多数向け）

### 設計思想

部門担当者はAIの良し悪しをフィードバックするが、業務ルールの権威ではない。  
1人の訂正を即座にルールにすると誤学習のリスクが高い。  
複数人・複数セッションのシグナルを統計的に集約して初めてルール候補とする。

- 暗黙的フィードバック（👍/👎・承認/取消・Undo）を収集する
- 同じパターンが複数ユーザー・複数セッションで再現したとき分類・提案
- HR専門家またはシステム管理者がレビューして適用

### 3層アーキテクチャ

```
TIER 1: Session-local
  そのセッション限り。揮発性。
  ユーザーの「今回だけ」の調整を吸収する。

TIER 2: Proposed（提案待ち）
  複数セッションで同パターンが蓄積 → AI分類 → 専門家レビュー待ち

TIER 3: Global / Canonical
  レビュー承認後に全ユーザーへ反映。Audit Log・Rollback可能。
```

### 暗黙フィードバックシグナル

| シグナル | 重み | 意味 |
|---|---|---|
| 承認後30秒以内のUndo | -3 | 後悔（最も信頼度が高い） |
| confirm ツール: 取消 | -2 | 提案が意図と合っていない |
| メッセージ 👎 | -1 | 回答が不正確 |
| メッセージ 👍 | +1 | 回答が適切 |
| confirm ツール: 承認 | +1 | 妥当（同調バイアスあり、弱め） |

**蓄積ルール**（単一ユーザー汚染を防ぐ）:
- 同一ユーザーの連続シグナルは1セッション = 1カウント
- 最低3独立セッション AND 7日間経過後にProposalを生成

### ガバナンス層

分類結果のルーティング:

```
tool_description_issue → 自動適用候補（信頼度・影響範囲で判定）
business_rule_gap      → HR専門家レビュー必須
tool_logic_bug         → Code Fix蓄積（コード変更）
missing_tool           → Code Fix蓄積（新規ツール）
user_error             → 破棄
```

自動適用の条件（tool_description_issueのみ）:
```
confidence > 0.85
AND blast_radius < 0.3
AND independent_sessions >= 3
AND window_days >= 14
AND shadow_mode_passed（3日間のシャドウ実行で劣化なし）
```

詳細: `specs/G4-ai/05-feedback-loop.md`

---

## 共通: Code Fix蓄積パス

STEP1・STEP2どちらでも、コード変更が必要な問題は **Code Fix依頼** として蓄積する。

```
tool_logic_bug / missing_tool
    ↓
AiCodeFixRequest として localStorage に保存
    ↓
Feedback UI から「Claude Code向けMarkdown」としてエクスポート
    ↓
開発者がレビュー → Claude Codeで一括実装
```

これにより「Claude Codeが使えない環境でフィードバック収集 → まとめてClaude Codeで適用」が実現する。

---

## 既存コードとの対応

| 既存資産 | フィードバックループでの役割 |
|---|---|
| `toolRegistry.applyDescriptionOverrides()` | STEP1・STEP2共通の適用メカニズム |
| `infrastructure/ai/skillLoader.ts` | localStorageスキルをSKILL.mdと同等に扱う |
| `infrastructure/ai/agentRunner.ts` | 訂正検出・シグナル送信の組み込み先 |
| `application/HRApplicationService.undo()` | Undo-after-approve検出の組み込み先 |
| `components/admin/AdminView/` | STEP2 Audit UIの配置場所 |

---

## 実装順序

```
STEP1（先に実装）
  specs/G4-ai/07-step1-active-learning.md
  ├── Phase 1: 訂正キャプチャ（「AIに教える」ボタン・分類器）
  ├── Phase 2: 即時適用（ツール説明・ルール・スキル）
  └── Phase 3: スキル管理UI・Code Fix蓄積

STEP2（STEP2移行後に実装）
  specs/G4-ai/05-feedback-loop.md
  ├── Phase 1: シグナル収集（👍/👎・confirm・Undo）
  ├── Phase 2: Audit UI
  ├── Phase 3: AIバリデーター（統計分類）
  └── Phase 4: 自動適用・サーバー同期
```
