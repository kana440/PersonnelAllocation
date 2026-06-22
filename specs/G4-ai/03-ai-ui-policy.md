# AI・UI 役割分担ポリシー

## 基本方針

**ツール側が意味のある操作モデル（Operationモデル）を持ち、AIはそれを活用する。**

UIとAIは同一のOperationモデルを通じてのみデータを変更できる。
これにより、AIが不正な値を書き込むリスクをなくし、バリデーションとビジネスルールを一箇所で管理する。

```
自然言語 → AI解釈 → Operation生成 → バリデーション → 適用ロジック
UIの操作 →          Operation生成 → バリデーション → 適用ロジック
```

ツール側を充実させるほどAIが自動的に賢くなる正のループを意図している。
ルールをコードで表現すればAIへも渡せる。バリデーションを強化すればAIも同じ制約で動く。

---

## UIが担う領域

UIはAIより確実・高速に処理できるものを担当する。

| 機能 | 方針 |
|---|---|
| 自部門スコープの表示・フィルタ | 状態管理で完結。AIに問い合わせない |
| 編集可能フィールドの制限 | Operationモデルが知っている情報をグレーアウト等で表現 |
| リスト値の選択肢制限 | ドロップダウンでバリデーションと連動 |
| 行レベルのリアルタイムバリデーション | 即時フィードバックはUIの強み |
| 画面内の複数行一括操作 | 見えている範囲の選択→同一操作適用 |
| 転入者レコードの表示（編集不可） | ルールベースで決定的に制御 |

---

## AIが担う領域

AIは「発見」「説明」「条件付き一括処理」を担当する。UIでは表現しにくい曖昧な要求に強い。

| 機能 | 方針 |
|---|---|
| 昇格候補者の発見・提案 | 条件に合う人を探す処理は自然言語向き |
| フィールド値の推奨 | 「この人の場合、グレードは何にすべきか」をルール適用して説明付きで回答 |
| 異常パターンの検出・説明 | 「この組み合わせは通常と異なるが問題ないか」 |
| 条件付き一括操作 | 「○○部門の昇格対象者を一括処理して」 |
| 記入方法の案内 | ルール知識を自然言語で説明。取りまとめ担当がいなくても回るようにする |

---

## 両方でカバーする領域（使い分け）

### バリデーション
- **UI** → 「この値はエラー」を即時表示（赤枠・インラインエラー）
- **AI** → 「なぜエラーか」「正しい値は何か」を説明

### 一括編集
- **UI** → 画面に見えている選択行に同じ操作を適用
- **AI** → 「昇格フラグがある人全員のグレードを自動補完して」など条件ベースの操作

---

## スコープ制御ポリシー

各部門担当者は自部門のレコードのみを操作対象とする。

- 他部門からの転入者は参照レコードとして表示するが編集不可
- 「自部門だけを操作している」感覚を崩さないことが優先
- AIに渡す文脈にも担当部門を含め、AIが他部門の人を操作対象として提示しないよう制御する

---

## AI ↔ UI 双方向ブリッジ

AIはドメインデータの変更だけでなく、UIの操作フォームと連携できる。

### ストア構成

```
uiCommandStore（AI → UI、一方通行キュー）
  dispatch({ type: 'openOperation', rowId, operationId, prefill })
  → PersonOperationPanel が subscribe して操作フォームを開く

formStateStore（フォーム ↔ AI、双方向）
  publish({ rowId, operationId, values })  ← フォームが変更されるたびに公開
  snapshot                                 ← AI が ui_get_form_state で読む
  suggestField(field, value)               ← AI が ui_suggest_form_field で書く
  pendingSuggestion                        ← フォームが subscribe して handleChange に流す
```

### AIとフォームの協調フロー

```
1. ユーザー「〇〇さんの昇格フォームを開いて」
2. AI → findPersons で rowId 取得
3. AI → ui_open_operation（operationId: 'Promotion', prefill: { ... }）
   → uiCommandStore に dispatch
   → PersonOperationPanel がフォームを開き、prefill 値を初期入力
4. フォームが formStateStore に現在値を公開
5. ユーザー「どのバンドを選べばいい？」
6. AI → ui_get_form_state → bandRecommendations.oneStep を回答
7. AI → ui_suggest_form_field（field: 'positionBand', value: 'M5'）
   → formStateStore.suggestField() → フォームの handleChange に流れる
   → onFieldChange の連動導出（band → payGrade 等）が正しく走る
8. ユーザーが残りを確認して送信
```

### AIが使えるUIツール（navigate kind — Fast Path で使用可能）

| ツール | 用途 |
|---|---|
| `ui_show_person` | 氏名・IDで検索してキャンバス上にフォーカス |
| `ui_focus_row` | rowId で直接フォーカス |
| `ui_open_operation` | 操作フォームを開いて値を事前入力 |
| `ui_get_form_state` | フォームの現在状態（入力値・推奨選択肢）を読む |
| `ui_suggest_form_field` | フォームの特定フィールドに値をセット |

> これらはUIの表示・操作補助のみ。ドメインデータは変更しない。
> ユーザーが最終的にフォームを確認して送信することで、通常の Operation モデル経由の変更が行われる。

---

## アーキテクチャ上の制約

- **AIはOperationモデルを経由しない直接変更をしない**
- Operationクラスが「変更可能なフィールド」「有効な値の範囲」を定義し、UIとAIの両方がこれを参照する
- AIへのルール注入は、Operationモデルのメタ情報（フィールド定義・制約）をシステムプロンプトまたはツール定義として渡す方式とする

---

## 実装状況

| 優先事項 | 状態 | 備考 |
|---|---|---|
| Operation モデルの充実（FIELD_METADATA・FieldBinding） | ✅ 完了 | `allocationRow.ts` |
| AI チャット UI（Fast Path / Structured Path） | ✅ 完了 | `agentRunner.ts` |
| AI への Operation 注入（agentRunner + Tool Use） | ✅ 実装済み | `toolRegistry.ts` |
| UI ナビゲーションツール（navigate kind） | ✅ 完了 | `ui_*` プレフィックス |
| AI ↔ フォーム双方向ブリッジ | ✅ 完了 | `uiCommandStore` / `formStateStore` |
| AI によるポジション操作（assign / unassign 等） | 🚧 **未対応** | `aiTools` に未公開 |

---

## 将来方針（バックエンド）

現在はSPAで完結するクリーンアーキテクチャを維持する。

- **SuccessFactors API等のCORS問題** → バックエンドをAPIプロキシとして追加。ドメインはフロントに残す
- **複数担当者による共同編集** → サーバー側に単一状態が必要なため、別プロジェクトとして改めて設計する。現時点では対象外
- 現在のポート／アダプター構造は将来のバックエンド移行を考慮した設計になっており、インフラ層の差し替えでドメインを移植できる
