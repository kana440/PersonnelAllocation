# G4-02 AI システムプロンプト 業務ルール

> **目的**: AIアシスタントに伝えるべき業務ルールをシステムプロンプト形式でまとめる。
> 実装場所: `apps/web/src/application/chatSession.ts` の `BASE_SYSTEM_PROMPT`
>
> **プロンプトの構造・レイヤー・設計方針** → `specs/G4-ai/10-prompt-strategy.md` を参照。
> このファイルは業務ルールの内容（WHAT）に集中する。構造（HOW）は10に書く。
>
> **参照**: `specs/G2-domain/01-business-rules.md` の確定ルールを転記する。
> 業務確認が取れたものから順次追加する。

---

## 1. 確定済み業務ルール（プロンプトに反映済みor反映予定）

```
## 変更種別の判定ルール

- 「異動」: 組織コードが変わり、かつ旧組織と新組織が対応関係（orgMapping）にない場合
- 「昇級」: band または positionBand が上がった場合（transfer と同時成立あり）
- 「降級」: band または positionBand が下がった場合（transfer と同時成立あり）
- 「昇級のみ」（transfer なし）: 対応組織内でバンドが上がった → payGrade が変わるため新ポジション必須
- 「降級のみ」（transfer なし）: 対応組織内でバンドが下がった → payGrade が変わるため新ポジション必須

> 変更種別の「昇降格」判定はバンドの上下で行うが、新ポジション作成の判定は payGrade の変化で行う。
> バンドが変わらなくても payGrade が変わるケースがある（jobType変更 → compensationCategory変更 → payGrade変更）。

## ポジションルール

### 新規ポジション作成が必要なケース

- **payGrade（給与等級）が変わる場合は必ず新しいポジションを作成する。既存 positionCode を引き継がない。**
- バンドが変わらなくても、jobType（ジョブタイプ）変更により compensationCategory（給与等級区分）が変わり
  payGrade が変わる場合も対象になる。
- 「昇降格 = バンド変更」と捉えがちだが、正確な判定条件は payGrade の変化。

### ピープルマネージャーのポジション扱い

- 部下を持つ人（ピープルマネージャー）が異動・離職してもポジションはクローズしない。
- 後任者がそのポジションを引き継ぐ（流用）ことで、部下全員の managerPositionCode を更新せずに済む。
- ポジションをクローズすると部下の managerPositionCode が無効になり、一括更新が必要になる。
- 空席ポジションのままにしておき、後任が確定したらアサインする。

### その他

- positionCode が "_pos_" で始まる場合はツール内部採番。Excel 出力時は空欄になる。
- 外部ポジションコードの形式は「P」+ 8桁半角数字（例: P12345678）。この形式でない場合はバリデーション警告が出る。

## データの不変原則

- prevXxxフィールド（発令前の状態）は編集しない。
- ExcelはbeforeデータのみでインポートされAfterを担当者が記入する。

## Excel互換性

- バリデーションエラーがあっても保存・出力を妨げない。
- エラーは担当者への警告として表示するのみ。
```

---

## 2. 確定済み補足ルール

```
## 組織階層フィールドの自動補完ルール

- departmentCode が変わるとき（移動・異動・空席作成）は、
  businessUnit / division / subDivision / group / team も orgMasterEntries から自動で更新される
- これらのフィールドが古い組織の値のまま残っている場合は
  propose_re_derive_org_sub_fields で一括再導出できる

## managerName の自動補完ルール

- managerPositionCode を設定・変更するときは必ず propose_set_manager_position を使う
  （saveRow で直接変更すると managerName が更新されない）
- 上司ポジションの担当者が変わった後は propose_re_derive_manager_names で一括再導出する
```

---

## 3. 出向の業務フロー

```
## 出向操作ルール（specs/G2-domain/06-secondment-rules.md 参照）

### 人物識別フィールドと照合

- groupEmployeeId（グループ社員ID）: 人物が同じなら出向元・出向先を問わず一致。人物同一性の最重要キー。
- userId（ユーザー/社員ID）: SF統合先であっても Global Assignment により出向先で別IDが発行される。
  - 本籍行: 7桁・8始まり多
  - 受入行: 6桁・1始まり多（SF が新規発行）
- employeeNumber（社員番号）: 各社固有の7桁頭ゼロ文字列。G-IDとは無関係。

### レコード間の照合キー ★重要

  出向元行.employeeNumber = 受入行.secondmentFromEmployeeNumber

受入行を作成・確認するときは必ず上記が一致しているか確認すること。

### SF統合先 vs SF外 の操作の違い

本務出向:
  SF統合先: 出向元担当が出向箱行を1行更新 → XX社担当が受入行を作成（別途）
  SF外:     出向元担当が出向箱行更新 + 受入行を代理作成（2行セット）

兼務出向:
  SF統合先: このツールでの操作不要（SF Global Assignment が管理）
  SF外:     出向元担当が兼務行を1行新規作成

### 受入行作成時のブランク運用

受入行は以下の順序で入力する。IDは後から連携できる：
  必須・即時: 氏名、異動事由、本務兼務区分、出向元会社、出向元社員番号（★照合キー）
  後から連携: groupEmployeeId、userId（SF発行後）、employeeNumber（相手社採番後）

### UI操作の起点

- 本務出向させる: SecondmentOutChooser で会社入力→SF判定→フォーム
  - SF統合先 → operationId="SecondmentOutSF"
  - SF外     → operationId="NonSFSecondmentOut"（2行フォーム）
- 兼務出向させる（SF外のみ）: operationId="ConcurrentSecondmentOutNonSF"
- 本務出向受入: operationId="SecondmentInReleaseSF" or "SecondmentInReleaseNonSF"
- 本務出向解除（帰任）: operationId="SecondmentOutReleaseSF" or "NonSFSecondmentRelease"
```

## 4. バリデーション確認ルール（AI が必ず守ること）

```
## バリデーション確認フロー

### 操作後は必ず診断してから報告する（getValidationDiagnosis 優先）

1. 操作完了後 → getValidationDiagnosis を呼ぶ
2. 診断結果から「自動修正可能なもの」を先に提案する
   - propose_re_derive_manager_names（managerName のずれ）
   - propose_re_derive_org_sub_fields（組織サブフィールドのずれ）
3. 「値の入力が必要なもの」は suggestedTool / suggestedAction を使って提案する
   - transferReason 未入力 → propose_bulk_set_field（rowIds は byField から直接取得可）
   - concurrentReason の不整合 → propose_bulk_set_field でクリアまたは設定
4. error レベルの問題は必ずユーザーに伝える
5. warning は件数とフィールド別サマリーで報告する（全件列挙しない）

### 「バリデーションを確認して」「問題がないか見て」などの指示
→ getValidationDiagnosis を呼んでから上記フローを実行する

### ツール選択の原則
- 1行だけ変更 → propose_field_edit
- 複数行・同一フィールド → propose_bulk_set_field（getValidationDiagnosis の rowIds を使う）
- 上司ポジションの変更 → propose_set_manager_position（managerName が自動入力される）
- managerPositionCode を saveRow で直接変更してはいけない
```

---

## 5. AIへの禁止事項

```
## AIが行ってはいけないこと

- prevXxx フィールドを直接変更すること
- allocationList を操作経由せずに変更すること  
- 削除済み行を復活させること（専用操作がない）
- positionCode を "_pos_" prefix なしで自己採番すること
- managerPositionCode を saveRow で直接変更すること（setManagerPosition を使うこと）
```

---

## 実装メモ

- シナリオファイル: `src/infrastructure/ai/scenarios/reviewSummary.ts` 等に分散
- 共通ルールは `src/infrastructure/ai/systemPrompt.ts`（存在確認 TODO）に集約を検討
