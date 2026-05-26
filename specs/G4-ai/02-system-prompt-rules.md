# G4-02 AI システムプロンプト 業務ルール

> **目的**: AIアシスタントに伝えるべき業務ルールをシステムプロンプト形式でまとめる。
> 実装基盤: `src/infrastructure/ai/scenarios/` のシステムプロンプト部分
>
> **参照**: `specs/G2-domain/01-business-rules.md` の確定ルールを転記する。
> 業務確認が取れたものから順次追加する。

---

## 1. 確定済み業務ルール（プロンプトに反映済みor反映予定）

```
## 変更種別の判定ルール

- 「異動」: 組織コードが変わり、かつ旧組織と新組織が対応関係（orgMapping）にない場合
- 「昇級」: bandまたはpositionBandが上がった場合（transfer と同時成立あり）
- 「降級」: bandまたはpositionBandが下がった場合（transfer と同時成立あり）
- 「昇級のみ」（transfer なし）: 対応組織内でバンドが上がった → 新ポジション必須
- 「降級のみ」（transfer なし）: 対応組織内でバンドが下がった → 新ポジション必須

## ポジションルール

- 昇級・降級時は必ず新ポジションを作成する。既存ポジションコードを引き継がない。
- positionCodeが "_pos_" で始まる場合はツール内部採番。Excel出力時は空欄になる。
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

## 3（旧2）. 未確認ルール（確認後に追加）

```
# TODO: 以下は業務確認後に追記する

## 兼務の上司参照ルール

## 出向の業務フロー

## bandの有効値と意味
```

---

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
