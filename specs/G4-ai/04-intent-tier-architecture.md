# G4-04 AI 実行アーキテクチャ

---

## 現在の実装: Fast Path / Structured Path

`agentRunner.ts` が以下の 2 パスで動く。

### Fast Path（安全な読み取り・UIナビゲーション）

公開ツール: `read` / `render` / `navigate` kind のみ + `request_structured_planning` 疑似ツール。

```
ユーザーメッセージ
  → runFastPath()
  → read/render/navigate ツールを呼びながらループ
  → テキスト回答で終了  ← 検索・表示・フォーカス・フォーム操作が完結

  OR

  → LLM が request_structured_planning を呼ぶ
  → ActionFrame を返す（suspectedOperation, missingInformation, skillCandidates）
  → 呼び出し側が Structured Path を起動
```

**Fast Path で完結するケース**（request_structured_planning 不要）:
- 人物・組織の検索・表示（findPersons / findOrgs / getReviewSummary 等）
- 画面フォーカス（ui_show_person / ui_focus_row）
- フォームを開く・値を入力補助（ui_open_operation / ui_suggest_form_field）
- バリデーション確認（getValidationDiagnosis）

**Structured Path に移行すべきケース**:
- 異動・昇格・兼務・出向・休職などのドメインデータ変更
- 複数の手順を順番に実行する必要がある場合

---

### Structured Path（スキル起動 + 完全ツールセット）

```
useChatHandlers が request_structured_planning を受け取る
  → ActionFrame から skillCandidates を参照してスキルを選択
  → run() を呼び出す（全ツール + スキルツール）
  → スキルツールが呼ばれると instructions を返す（SKILL.md の内容）
  → スキルの allowed-tools でツール定義を絞り込む
  → confirm ツール（propose_*）でユーザー確認フローに入る
  → ユーザーが承認 → executeOnApprove で実行
```

**スキルの allowed-tools スコーピング**:
スキルツール起動後のラウンドから `run()` 終了まで、SKILL.md の `allowed-tools` に列挙されたツール定義だけ LLM に渡す（スコープ外ツールへの迷走を防ぐ）。

---

### ツール kind と公開パスの対応

| kind | 説明 | Fast Path | Structured Path |
|---|---|---|---|
| `read` | 即時実行、データ読み取りのみ | ✅ | ✅ |
| `render` | ウィジェット表示 + サマリーを LLM に返す | ✅ | ✅ |
| `navigate` | UI 表示変更（ドメインデータ変更なし） | ✅ | ✅ |
| `execute` | 即時実行（ドメイン変更） | ❌ | ✅ |
| `confirm` | DryRun → 確認 → 承認後実行 | ❌ | ✅ |

---

### 実装ファイル

| ファイル | 役割 |
|---|---|
| `agentRunner.ts` | `runFastPath()` / `run()` のメインループ |
| `fastPathTool.ts` | `REQUEST_STRUCTURED_PLANNING` 定義 + `FAST_PATH_SYSTEM_SUFFIX` |
| `toolRegistry.ts` | 全ツール定義（kind 付き）・`getSafeDefinitions()` |
| `skillLoader.ts` | SKILL.md を読み込んで `SkillToolEntry` に変換 |
| `useChatHandlers.ts` | Fast Path → Structured Path の切り替えロジック |

---

## 将来設計案（未実装）: Intent-First + Tier 分類

現在の Fast Path / Structured Path とは別に、意図分類（Intent Classifier）を前段に置いて
`guide`（説明のみ）/ `simple_write`（1〜2往復で propose_* 直接実行）/ `wizard`（ステップ分解して1つずつ承認）
の3段階にルーティングを精密化する案がある。未実装であり、必要になれば別途フェーズを切って検討する。
採用時はカスタム LLM の `response_format: json_schema` 対応・streaming での tool call arguments 分割・
`parallel_tool_calls` 対応状況を前提確認する必要がある。

---

## 参照

- `specs/G4-ai/08-tool-reference.md` — ツール一覧・引数・戻り値
- `specs/G4-ai/03-ai-ui-policy.md` — AI ↔ UI 役割分担・双方向ブリッジ
- `apps/web/src/infrastructure/ai/agentRunner.ts` — 実装本体
